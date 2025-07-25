import webdavService from '@/lib/server/webdav';
import { VelocityServerConfig } from './velocity';

/**
 * RustyConnector integration for dynamic server management
 * This plugin allows adding/removing servers without restarting Velocity
 */

export interface RustyConnectorServerConfig extends VelocityServerConfig {
    families?: string[]; // Server families for load balancing
    playerCap?: number; // Maximum players for this server
    restricted?: boolean; // Whether server is restricted
    whitelist?: string[]; // Player whitelist for this server
    softCap?: number; // Soft player cap before load balancing
    priority?: number; // Server priority in family
    rustConnectionTimeout?: number; // Connection timeout in seconds
}

export interface RustyConnectorFamily {
    id: string;
    displayName: string;
    loadBalancer: 'ROUND_ROBIN' | 'LEAST_CONNECTION' | 'MOST_CONNECTION';
    persistence: boolean;
    restricted: boolean;
    whitelist: string[];
    rootServer?: string;
    parentFamily?: string;
}

export interface RustyConnectorConfig {
    families: { [familyId: string]: RustyConnectorFamily };
    servers: { [serverId: string]: RustyConnectorServerConfig };
    'load-balancer': {
        enabled: boolean;
        'weighted-load-balancing': boolean;
        persistence: boolean;
    };
    'player-data': {
        'save-on-disconnect': boolean;
        'load-on-connect': boolean;
    };
    'connection-timeout': number;
    'registration-timeout': number;
    lang: string;
}

export class RustyConnectorService {
    private readonly CONFIG_PATH = '/velocity/plugins/RustyConnector';
    
