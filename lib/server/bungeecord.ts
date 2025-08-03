/**
 * BungeeCord Proxy Integration Service
 * Handles configuration and registration of Minecraft servers with BungeeCord proxy
 */

import webdavService from '@/lib/server/webdav';
import { VelocityServerConfig } from './velocity';

export interface BungeeCordServerConfig extends VelocityServerConfig {
    // BungeeCord-specific configurations
    fallbackServer?: boolean;
    permission?: string;
    autoReconnect?: boolean;
    reconnectNotifyMessage?: boolean;
}

export interface BungeeCordConfig {
    listeners: Array<{
        motd: string;
        tab_list: 'GLOBAL_PING' | 'SERVER';
        query_port: number;
        query_enabled: boolean;
        proxy_protocol: boolean;
        ping_passthrough: boolean;
        priorities: string[];
        bind_local_address: boolean;
        host: string;
        max_players: number;
        tab_size: number;
        forced_hosts: Record<string, string[]>;
    }>;
    remote_ping_cache: number;
    network_compression_threshold: number;
    prevent_proxy_connections: boolean;
    player_limit: number;
    ip_forward: boolean;
    online_mode: boolean;
    disabled_commands: string[];
    servers: Record<string, {
        motd: string;
        address: string;
        restricted: boolean;
    }>;
    timeout: number;
    groups: Record<string, string[]>;
    connection_throttle: number;
    stats: string;
    permissions: Record<string, string[]>;
}

/**
 * BungeeCord Network Integration Service
 */
class BungeeCordService {
    private bungeeCordConfigPath: string;
    private bungeeCordNetworkName: string;

    constructor() {
        this.bungeeCordConfigPath = process.env.BUNGEECORD_CONFIG_PATH || '/bungeecord/config.yml';
        this.bungeeCordNetworkName = process.env.BUNGEECORD_NETWORK_NAME || 'bungeecord-network';
    }

