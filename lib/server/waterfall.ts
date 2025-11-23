/**
 * Waterfall Proxy Integration Service
 * Handles configuration and registration of Minecraft servers with Waterfall proxy
 * Waterfall is an improved fork of BungeeCord with better performance and features
 */

import webdavService from '@/lib/server/webdav';
import { BungeeCordServerConfig, BungeeCordConfig } from './bungeecord';

export interface WaterfallServerConfig extends BungeeCordServerConfig {
    // Waterfall-specific configurations
    modernForwarding?: boolean;
    waterfallForwardingSecret?: string;
    compressionLevel?: number;
    enablePluginChannels?: boolean;
}

export interface WaterfallConfig extends BungeeCordConfig {
    // Waterfall-specific additions
    waterfall: {
        version: string;
        modern_forwarding_enabled: boolean;
        modern_forwarding_secret?: string;
        compression_level: number;
        plugin_channel_limit: number;
        log_initial_handler_connections: boolean;
        disable_modern_tab_limiter: boolean;
        log_player_commands: boolean;
    };
}

/**
 * Waterfall Network Integration Service
 * Extends BungeeCord functionality with Waterfall improvements
 */
class WaterfallService {
    private waterfallConfigPath: string;
    private waterfallNetworkName: string;

    constructor() {
        this.waterfallConfigPath = process.env.WATERFALL_CONFIG_PATH || '/waterfall/config.yml';
        this.waterfallNetworkName = process.env.WATERFALL_NETWORK_NAME || 'waterfall-network';
    }

    /**
     * Configure server for Waterfall proxy forwarding
     */
    async configureServerForWaterfall(
        serverConfig: WaterfallServerConfig,
        userEmail: string,
        uniqueId: string,
        configPath?: string,
        networkName?: string
    ): Promise<{ success: boolean; error?: string; details?: string[] }> {
        const details: string[] = [];
        
        // Use provided config path or fall back to instance default
        const targetConfigPath = configPath || this.waterfallConfigPath;
        const targetNetworkName = networkName || this.waterfallNetworkName;

        try {
            details.push(`Starting Waterfall server configuration (Config: ${targetConfigPath})...`);
            
            // Get server path
            const serverBasePath = `/servers/${userEmail}/${uniqueId}`;
            
            // Configure server.properties for Waterfall
            await this.configureServerProperties(serverBasePath, serverConfig, details);
            
            // Configure plugin-specific settings
            await this.configurePluginSettings(serverBasePath, serverConfig, details);
            
            // Add server to Waterfall configuration
            await this.addServerToWaterfallConfig(serverConfig, details, targetConfigPath);
            
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
     * Configure server.properties for Waterfall
     */
    private async configureServerProperties(
        serverBasePath: string,
        serverConfig: WaterfallServerConfig,
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
            
            // Waterfall specific properties
            properties['online-mode'] = 'false'; // Always false for proxy backend servers
            properties['prevent-proxy-connections'] = 'false'; // Allow proxy connections
            
            // Set server port
            if (serverConfig.port) {
                properties['server-port'] = serverConfig.port.toString();
            }
            
            // Set MOTD
            if (serverConfig.motd) {
                properties['motd'] = serverConfig.motd;
            }
            
            // Configure forwarding mode
            if (serverConfig.modernForwarding && serverConfig.playerInfoForwardingMode === 'modern') {
                // Modern forwarding (Velocity-style) supported in Waterfall
                properties['velocity-support'] = 'true';
                if (serverConfig.waterfallForwardingSecret) {
                    properties['velocity-secret'] = serverConfig.waterfallForwardingSecret;
                }
                details.push('Configured for modern forwarding (Velocity-style)');
            } else {
                // Legacy BungeeCord forwarding
                properties['bungeecord'] = 'true';
                details.push('Configured for legacy BungeeCord forwarding');
            }
            
            // Convert properties back to file format
            const propertiesContent = Object.entries(properties)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
            
            await webdavService.uploadFile(propertiesPath, propertiesContent);
            details.push('Configured server.properties for Waterfall');
            
        } catch (error) {
            details.push(`Warning: Could not configure server.properties: ${error}`);
        }
    }

    /**
     * Configure plugin-specific settings for Waterfall
     */
    private async configurePluginSettings(
        serverBasePath: string,
        serverConfig: WaterfallServerConfig,
        details: string[]
    ): Promise<void> {
        // Configure Spigot/Paper specific settings
        await this.configureSpigotYml(serverBasePath, serverConfig, details);
        await this.configurePaperYml(serverBasePath, serverConfig, details);
    }

    /**
     * Configure spigot.yml for Waterfall
     */
    private async configureSpigotYml(
        serverBasePath: string,
        serverConfig: WaterfallServerConfig,
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
            
            if (serverConfig.modernForwarding) {
                // For modern forwarding, disable BungeeCord mode in favor of Velocity support
                spigotContent = this.updateYamlValue(spigotContent, 'settings.bungeecord', 'false');
                details.push('Disabled BungeeCord mode in spigot.yml (using modern forwarding)');
            } else {
                // Enable BungeeCord mode in spigot.yml for legacy forwarding
                spigotContent = this.updateYamlValue(spigotContent, 'settings.bungeecord', 'true');
                details.push('Enabled BungeeCord mode in spigot.yml');
            }
            
            await webdavService.uploadFile(spigotYmlPath, spigotContent);
            details.push('Updated spigot.yml for Waterfall');
            
        } catch (error) {
            details.push(`Warning: Could not configure spigot.yml: ${error}`);
        }
    }