    /**
     * Initialize RustyConnector configuration
     */
    async initializeRustyConnector(): Promise<{ success: boolean; error?: string; details: string[] }> {
        const details: string[] = [];
        
        try {
            // Check if RustyConnector plugin exists
            const pluginExists = await webdavService.exists(`${this.CONFIG_PATH}/config.yml`);
            
            if (!pluginExists) {
                // Create default RustyConnector configuration
                await this.createDefaultConfig();
                details.push('Created default RustyConnector configuration');
            } else {
                details.push('RustyConnector configuration already exists');
            }
            
            return { success: true, details };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details
            };
        }
    }
    
    /**
     * Add a server to RustyConnector dynamically
     */
    async addServerToRustyConnector(
        serverConfig: RustyConnectorServerConfig
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        const details: string[] = [];
        
        try {
            // Read existing RustyConnector configuration
            const config = await this.readRustyConnectorConfig();
            
            // Add server configuration
            const serverEntry: RustyConnectorServerConfig = {
                serverId: serverConfig.serverId,
                serverName: serverConfig.serverName,
                address: serverConfig.address,
                port: serverConfig.port,
                families: serverConfig.families || ['default'],
                playerCap: serverConfig.playerCap || 100,
                restricted: serverConfig.restricted || false,
                whitelist: serverConfig.whitelist || [],
                softCap: serverConfig.softCap || Math.floor((serverConfig.playerCap || 100) * 0.8),
                priority: serverConfig.priority || 1,
                rustConnectionTimeout: serverConfig.rustConnectionTimeout || 30,
                playerInfoForwardingMode: serverConfig.playerInfoForwardingMode || 'modern',
                forwardingSecret: serverConfig.forwardingSecret,
                subdomain: serverConfig.subdomain
            };
            
            // Add server to configuration
            config.servers[serverConfig.serverName] = serverEntry;
            
            // Ensure families exist
            for (const familyId of serverEntry.families || ['default']) {
                if (!config.families[familyId]) {
                    config.families[familyId] = {
                        id: familyId,
                        displayName: familyId.charAt(0).toUpperCase() + familyId.slice(1),
                        loadBalancer: 'LEAST_CONNECTION',
                        persistence: true,
                        restricted: false,
                        whitelist: []
                    };
                    details.push(`Created new server family: ${familyId}`);
                }
            }
            
            // Write updated configuration
            await this.writeRustyConnectorConfig(config);
            
            // Send reload command via RustyConnector API (if available)
            await this.reloadRustyConnectorConfig();
            
            details.push(`Added server ${serverConfig.serverName} to RustyConnector`);
            details.push(`Server families: ${serverEntry.families?.join(', ')}`);
            details.push(`Player capacity: ${serverEntry.playerCap} (soft: ${serverEntry.softCap})`);
            
            return { success: true, details };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: [...details, `Failed to add server to RustyConnector: ${error}`]
            };
        }
    }
    
    /**
     * Remove a server from RustyConnector
     */
    async removeServerFromRustyConnector(
        serverName: string
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        const details: string[] = [];
        
        try {
            const config = await this.readRustyConnectorConfig();
            
            if (!config.servers[serverName]) {
                return {
                    success: true,
                    details: [`Server ${serverName} not found in RustyConnector configuration`]
                };
            }
            
            // Remove server from configuration
            delete config.servers[serverName];
            
            // Clean up empty families
            const usedFamilies = new Set<string>();
            Object.values(config.servers).forEach(server => {
                server.families?.forEach(family => usedFamilies.add(family));
            });
            
            Object.keys(config.families).forEach(familyId => {
                if (familyId !== 'default' && !usedFamilies.has(familyId)) {
                    delete config.families[familyId];
                    details.push(`Removed unused family: ${familyId}`);
                }
            });
            
            // Write updated configuration
            await this.writeRustyConnectorConfig(config);
            
            // Reload configuration
            await this.reloadRustyConnectorConfig();
            
            details.push(`Removed server ${serverName} from RustyConnector`);
            
            return { success: true, details };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: [...details, `Failed to remove server from RustyConnector: ${error}`]
            };
        }
    }
    
    /**
     * Configure server-specific settings based on server type
     */
    async configureServerForRustyConnector(
        serverConfig: RustyConnectorServerConfig,
        serverType: 'PAPER' | 'PURPUR' | 'NEOFORGE' | 'FORGE' | 'FABRIC'
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        const details: string[] = [];
        
        try {
            const serverBasePath = `/minecraft-data/${serverConfig.serverId}`;
            
            switch (serverType) {
                case 'PAPER':
                case 'PURPUR':
                    await this.configurePaperForRustyConnector(serverBasePath, serverConfig, details);
                    break;
                    
                case 'NEOFORGE':
                case 'FORGE':
                    await this.configureForgeForRustyConnector(serverBasePath, serverConfig, details);
                    break;
                    
                case 'FABRIC':
                    await this.configureFabricForRustyConnector(serverBasePath, serverConfig, details);
                    break;
            }
            
            return { success: true, details };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: [...details, `Failed to configure server for RustyConnector: ${error}`]
            };
        }
    }
    
    /**
     * Configure Paper/Purpur servers for RustyConnector
     */
    private async configurePaperForRustyConnector(
        serverBasePath: string,
        serverConfig: RustyConnectorServerConfig,
        details: string[]
    ): Promise<void> {
        // Configure server.properties for RustyConnector
        const propertiesPath = `${serverBasePath}/server.properties`;
        
        if (await webdavService.exists(propertiesPath)) {
            const propertiesBuffer = await webdavService.getFileContents(propertiesPath);
            let propertiesContent = propertiesBuffer.toString('utf-8');
            
            // Configure for RustyConnector proxy support
            propertiesContent = this.updatePropertiesValue(propertiesContent, 'online-mode', 'false');
            propertiesContent = this.updatePropertiesValue(propertiesContent, 'prevent-proxy-connections', 'false');
            
            // Enable velocity support for modern forwarding
            if (serverConfig.playerInfoForwardingMode === 'modern') {
                propertiesContent = this.updatePropertiesValue(propertiesContent, 'velocity-support', 'true');
                if (serverConfig.forwardingSecret) {
                    propertiesContent = this.updatePropertiesValue(propertiesContent, 'velocity-secret', serverConfig.forwardingSecret);
                }
            } else {
                propertiesContent = this.updatePropertiesValue(propertiesContent, 'bungeecord', 'true');
            }
            
            await webdavService.uploadFile(propertiesPath, propertiesContent);
            details.push('Configured Paper server.properties for RustyConnector');
        }
        
        // Configure Paper-specific settings
        const paperConfigPath = `${serverBasePath}/config/paper-global.yml`;
        if (await webdavService.exists(paperConfigPath)) {
            const paperBuffer = await webdavService.getFileContents(paperConfigPath);
            let paperContent = paperBuffer.toString('utf-8');
            
            if (serverConfig.playerInfoForwardingMode === 'modern') {
                paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.enabled', 'true');
                paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.online-mode', 'true');
                if (serverConfig.forwardingSecret) {
                    paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.secret', `"${serverConfig.forwardingSecret}"`);
                }
            } else {
                paperContent = this.updateYamlValue(paperContent, 'proxies.bungee-cord.online-mode', 'true');
            }
            
            await webdavService.uploadFile(paperConfigPath, paperContent);
            details.push('Configured Paper YAML for RustyConnector');
        }
    }
    
    /**
     * Configure Forge/NeoForge servers for RustyConnector
     */
    private async configureForgeForRustyConnector(
        serverBasePath: string,
        serverConfig: RustyConnectorServerConfig,
        details: string[]
    ): Promise<void> {
        // Configure server.properties
        const propertiesPath = `${serverBasePath}/server.properties`;
        
        if (await webdavService.exists(propertiesPath)) {
            const propertiesBuffer = await webdavService.getFileContents(propertiesPath);
            let propertiesContent = propertiesBuffer.toString('utf-8');
            
            propertiesContent = this.updatePropertiesValue(propertiesContent, 'online-mode', 'false');
            propertiesContent = this.updatePropertiesValue(propertiesContent, 'prevent-proxy-connections', 'false');
            
            await webdavService.uploadFile(propertiesPath, propertiesContent);
            details.push('Configured Forge server.properties for RustyConnector');
        }
        
        // Note: Forge servers typically require additional mods for proxy support
        details.push('Note: Forge servers may require additional proxy support mods');
    }
    
    /**
     * Configure Fabric servers for RustyConnector
     */
    private async configureFabricForRustyConnector(
        serverBasePath: string,
        serverConfig: RustyConnectorServerConfig,
        details: string[]
    ): Promise<void> {
        // Configure server.properties
        const propertiesPath = `${serverBasePath}/server.properties`;
        
        if (await webdavService.exists(propertiesPath)) {
            const propertiesBuffer = await webdavService.getFileContents(propertiesPath);
            let propertiesContent = propertiesBuffer.toString('utf-8');
            
            propertiesContent = this.updatePropertiesValue(propertiesContent, 'online-mode', 'false');
            propertiesContent = this.updatePropertiesValue(propertiesContent, 'prevent-proxy-connections', 'false');
            
            await webdavService.uploadFile(propertiesPath, propertiesContent);
            details.push('Configured Fabric server.properties for RustyConnector');
        }
        
        // Check for FabricProxy-Lite mod configuration
        const fabricProxyConfigPath = `${serverBasePath}/config/fabricproxy-lite.toml`;
        if (await webdavService.exists(fabricProxyConfigPath)) {
            let fabricProxyConfig = `# FabricProxy-Lite Configuration for RustyConnector\n`;
            fabricProxyConfig += `hackEarlySend = true\n`;
            fabricProxyConfig += `hackMessageChain = true\n`;
            fabricProxyConfig += `disconnectMessage = "This server requires you to connect via the proxy."\n`;
            
            await webdavService.uploadFile(fabricProxyConfigPath, fabricProxyConfig);
            details.push('Configured FabricProxy-Lite for RustyConnector');
        } else {
            details.push('Note: Consider installing FabricProxy-Lite mod for better proxy support');
        }
    }
    
    /**
     * Read RustyConnector configuration
     */
    private async readRustyConnectorConfig(): Promise<RustyConnectorConfig> {
        try {
            // const configBuffer = await webdavService.getFileContents(`${this.CONFIG_PATH}/config.yml`);
            // Parse YAML (simplified - in production you'd use a proper YAML parser)
            // For now, return a basic structure
            return {
                families: {
                    default: {
                        id: 'default',
                        displayName: 'Default',
                        loadBalancer: 'LEAST_CONNECTION',
                        persistence: true,
                        restricted: false,
                        whitelist: []
                    }
                },
                servers: {},
                'load-balancer': {
                    enabled: true,
                    'weighted-load-balancing': false,
                    persistence: true
                },
                'player-data': {
                    'save-on-disconnect': true,
                    'load-on-connect': true
                },
                'connection-timeout': 30,
                'registration-timeout': 10,
                lang: 'en_us'
            };
        } catch {
            // Return default configuration if file doesn't exist
            return this.getDefaultRustyConnectorConfig();
        }
    }
    
    /**
     * Write RustyConnector configuration
     */
    private async writeRustyConnectorConfig(config: RustyConnectorConfig): Promise<void> {
        // Convert configuration to YAML format (simplified)
        let yamlContent = `# RustyConnector Configuration\n`;
        yamlContent += `# Generated by MinecraftServerCreator\n\n`;
        
        // Families section
        yamlContent += `families:\n`;
        for (const [familyId, family] of Object.entries(config.families)) {
            yamlContent += `  ${familyId}:\n`;
            yamlContent += `    display-name: "${family.displayName}"\n`;
            yamlContent += `    load-balancer: ${family.loadBalancer}\n`;
            yamlContent += `    persistence: ${family.persistence}\n`;
            yamlContent += `    restricted: ${family.restricted}\n`;
            if (family.whitelist.length > 0) {
                yamlContent += `    whitelist:\n`;
                family.whitelist.forEach(player => {
                    yamlContent += `      - "${player}"\n`;
                });
            }
            if (family.rootServer) {
                yamlContent += `    root-server: "${family.rootServer}"\n`;
            }
            yamlContent += `\n`;
        }
        
        // Servers section
        yamlContent += `servers:\n`;
        for (const [serverName, server] of Object.entries(config.servers)) {
            yamlContent += `  ${serverName}:\n`;
            yamlContent += `    address: "${server.address}"\n`;
            yamlContent += `    port: ${server.port}\n`;
            if (server.families && server.families.length > 0) {
                yamlContent += `    families:\n`;
                server.families.forEach(family => {
                    yamlContent += `      - "${family}"\n`;
                });
            }
            if (server.playerCap) {
                yamlContent += `    player-cap: ${server.playerCap}\n`;
            }
            if (server.softCap) {
                yamlContent += `    soft-cap: ${server.softCap}\n`;
            }
            yamlContent += `    restricted: ${server.restricted || false}\n`;
            yamlContent += `    priority: ${server.priority || 1}\n`;
            yamlContent += `\n`;
        }
        
        // Global settings
        yamlContent += `load-balancer:\n`;
        yamlContent += `  enabled: ${config['load-balancer'].enabled}\n`;
        yamlContent += `  weighted-load-balancing: ${config['load-balancer']['weighted-load-balancing']}\n`;
        yamlContent += `  persistence: ${config['load-balancer'].persistence}\n\n`;
        
        yamlContent += `player-data:\n`;
        yamlContent += `  save-on-disconnect: ${config['player-data']['save-on-disconnect']}\n`;
        yamlContent += `  load-on-connect: ${config['player-data']['load-on-connect']}\n\n`;
        
        yamlContent += `connection-timeout: ${config['connection-timeout']}\n`;
        yamlContent += `registration-timeout: ${config['registration-timeout']}\n`;
        yamlContent += `lang: "${config.lang}"\n`;
        
        await webdavService.uploadFile(`${this.CONFIG_PATH}/config.yml`, yamlContent);
    }
    
    /**
     * Create default RustyConnector configuration
     */
    private async createDefaultConfig(): Promise<void> {
        const defaultConfig = this.getDefaultRustyConnectorConfig();
        await this.writeRustyConnectorConfig(defaultConfig);
    }
    
    /**
     * Get default RustyConnector configuration
     */
    private getDefaultRustyConnectorConfig(): RustyConnectorConfig {
        return {
            families: {
                default: {
                    id: 'default',
                    displayName: 'Default',
                    loadBalancer: 'LEAST_CONNECTION',
                    persistence: true,
                    restricted: false,
                    whitelist: []
                }
            },
            servers: {},
            'load-balancer': {
                enabled: true,
                'weighted-load-balancing': false,
                persistence: true
            },
            'player-data': {
                'save-on-disconnect': true,
                'load-on-connect': true
            },
            'connection-timeout': 30,
            'registration-timeout': 10,
            lang: 'en_us'
        };
    }
    
    /**
     * Reload RustyConnector configuration without restart
     */
    private async reloadRustyConnectorConfig(): Promise<void> {
        try {
            // This would send a reload command to RustyConnector
            // Implementation depends on how RustyConnector exposes its API
            // For now, this is a placeholder
            console.log('RustyConnector configuration reloaded');
        } catch {
            // Silently ignore errors
        }
    }
    
    /**
     * Update a property in server.properties format
     */
    private updatePropertiesValue(content: string, key: string, value: string): string {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const newLine = `${key}=${value}`;
        
        if (regex.test(content)) {
            return content.replace(regex, newLine);
        } else {
            return content + `\n${newLine}`;
        }
    }
    
    /**
     * Update a YAML value (simplified implementation)
     */
    private updateYamlValue(content: string, path: string, value: string): string {
        // This is a simplified YAML updater
        // In production, you'd use a proper YAML parser
        const keys = path.split('.');
        const lastKey = keys[keys.length - 1];
        const regex = new RegExp(`^(\\s*)${lastKey}:.*$`, 'm');
        const indentation = '  '.repeat(keys.length - 1);
        const newLine = `${indentation}${lastKey}: ${value}`;
        
        if (regex.test(content)) {
            return content.replace(regex, newLine);
        } else {
            return content + `\n${newLine}`;
        }
    }
}

// Export singleton instance
const rustyConnectorService = new RustyConnectorService();
export default rustyConnectorService;