    /**
     * Configure server for BungeeCord proxy forwarding
     */
    async configureServerForBungeeCord(
        serverConfig: BungeeCordServerConfig,
        userEmail: string,
        uniqueId: string
    ): Promise<{ success: boolean; error?: string; details?: string[] }> {
        const details: string[] = [];
        
        try {
            details.push('Starting BungeeCord server configuration...');
            
            // Get server path
            const serverBasePath = `/servers/${userEmail}/${uniqueId}`;
            
            // Configure server.properties for BungeeCord
            await this.configureServerProperties(serverBasePath, serverConfig, details);
            
            // Configure plugin-specific settings
            await this.configurePluginSettings(serverBasePath, serverConfig, details);
            
            // Add server to BungeeCord configuration
            await this.addServerToBungeeCordConfig(serverConfig, details);
            
            return { success: true, details };
            
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: [...details, `Configuration failed: ${error}`]
            };
        }
    }

    /**
     * Configure server.properties for BungeeCord
     */
    private async configureServerProperties(
        serverBasePath: string,
        serverConfig: BungeeCordServerConfig,
        details: string[]
    ): Promise<void> {
        const propertiesPath = `${serverBasePath}/server.properties`;
        
        try {
            let properties: Record<string, string> = {};
            
            // Read existing properties if available
            const propertiesExists = await webdavService.exists(propertiesPath);
            if (propertiesExists) {
                const propertiesBuffer = await webdavService.getFileContents(propertiesPath);
                const propertiesContent = propertiesBuffer.toString('utf-8');
                properties = this.parseProperties(propertiesContent);
            }
            
            // BungeeCord specific properties
            properties['online-mode'] = 'false'; // Always false for BungeeCord backend servers
            properties['bungeecord'] = 'true'; // Enable BungeeCord support
            properties['prevent-proxy-connections'] = 'false'; // Allow proxy connections
            
            // Set server port
            if (serverConfig.port) {
                properties['server-port'] = serverConfig.port.toString();
            }
            
            // Set MOTD
            if (serverConfig.motd) {
                properties['motd'] = serverConfig.motd;
            }
            
            // IP forwarding settings
            if (serverConfig.playerInfoForwardingMode === 'legacy') {
                // Legacy BungeeCord forwarding
                properties['bungeecord'] = 'true';
                details.push('Configured for legacy BungeeCord forwarding');
            }
            
            // Convert properties back to file format
            const propertiesContent = Object.entries(properties)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
            
            await webdavService.uploadFile(propertiesPath, propertiesContent);
            details.push('Configured server.properties for BungeeCord');
            
        } catch (error) {
            details.push(`Warning: Could not configure server.properties: ${error}`);
        }
    }

    /**
     * Configure plugin-specific settings for BungeeCord
     */
    private async configurePluginSettings(
        serverBasePath: string,
        serverConfig: BungeeCordServerConfig,
        details: string[]
    ): Promise<void> {
        // Configure Spigot/Paper specific settings
        await this.configureSpigotYml(serverBasePath, serverConfig, details);
        await this.configurePaperYml(serverBasePath, serverConfig, details);
    }

    /**
     * Configure spigot.yml for BungeeCord
     */
    private async configureSpigotYml(
        serverBasePath: string,
        serverConfig: BungeeCordServerConfig,
        details: string[]
    ): Promise<void> {
        const spigotYmlPath = `${serverBasePath}/spigot.yml`;
        
        try {
            const spigotExists = await webdavService.exists(spigotYmlPath);
            if (!spigotExists) {
                details.push('spigot.yml not found, skipping Spigot configuration');
                return;
            }
            
            const spigotBuffer = await webdavService.getFileContents(spigotYmlPath);
            let spigotContent = spigotBuffer.toString('utf-8');
            
            // Enable BungeeCord mode in spigot.yml
            spigotContent = this.updateYamlValue(spigotContent, 'settings.bungeecord', 'true');
            details.push('Enabled BungeeCord mode in spigot.yml');
            
            await webdavService.uploadFile(spigotYmlPath, spigotContent);
            details.push('Updated spigot.yml for BungeeCord');
            
        } catch (error) {
            details.push(`Warning: Could not configure spigot.yml: ${error}`);
        }
    }

    /**
     * Configure Paper configuration for BungeeCord
     */
    private async configurePaperYml(
        serverBasePath: string,
        serverConfig: BungeeCordServerConfig,
        details: string[]
    ): Promise<void> {
        // Try multiple possible Paper config paths
        const paperConfigPaths = [
            `${serverBasePath}/config/paper-global.yml`,
            `${serverBasePath}/paper.yml`,
            `${serverBasePath}/config/paper.yml`
        ];
        
        let paperConfigPath: string | null = null;
        for (const path of paperConfigPaths) {
            if (await webdavService.exists(path)) {
                paperConfigPath = path;
                break;
            }
        }
        
        if (!paperConfigPath) {
            details.push('Paper configuration not found, skipping Paper-specific setup');
            return;
        }
        
        try {
            const paperBuffer = await webdavService.getFileContents(paperConfigPath);
            let paperContent = paperBuffer.toString('utf-8');
            
            // Configure BungeeCord forwarding in Paper
            paperContent = this.updateYamlValue(paperContent, 'proxies.bungee-cord.online-mode', 'true');
            paperContent = this.updateYamlValue(paperContent, 'settings.velocity-support.enabled', 'false');
            
            await webdavService.uploadFile(paperConfigPath, paperContent);
            details.push('Updated Paper configuration for BungeeCord');
            
        } catch (error) {
            details.push(`Warning: Could not configure Paper: ${error}`);
        }
    }

    /**
     * Add server to BungeeCord configuration
     */
    private async addServerToBungeeCordConfig(
        serverConfig: BungeeCordServerConfig,
        details: string[]
    ): Promise<void> {
        details.push('Adding server to BungeeCord configuration...');
        
        try {
            // Read existing BungeeCord configuration
            const bungeeCordConfig = await this.readBungeeCordConfig();
            
            // Add server to the configuration
            const serverEntry = {
                motd: serverConfig.motd || serverConfig.serverName,
                address: serverConfig.address,
                restricted: serverConfig.restrictedToProxy || false
            };
            
            bungeeCordConfig.servers[serverConfig.serverName] = serverEntry;
            
            // Add to priorities list if not already present
            const listener = bungeeCordConfig.listeners[0];
            if (listener && !listener.priorities.includes(serverConfig.serverName)) {
                listener.priorities.push(serverConfig.serverName);
                
                // Set as fallback server if specified
                if (serverConfig.fallbackServer) {
                    listener.priorities.unshift(serverConfig.serverName);
                }
            }
            
            // Add forced host mapping if subdomain is provided
            if (serverConfig.subdomain && listener) {
                const forcedHostDomain = `${serverConfig.subdomain}.mc.etran.dev`;
                
                if (!listener.forced_hosts) {
                    listener.forced_hosts = {};
                }
                
                listener.forced_hosts[forcedHostDomain] = [serverConfig.serverName];
                details.push(`Added forced host mapping: ${forcedHostDomain} -> ${serverConfig.serverName}`);
            }
            
            // Write updated configuration back to WebDAV
            await this.writeBungeeCordConfig(bungeeCordConfig);
            
            details.push(`Server added to BungeeCord configuration: ${serverConfig.serverName}`);
            details.push(`Server address: ${serverConfig.address}`);
            
        } catch (error) {
            // Fallback: create configuration snippet for manual integration
            details.push(`Warning: Could not update BungeeCord config directly: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            const bungeeCordServerEntry = {
                [serverConfig.serverName]: {
                    motd: serverConfig.motd || serverConfig.serverName,
                    address: serverConfig.address,
                    restricted: serverConfig.restrictedToProxy || false
                }
            };
            
            details.push('Manual configuration required:');
            details.push(`Add to config.yml servers section: ${JSON.stringify(bungeeCordServerEntry, null, 2)}`);
        }
    }

    /**
     * Read BungeeCord configuration
     */
    private async readBungeeCordConfig(): Promise<BungeeCordConfig> {
        try {
            const configBuffer = await webdavService.getFileContents(this.bungeeCordConfigPath);
            const configContent = configBuffer.toString('utf-8');
            return this.parseBungeeCordConfig(configContent);
        } catch {
            // Return default configuration if file doesn't exist
            return this.getDefaultBungeeCordConfig();
        }
    }

    /**
     * Write BungeeCord configuration
     */
    private async writeBungeeCordConfig(config: BungeeCordConfig): Promise<void> {
        try {
            const yamlContent = this.serializeBungeeCordConfig(config);
            await webdavService.uploadFile(this.bungeeCordConfigPath, yamlContent);
        } catch (error) {
            throw new Error(`Failed to write BungeeCord configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get default BungeeCord configuration
     */
    private getDefaultBungeeCordConfig(): BungeeCordConfig {
        return {
            listeners: [{
                motd: 'A BungeeCord Server',
                tab_list: 'GLOBAL_PING',
                query_port: 25577,
                query_enabled: false,
                proxy_protocol: false,
                ping_passthrough: false,
                priorities: [],
                bind_local_address: true,
                host: '0.0.0.0:25565',
                max_players: 1000,
                tab_size: 60,
                forced_hosts: {}
            }],
            remote_ping_cache: -1,
            network_compression_threshold: 256,
            prevent_proxy_connections: false,
            player_limit: -1,
            ip_forward: true,
            online_mode: true,
            disabled_commands: ['disabler'],
            servers: {},
            timeout: 30000,
            groups: {},
            connection_throttle: 4000,
            stats: '',
            permissions: {}
        };
    }

    /**
     * Parse BungeeCord YAML configuration
     */
    private parseBungeeCordConfig(content: string): BungeeCordConfig {
        // Simplified YAML parsing for BungeeCord config
        // In production, you would use a proper YAML parser
        
        const config = this.getDefaultBungeeCordConfig();
        
        // Basic parsing logic would go here
        // For now, return default config
        return config;
    }

    /**
     * Serialize BungeeCord configuration to YAML
     */
    private serializeBungeeCordConfig(config: BungeeCordConfig): string {
        // Simplified YAML serialization
        // In production, you would use a proper YAML serializer
        
        let yaml = `# BungeeCord Configuration\n`;
        yaml += `# Generated by MinecraftServerCreator\n\n`;
        
        // Listeners section
        yaml += `listeners:\n`;
        for (const listener of config.listeners) {
            yaml += `- query_port: ${listener.query_port}\n`;
            yaml += `  motd: '${listener.motd}'\n`;
            yaml += `  tab_list: ${listener.tab_list}\n`;
            yaml += `  query_enabled: ${listener.query_enabled}\n`;
            yaml += `  proxy_protocol: ${listener.proxy_protocol}\n`;
            yaml += `  ping_passthrough: ${listener.ping_passthrough}\n`;
            yaml += `  priorities:\n`;
            for (const priority of listener.priorities) {
                yaml += `  - ${priority}\n`;
            }
            yaml += `  bind_local_address: ${listener.bind_local_address}\n`;
            yaml += `  host: ${listener.host}\n`;
            yaml += `  max_players: ${listener.max_players}\n`;
            yaml += `  tab_size: ${listener.tab_size}\n`;
            yaml += `  forced_hosts:\n`;
            for (const [host, servers] of Object.entries(listener.forced_hosts)) {
                yaml += `    ${host}:\n`;
                for (const server of servers) {
                    yaml += `    - ${server}\n`;
                }
            }
        }
        
        // Other configuration sections
        yaml += `remote_ping_cache: ${config.remote_ping_cache}\n`;
        yaml += `network_compression_threshold: ${config.network_compression_threshold}\n`;
        yaml += `prevent_proxy_connections: ${config.prevent_proxy_connections}\n`;
        yaml += `player_limit: ${config.player_limit}\n`;
        yaml += `ip_forward: ${config.ip_forward}\n`;
        yaml += `online_mode: ${config.online_mode}\n`;
        
        yaml += `disabled_commands:\n`;
        for (const cmd of config.disabled_commands) {
            yaml += `- ${cmd}\n`;
        }
        
        yaml += `servers:\n`;
        for (const [name, server] of Object.entries(config.servers)) {
            yaml += `  ${name}:\n`;
            yaml += `    motd: '${server.motd}'\n`;
            yaml += `    address: ${server.address}\n`;
            yaml += `    restricted: ${server.restricted}\n`;
        }
        
        yaml += `timeout: ${config.timeout}\n`;
        yaml += `connection_throttle: ${config.connection_throttle}\n`;
        yaml += `stats: '${config.stats}'\n`;
        
        return yaml;
    }

    /**
     * Parse properties file content
     */
    private parseProperties(content: string): Record<string, string> {
        const properties: Record<string, string> = {};
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...valueParts] = trimmed.split('=');
                if (key && valueParts.length > 0) {
                    properties[key.trim()] = valueParts.join('=').trim();
                }
            }
        }
        
        return properties;
    }

    /**
     * Update a YAML value (simplified implementation)
     */
    private updateYamlValue(content: string, path: string, value: string): string {
        const keys = path.split('.');
        const regex = new RegExp(`^(\\s*)${keys[keys.length - 1]}:\\s*.*$`, 'm');
        const newLine = `${keys[keys.length - 1]}: ${value}`;
        
        if (regex.test(content)) {
            return content.replace(regex, `$1${newLine}`);
        } else {
            return content + `\n${newLine}`;
        }
    }

    /**
     * Remove server from BungeeCord configuration
     */
    async removeServerFromBungeeCord(
        serverName: string
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        const details: string[] = [];
        
        try {
            const config = await this.readBungeeCordConfig();
            
            if (!config.servers[serverName]) {
                return {
                    success: true,
                    details: [`Server ${serverName} not found in BungeeCord configuration`]
                };
            }
            
            // Remove server from configuration
            delete config.servers[serverName];
            
            // Remove from priorities list
            for (const listener of config.listeners) {
                const index = listener.priorities.indexOf(serverName);
                if (index > -1) {
                    listener.priorities.splice(index, 1);
                }
                
                // Remove from forced hosts
                for (const [host, servers] of Object.entries(listener.forced_hosts)) {
                    const serverIndex = servers.indexOf(serverName);
                    if (serverIndex > -1) {
                        servers.splice(serverIndex, 1);
                        if (servers.length === 0) {
                            delete listener.forced_hosts[host];
                        }
                    }
                }
            }
            
            // Write updated configuration
            await this.writeBungeeCordConfig(config);
            
            details.push(`Removed server ${serverName} from BungeeCord`);
            return { success: true, details };
            
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: [...details, `Failed to remove server from BungeeCord: ${error}`]
            };
        }
    }
}

// Export singleton instance
const bungeeCordService = new BungeeCordService();
export default bungeeCordService;