    /**
     * Configure Paper configuration for Waterfall
     */
    private async configurePaperYml(
        serverBasePath: string,
        serverConfig: WaterfallServerConfig,
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
            
            if (serverConfig.modernForwarding && serverConfig.playerInfoForwardingMode === 'modern') {
                // Configure modern Velocity-style forwarding
                paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.enabled', 'true');
                paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.online-mode', 'true');
                if (serverConfig.waterfallForwardingSecret) {
                    paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.secret', `"${serverConfig.waterfallForwardingSecret}"`);
                }
                paperContent = this.updateYamlValue(paperContent, 'proxies.bungee-cord.online-mode', 'false');
                details.push('Configured Paper for modern Velocity-style forwarding');
            } else {
                // Configure legacy BungeeCord forwarding
                paperContent = this.updateYamlValue(paperContent, 'proxies.bungee-cord.online-mode', 'true');
                paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.enabled', 'false');
                details.push('Configured Paper for legacy BungeeCord forwarding');
            }
            
            await webdavService.uploadFile(paperConfigPath, paperContent);
            details.push('Updated Paper configuration for Waterfall');
            
        } catch (error) {
            details.push(`Warning: Could not configure Paper: ${error}`);
        }
    }

    /**
     * Add server to Waterfall configuration
     */
    private async addServerToWaterfallConfig(
        serverConfig: WaterfallServerConfig,
        details: string[],
        configPath: string = this.waterfallConfigPath
    ): Promise<void> {
        details.push('Adding server to Waterfall configuration...');
        
        try {
            // Read existing Waterfall configuration
            const waterfallConfig = await this.readWaterfallConfig(configPath);
            
            // Add server to the configuration (same as BungeeCord)
            const serverEntry = {
                motd: serverConfig.motd || serverConfig.serverName,
                address: serverConfig.address,
                restricted: serverConfig.restrictedToProxy || false
            };
            
            waterfallConfig.servers[serverConfig.serverName] = serverEntry;
            
            // Add to priorities list if not already present
            const listener = waterfallConfig.listeners[0];
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
            
            // Configure Waterfall-specific settings
            if (serverConfig.modernForwarding) {
                waterfallConfig.waterfall.modern_forwarding_enabled = true;
                if (serverConfig.waterfallForwardingSecret) {
                    waterfallConfig.waterfall.modern_forwarding_secret = serverConfig.waterfallForwardingSecret;
                }
            }
            
            // Write updated configuration back to WebDAV
            await this.writeWaterfallConfig(waterfallConfig, configPath);
            
            details.push(`Server added to Waterfall configuration: ${serverConfig.serverName}`);
            details.push(`Server address: ${serverConfig.address}`);
            
        } catch (error) {
            // Fallback: create configuration snippet for manual integration
            details.push(`Warning: Could not update Waterfall config directly: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            const waterfallServerEntry = {
                [serverConfig.serverName]: {
                    motd: serverConfig.motd || serverConfig.serverName,
                    address: serverConfig.address,
                    restricted: serverConfig.restrictedToProxy || false
                }
            };
            
            details.push('Manual configuration required:');
            details.push(`Add to config.yml servers section: ${JSON.stringify(waterfallServerEntry, null, 2)}`);
        }
    }

    /**
     * Read Waterfall configuration
     */
    private async readWaterfallConfig(configPath: string = this.waterfallConfigPath): Promise<WaterfallConfig> {
        try {
            await webdavService.getFileContents(configPath);
            return this.parseWaterfallConfig();
        } catch {
            // Return default configuration if file doesn't exist
            return this.getDefaultWaterfallConfig();
        }
    }

    /**
     * Write Waterfall configuration
     */
    private async writeWaterfallConfig(config: WaterfallConfig, configPath: string = this.waterfallConfigPath): Promise<void> {
        try {
            const yamlContent = this.serializeWaterfallConfig(config);
            await webdavService.uploadFile(configPath, yamlContent);
        } catch (error) {
            throw new Error(`Failed to write Waterfall configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get default Waterfall configuration
     */
    private getDefaultWaterfallConfig(): WaterfallConfig {
        return {
            ...this.getDefaultBungeeCordConfig(),
            waterfall: {
                version: '1.19',
                modern_forwarding_enabled: false,
                compression_level: 6,
                plugin_channel_limit: 128,
                log_initial_handler_connections: false,
                disable_modern_tab_limiter: false,
                log_player_commands: false
            }
        };
    }

    /**
     * Get default BungeeCord configuration (inherited)
     */
    private getDefaultBungeeCordConfig() {
        return {
            listeners: [{
                motd: 'A Waterfall Server',
                tab_list: 'GLOBAL_PING' as const,
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
     * Parse Waterfall YAML configuration
     */
    private parseWaterfallConfig(): WaterfallConfig {
        // Simplified YAML parsing for Waterfall config
        // In production, you would use a proper YAML parser
        
        const config = this.getDefaultWaterfallConfig();
        
        // Basic parsing logic would go here
        // For now, return default config
        return config;
    }

    /**
     * Serialize Waterfall configuration to YAML
     */
    private serializeWaterfallConfig(config: WaterfallConfig): string {
        // Start with BungeeCord serialization
        let yaml = this.serializeBungeeCordConfig(config);
        
        // Add Waterfall-specific configuration
        yaml += `\n# Waterfall Configuration\n`;
        yaml += `waterfall:\n`;
        yaml += `  version: '${config.waterfall.version}'\n`;
        yaml += `  modern_forwarding_enabled: ${config.waterfall.modern_forwarding_enabled}\n`;
        
        if (config.waterfall.modern_forwarding_secret) {
            yaml += `  modern_forwarding_secret: '${config.waterfall.modern_forwarding_secret}'\n`;
        }
        
        yaml += `  compression_level: ${config.waterfall.compression_level}\n`;
        yaml += `  plugin_channel_limit: ${config.waterfall.plugin_channel_limit}\n`;
        yaml += `  log_initial_handler_connections: ${config.waterfall.log_initial_handler_connections}\n`;
        yaml += `  disable_modern_tab_limiter: ${config.waterfall.disable_modern_tab_limiter}\n`;
        yaml += `  log_player_commands: ${config.waterfall.log_player_commands}\n`;
        
        return yaml;
    }

    /**
     * Serialize BungeeCord configuration to YAML (inherited)
     */
    private serializeBungeeCordConfig(config: WaterfallConfig): string {
        // Simplified YAML serialization (same as BungeeCord)
        let yaml = `# Waterfall Configuration\n`;
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
                for (const server of (servers as string[])) {
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
     * Remove server from Waterfall configuration
     */
    async removeServerFromWaterfall(
        serverName: string
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        const details: string[] = [];
        
        try {
            const config = await this.readWaterfallConfig();
            
            if (!config.servers[serverName]) {
                return {
                    success: true,
                    details: [`Server ${serverName} not found in Waterfall configuration`]
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
            await this.writeWaterfallConfig(config);
            
            details.push(`Removed server ${serverName} from Waterfall`);
            return { success: true, details };
            
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: [...details, `Failed to remove server from Waterfall: ${error}`]
            };
        }
    }

    /**
     * Test Waterfall modern forwarding compatibility
     */
    async testModernForwardingCompatibility(
        serverConfig: WaterfallServerConfig
    ): Promise<{ compatible: boolean; recommendations: string[]; warnings: string[] }> {
        const recommendations: string[] = [];
        const warnings: string[] = [];
        
        const compatible = true;
        
        if (serverConfig.modernForwarding) {
            if (!serverConfig.waterfallForwardingSecret) {
                warnings.push('Modern forwarding enabled but no secret provided');
                recommendations.push('Set waterfallForwardingSecret for secure modern forwarding');
            }
            
            if (serverConfig.playerInfoForwardingMode !== 'modern') {
                warnings.push('Modern forwarding enabled but playerInfoForwardingMode is not set to modern');
                recommendations.push('Set playerInfoForwardingMode to "modern" for consistency');
            }
            
            recommendations.push('Ensure Paper/Spigot server supports Velocity-style forwarding');
            recommendations.push('Test server connectivity after enabling modern forwarding');
        } else {
            recommendations.push('Consider enabling modern forwarding for better performance and security');
            recommendations.push('Modern forwarding is compatible with Paper 1.13+ servers');
        }
        
        return { compatible, recommendations, warnings };
    }
}

// Export singleton instance
const waterfallService = new WaterfallService();
export default waterfallService;
