import webdavService from '@/lib/server/webdav';
import portainer from '@/lib/server/portainer';

export interface VelocityServerConfig {
    serverId: string;
    serverName: string;
    address: string;
    port: number;
    motd?: string;
    restrictedToProxy?: boolean;
    playerInfoForwardingMode?: 'none' | 'legacy' | 'modern';
    forwardingSecret?: string;
    subdomain?: string; // User-chosen subdomain for forced host mapping
}

export interface VelocityBackendServer {
    [serverName: string]: {
        address: string;
        restricted?: boolean;
        'player-info-forwarding-mode'?: 'none' | 'legacy' | 'modern';
        'forwarding-secret'?: string;
    };
}

export interface VelocityConfig {
    'config-version': string;
    bind: string;
    motd: string;
    'show-max-players': number;
    'online-mode': boolean;
    'force-key-authentication': boolean;
    'prevent-client-proxy-connections': boolean;
    'player-info-forwarding-mode': 'none' | 'legacy' | 'modern';
    'forwarding-secret': string;
    servers: VelocityBackendServer;
    'try': string[];
    'forced-hosts': Record<string, string[]>;
}

/**
 * Velocity Network Integration Service
 * Handles configuration and registration of Minecraft servers with Velocity proxy
 */
class VelocityService {
    private velocityConfigPath: string;
    private velocityNetworkName: string;

    constructor() {
        // Defaults
        this.velocityConfigPath = '/velocity/velocity.toml';
        this.velocityNetworkName = 'velocity-network';
    }

    /**
     * Configure server for Velocity proxy forwarding
     * @param serverConfig - The server configuration to set up for Velocity
     * @param userEmail - User email for file path construction
     * @param uniqueId - Server unique identifier
     * @param configPath - Optional: Path to velocity.toml (overrides env var)
     * @param networkName - Optional: Docker network name (overrides env var)
     */
    async configureServerForVelocity(
        serverConfig: VelocityServerConfig,
        userEmail: string,
        uniqueId: string,
        configPath?: string,
        networkName?: string
    ): Promise<{ success: boolean; error?: string; details?: string[] }> {
        const details: string[] = [];
        
        // Use provided config path or fall back to instance default
        const targetConfigPath = configPath || this.velocityConfigPath;
        const targetNetworkName = networkName || this.velocityNetworkName;
        
        try {
            details.push(`Starting Velocity server configuration (Config: ${targetConfigPath})...`);
            
            // Get server path
            const userFolder = userEmail.split('@')[0];
            const serverBasePath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${userFolder}/${uniqueId}`;
            
            // Configure server.properties for Velocity
            await this.configureServerProperties(serverBasePath, serverConfig, details);
            
            // Configure plugin-specific settings if needed
            await this.configurePluginSettings(serverBasePath, serverConfig, details);
            
            // Add server to Velocity configuration
            await this.addServerToVelocityConfig(serverConfig, details, targetConfigPath);
            
            details.push('Velocity configuration completed successfully');
            
            return { success: true, details };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            details.push(`Velocity configuration failed: ${errorMessage}`);
            
            return {
                success: false,
                error: errorMessage,
                details
            };
        }
    }

    /**
     * Configure server.properties for Velocity forwarding
     */
    private async configureServerProperties(
        serverBasePath: string,
        serverConfig: VelocityServerConfig,
        details: string[]
    ): Promise<void> {
        details.push('Configuring server.properties for Velocity...');
        
        const serverPropertiesPath = `${serverBasePath}/server.properties`;
        
        // Check if server.properties exists
        const propertiesExist = await webdavService.exists(serverPropertiesPath);
        
        let propertiesContent = '';
        if (propertiesExist) {
            const propertiesBuffer = await webdavService.getFileContents(serverPropertiesPath);
            propertiesContent = propertiesBuffer.toString('utf-8');
        }
        
        // Parse existing properties
        const properties = this.parseServerProperties(propertiesContent);
        
        // Configure for Velocity
        if (serverConfig.playerInfoForwardingMode === 'legacy') {
            // Legacy forwarding (BungeeCord mode) for <1.13 support
            properties['online-mode'] = 'false';
            properties['bungeecord'] = 'true'; // For Spigot/Paper servers
            properties['prevent-proxy-connections'] = 'false'; // Allow proxy connections
            details.push('Configured for legacy forwarding (BungeeCord mode)');
        } else if (serverConfig.playerInfoForwardingMode === 'modern') {
            // Modern forwarding for 1.13+ 
            properties['online-mode'] = 'false';
            properties['velocity-support'] = 'true'; // For Paper servers
            properties['prevent-proxy-connections'] = 'false'; // Allow proxy connections
            if (serverConfig.forwardingSecret) {
                properties['velocity-secret'] = serverConfig.forwardingSecret;
            }
            details.push('Configured for modern forwarding');
        } else {
            // No forwarding
            properties['online-mode'] = 'true';
            details.push('Configured with no proxy forwarding');
        }
        
        // Additional Velocity-friendly settings
        if (serverConfig.playerInfoForwardingMode === 'legacy' || serverConfig.playerInfoForwardingMode === 'modern') {
            // Disable authentication since proxy handles it
            properties['enforce-secure-profile'] = 'false';
            properties['require-resource-pack'] = 'false';
            
            // Network optimization for proxy environments
            properties['network-compression-threshold'] = '256';
            properties['enable-query'] = 'false'; // Query is handled by proxy
            
            details.push('Applied additional Velocity-compatible settings');
        }
        
        // Generate updated server.properties content
        const updatedContent = this.generateServerProperties(properties);
        
        // Upload updated server.properties
        await webdavService.uploadFile(serverPropertiesPath, updatedContent);
        details.push('Updated server.properties with Velocity settings');
    }

    /**
     * Configure plugin-specific settings for Velocity
     */
    private async configurePluginSettings(
        serverBasePath: string,
        serverConfig: VelocityServerConfig,
        details: string[]
    ): Promise<void> {
        // Configure Spigot/Paper specific settings
        await this.configureSpigotYml(serverBasePath, serverConfig, details);
        await this.configurePaperYml(serverBasePath, serverConfig, details);
    }

    /**
     * Configure spigot.yml for Velocity
     */
    private async configureSpigotYml(
        serverBasePath: string,
        serverConfig: VelocityServerConfig,
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
            
            if (serverConfig.playerInfoForwardingMode === 'legacy') {
                // Enable BungeeCord mode in spigot.yml
                spigotContent = this.updateYamlValue(spigotContent, 'settings.bungeecord', 'true');
                details.push('Enabled BungeeCord mode in spigot.yml');
            }
            
            await webdavService.uploadFile(spigotYmlPath, spigotContent);
            
        } catch (error) {
            details.push(`Warning: Could not configure spigot.yml - ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Configure paper-global.yml or paper.yml for Velocity
     */
    private async configurePaperYml(
        serverBasePath: string,
        serverConfig: VelocityServerConfig,
        details: string[]
    ): Promise<void> {
        // Try modern Paper configuration first (paper-global.yml)
        let paperConfigPath = `${serverBasePath}/config/paper-global.yml`;
        let paperExists = await webdavService.exists(paperConfigPath);
        
        if (!paperExists) {
            // Fallback to legacy paper.yml
            paperConfigPath = `${serverBasePath}/paper.yml`;
            paperExists = await webdavService.exists(paperConfigPath);
        }
        
        if (!paperExists) {
            details.push('Paper configuration not found, skipping Paper-specific setup');
            // For Velocity integration, we'll rely on server.properties configuration instead
            details.push('Note: Modern Paper servers will auto-detect Velocity forwarding from server.properties');
            return;
        }
        
        try {
            const paperBuffer = await webdavService.getFileContents(paperConfigPath);
            let paperContent = paperBuffer.toString('utf-8');
            
            // Only modify existing Paper configuration if it already exists
            // Avoid creating new configuration files that might cause permission issues
            if (serverConfig.playerInfoForwardingMode === 'modern') {
                // Configure modern Velocity forwarding only if the sections already exist
                if (paperContent.includes('proxies:') || paperContent.includes('velocity:')) {
                    paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.enabled', 'true');
                    paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.online-mode', 'true');
                    
                    if (serverConfig.forwardingSecret) {
                        paperContent = this.updateYamlValue(paperContent, 'proxies.velocity.secret', `"${serverConfig.forwardingSecret}"`);
                    }
                    
                    details.push('Updated existing Paper configuration for modern Velocity forwarding');
                    await webdavService.uploadFile(paperConfigPath, paperContent);
                } else {
                    details.push('Paper configuration exists but lacks proxy sections - relying on server.properties for Velocity setup');
                }
                
            } else if (serverConfig.playerInfoForwardingMode === 'legacy') {
                // Configure legacy BungeeCord forwarding only if the sections already exist
                if (paperContent.includes('proxies:') || paperContent.includes('bungee')) {
                    paperContent = this.updateYamlValue(paperContent, 'proxies.bungee-cord.online-mode', 'true');
                    details.push('Updated existing Paper configuration for legacy BungeeCord forwarding');
                    await webdavService.uploadFile(paperConfigPath, paperContent);
                } else {
                    details.push('Paper configuration exists but lacks proxy sections - relying on server.properties for legacy setup');
                }
            }
            
        } catch (error) {
            details.push(`Warning: Could not configure Paper settings - ${error instanceof Error ? error.message : 'Unknown error'}`);
            details.push('This is not critical - server.properties configuration should be sufficient for Velocity integration');
        }
    }

    /**
     * Add server to Velocity configuration (velocity.toml)
     */
    private async addServerToVelocityConfig(
        serverConfig: VelocityServerConfig, 
        details: string[],
        configPath: string = this.velocityConfigPath
    ): Promise<void> {
        try {
            // Check if config file exists
            const exists = await webdavService.exists(configPath);
            if (!exists) {
                throw new Error(`Velocity configuration file not found at ${configPath}`);
            }

            // Read current config
            const configBuffer = await webdavService.getFileContents(configPath);
            const configContent = configBuffer.toString('utf-8');
            
            // Parse TOML (simple parsing for now, ideally use a TOML library)
            // Note: For robustness, we should use a proper TOML parser/stringifier
            // But for this implementation, we'll use regex replacement to preserve comments/structure
            
            // 1. Add to [servers] section
            const serversSectionRegex = /\[servers\]([\s\S]*?)(?=\[|\Z)/;
            const match = configContent.match(serversSectionRegex);
            
            if (!match) {
                throw new Error('Could not find [servers] section in velocity.toml');
            }

            const serversContent = match[1];
            const serverEntry = `${serverConfig.serverName} = "${serverConfig.address}:${serverConfig.port}"`;
            
            // Check if server already exists
            if (serversContent.includes(`${serverConfig.serverName} =`)) {
                details.push(`Server ${serverConfig.serverName} already exists in velocity.toml, updating...`);
                // Update existing entry
                const updatedServersContent = serversContent.replace(
                    new RegExp(`${serverConfig.serverName}\\s*=\\s*".*?"`),
                    serverEntry
                );
                const newConfigContent = configContent.replace(serversContent, updatedServersContent);
                await webdavService.uploadFile(configPath, newConfigContent);
            } else {
                details.push(`Adding server ${serverConfig.serverName} to velocity.toml...`);
                // Add new entry
                const newServersContent = serversContent.trimEnd() + '\n' + serverEntry + '\n\n';
                const newConfigContent = configContent.replace(serversContent, newServersContent);
                await webdavService.uploadFile(configPath, newConfigContent);
            }

            // 2. Add to [forced-hosts] if subdomain is provided
            if (serverConfig.subdomain) {
                await this.addForcedHost(serverConfig, configPath, details);
            }

            // 3. Add to try servers list (optional, but good for fallback)
            await this.addTryServer(serverConfig, configPath, details);

        } catch (error) {
            throw new Error(`Failed to update velocity.toml: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Add server to try list in velocity.toml
     */
    private async addTryServer(
        serverConfig: VelocityServerConfig,
        configPath: string,
        details: string[]
    ): Promise<void> {
        try {
            const configBuffer = await webdavService.getFileContents(configPath);
            let configContent = configBuffer.toString('utf-8');
            
            // Look for try = [...]
            const tryRegex = /try\s*=\s*\[([\s\S]*?)\]/;
            const match = configContent.match(tryRegex);

            if (match) {
                const currentList = match[1];
                // Check if server is already in the list
                if (!currentList.includes(`"${serverConfig.serverName}"`)) {
                    details.push(`Adding ${serverConfig.serverName} to try servers list...`);
                    
                    // Add to the end of the list
                    // If list is empty or just whitespace
                    const cleanList = currentList.trim();
                    let newList = '';
                    
                    if (cleanList.length === 0) {
                        newList = `\n  "${serverConfig.serverName}"\n`;
                    } else {
                        // Add comma if needed
                        const lastChar = cleanList.charAt(cleanList.length - 1);
                        const separator = lastChar === '"' || lastChar === "'" ? ',' : '';
                        newList = `${currentList}${separator}\n  "${serverConfig.serverName}"`;
                    }
                    
                    configContent = configContent.replace(tryRegex, `try = [${newList}]`);
                    await webdavService.uploadFile(configPath, configContent);
                }
            }
        } catch (error) {
            details.push(`Warning: Failed to add server to try list: ${error}`);
        }
    }

    /**
     * Add forced host mapping
     */
    private async addForcedHost(
        serverConfig: VelocityServerConfig, 
        configPath: string,
        details: string[]
    ): Promise<void> {
        try {
            const configBuffer = await webdavService.getFileContents(configPath);
            const configContent = configBuffer.toString('utf-8');
            const forcedHostsSectionRegex = /\[forced-hosts\]([\s\S]*?)(?=\[|\Z)/;
            const match = configContent.match(forcedHostsSectionRegex);

            if (!match) {
                // If section doesn't exist, we might need to create it, but usually it exists
                details.push('Warning: [forced-hosts] section not found, skipping subdomain mapping');
                return;
            }

            const sectionContent = match[1];
            const domain = process.env.ROOT_DOMAIN || 'example.com';
            const hostEntry = `"${serverConfig.subdomain}.${domain}" = ["${serverConfig.serverName}"]`;

            if (sectionContent.includes(`"${serverConfig.subdomain}.${domain}"`)) {
                details.push(`Forced host for ${serverConfig.subdomain} already exists, updating...`);
                const updatedSection = sectionContent.replace(
                    new RegExp(`"${serverConfig.subdomain}\\.${domain}"\\s*=\\s*\\[.*?\\]`),
                    hostEntry
                );
                const newConfigContent = configContent.replace(sectionContent, updatedSection);
                await webdavService.uploadFile(configPath, newConfigContent);
            } else {
                details.push(`Adding forced host for ${serverConfig.subdomain}...`);
                const newSection = sectionContent.trimEnd() + '\n' + hostEntry + '\n\n';
                const newConfigContent = configContent.replace(sectionContent, newSection);
                await webdavService.uploadFile(configPath, newConfigContent);
            }
        } catch (error) {
            details.push(`Warning: Failed to add forced host: ${error}`);
        }
    }

    /**
     * Get the external network configuration for docker-compose
     */
    getVelocityNetworkConfig(): { networks: Record<string, { external: boolean; name: string }> } {
        return {
            networks: {
                [this.velocityNetworkName]: {
                    external: true,
                    name: this.velocityNetworkName
                }
            }
        };
    }

    /**
     * Wait for server to start and files to be created
     */
    async waitForServerFilesToBeCreated(
        containerId: string,
        environmentId: number,
        maxWaitTime: number = 120000 // 2 minutes
    ): Promise<{ success: boolean; error?: string }> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                // Check if server.properties exists by executing a command in the container
                const result = await portainer.executeCommand(
                    containerId,
                    'ls /data/server.properties',
                    environmentId
                );
                
                if (result.exitCode === 0) {
                    return { success: true };
                }
                
                // Wait 5 seconds before checking again
                await new Promise(resolve => setTimeout(resolve, 5000));
                
            } catch {
                // Continue waiting if command fails
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        return { 
            success: false, 
            error: 'Timeout waiting for server files to be created' 
        };
    }

    /**
     * Parse server.properties content into an object
     */
    private parseServerProperties(content: string): Record<string, string> {
        const properties: Record<string, string> = {};
        
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    properties[key.trim()] = valueParts.join('=').trim();
                }
            }
        });
        
        return properties;
    }

    /**
     * Generate server.properties content from object
     */
    private generateServerProperties(properties: Record<string, string>): string {
        const lines = [
            '# Minecraft server properties',
            '# Generated by MinecraftServerCreator with Velocity integration',
            ''
        ];
        
        Object.entries(properties).forEach(([key, value]) => {
            lines.push(`${key}=${value}`);
        });
        
        return lines.join('\n');
    }

    /**
     * Update a YAML value (simple implementation)
     */
    private updateYamlValue(content: string, path: string, value: string): string {
        const pathParts = path.split('.');
        const key = pathParts[pathParts.length - 1];
        
        // Simple regex replacement for YAML values
        const regex = new RegExp(`^(\\s*${key}:\\s*).*$`, 'm');
        const replacement = `$1${value}`;
        
        if (regex.test(content)) {
            return content.replace(regex, replacement);
        } else {
            // Add the key if it doesn't exist
            return content + `\n${key}: ${value}`;
        }
    }

    /**
     * Read Velocity configuration from WebDAV
     */
    public async readVelocityConfig(configPath?: string): Promise<VelocityConfig> {
        const targetPath = configPath || this.velocityConfigPath;
        try {
            const configExists = await webdavService.exists(targetPath);
            
            if (!configExists) {
                // Return default configuration if file doesn't exist
                return this.getDefaultVelocityConfig();
            }
            
            const configBuffer = await webdavService.getFileContents(targetPath);
            const configContent = configBuffer.toString('utf-8');
            
            // Parse TOML configuration (simple implementation)
            return this.parseVelocityConfig(configContent);
            
        } catch (error) {
            throw new Error(`Failed to read Velocity configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Write Velocity configuration to WebDAV
     */
    private async writeVelocityConfig(config: VelocityConfig): Promise<void> {
        try {
            const configContent = this.generateVelocityConfig(config);
            await webdavService.uploadFile(this.velocityConfigPath, configContent);
        } catch (error) {
            throw new Error(`Failed to write Velocity configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get default Velocity configuration
     */
    public getDefaultVelocityConfig(): VelocityConfig {
        return {
            'config-version': '2.0',
            bind: '0.0.0.0:25565',
            motd: 'A Velocity Server',
            'show-max-players': 500,
            'online-mode': true,
            'force-key-authentication': true,
            'prevent-client-proxy-connections': false,
            'player-info-forwarding-mode': 'modern',
            'forwarding-secret': '',
            servers: {},
            'try': [],
            'forced-hosts': {}
        };
    }

    /**
     * Generate default Velocity configuration content
     */
    generateDefaultConfig(): string {
        return `# Velocity Configuration
# Generated by Minecraft Server Creator

config-version = "2.5"
bind = "0.0.0.0:25565"
motd = "&3A Velocity Server"
show-max-players = 500
online-mode = true
force-key-authentication = true
prevent-client-proxy-connections = false
player-info-forwarding-mode = "modern"
forwarding-secret-file = "forwarding.secret"
annouce-forge-numbers = false
ping-passthrough = "DISABLED"

[servers]
# Servers will be added here automatically

[forced-hosts]
# Subdomains will be added here automatically

[advanced]
compression-threshold = 256
compression-level = -1
login-ratelimit = 3000
connection-timeout = 5000
read-timeout = 30000
haproxy-protocol = false
tcp-fast-open = false
bungee-plugin-message-channel = true
show-ping-requests = false
failover-on-unexpected-server-disconnect = true
announce-proxy-commands = true
log-command-executions = false
log-player-connections = true

[query]
enabled = false
port = 25565
map = "Velocity"
show-plugins = false
`;
    }

    /**
     * Parse Velocity TOML configuration (improved implementation)
     */
    private parseVelocityConfig(content: string): VelocityConfig {
        // Start with default configuration
        const config = this.getDefaultVelocityConfig();
        
        // Parse the content line by line
        const lines = content.split('\n');
        let currentSection = '';
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            
            // Handle section headers
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                currentSection = trimmed.slice(1, -1);
                continue;
            }
            
            // Handle key-value pairs
            if (trimmed.includes('=')) {
                const equalIndex = trimmed.indexOf('=');
                const key = trimmed.substring(0, equalIndex).trim();
                const value = trimmed.substring(equalIndex + 1).trim();
                const cleanValue = this.parseTomlValue(value);
                
                if (currentSection === 'servers') {
                    this.parseServerEntry(config, key, cleanValue);
                } else if (currentSection === 'forced-hosts') {
                    // Handle forced hosts
                    if (Array.isArray(cleanValue)) {
                        config['forced-hosts'][key.replace(/"/g, '')] = cleanValue;
                    }
                } else {
                    // Handle root level properties
                    this.parseRootConfigEntry(config, key, cleanValue);
                }
            }
        }
        
        return config;
    }

    /**
     * Parse a server entry in the [servers] section
     */
    private parseServerEntry(config: VelocityConfig, key: string, value: string | number | boolean | string[]): void {
        if (key === 'try') {
            // Handle the try array
            if (Array.isArray(value)) {
                config.try = value;
            }
            return;
        }
        
        // Check if this is a server property (only for known property suffixes)
        const knownProperties = ['restricted', 'player-info-forwarding-mode', 'forwarding-secret'];
        
        for (const property of knownProperties) {
            if (key.endsWith('-' + property)) {
                // This is a server property
                const serverName = key.substring(0, key.length - property.length - 1);
                
                // Ensure server exists
                if (!config.servers[serverName]) {
                    config.servers[serverName] = { address: '' };
                }
                
                // Set the property
                switch (property) {
                    case 'restricted':
                        config.servers[serverName].restricted = value as boolean;
                        break;
                    case 'player-info-forwarding-mode':
                        config.servers[serverName]['player-info-forwarding-mode'] = value as 'none' | 'legacy' | 'modern';
                        break;
                    case 'forwarding-secret':
                        config.servers[serverName]['forwarding-secret'] = value as string;
                        break;
                }
                return;
            }
        }
        
        // This is a server address entry (including server names with hyphens)
        if (!config.servers[key]) {
            config.servers[key] = { address: '' };
        }
        config.servers[key].address = value as string;
    }

    /**
     * Parse a root-level configuration entry
     */
    private parseRootConfigEntry(config: VelocityConfig, key: string, value: string | number | boolean | string[]): void {
        switch (key) {
            case 'config-version':
                config['config-version'] = value as string;
                break;
            case 'bind':
                config.bind = value as string;
                break;
            case 'motd':
                config.motd = value as string;
                break;
            case 'show-max-players':
                config['show-max-players'] = value as number;
                break;
            case 'online-mode':
                config['online-mode'] = value as boolean;
                break;
            case 'force-key-authentication':
                config['force-key-authentication'] = value as boolean;
                break;
            case 'prevent-client-proxy-connections':
                config['prevent-client-proxy-connections'] = value as boolean;
                break;
            case 'player-info-forwarding-mode':
                config['player-info-forwarding-mode'] = value as 'none' | 'legacy' | 'modern';
                break;
            case 'forwarding-secret':
                config['forwarding-secret'] = value as string;
                break;
            case 'try':
                if (Array.isArray(value)) {
                    config.try = value;
                }
                break;
        }
    }

    /**
     * Generate Velocity TOML configuration (improved implementation)
     */
    public generateVelocityConfig(config: VelocityConfig): string {
        const lines = [
            '# Velocity Configuration',
            '# Generated by MinecraftServerCreator',
            '',
            `config-version = "${config['config-version']}"`,
            `bind = "${config.bind}"`,
            `motd = "${config.motd}"`,
            `show-max-players = ${config['show-max-players']}`,
            `online-mode = ${config['online-mode']}`,
            `force-key-authentication = ${config['force-key-authentication']}`,
            `prevent-client-proxy-connections = ${config['prevent-client-proxy-connections']}`,
            `player-info-forwarding-mode = "${config['player-info-forwarding-mode']}"`,
            `forwarding-secret = "${config['forwarding-secret']}"`,
            '',
            '[servers]'
        ];
        
        // Add server addresses first
        const serverNames = Object.keys(config.servers).sort();
        for (const serverName of serverNames) {
            const serverConfig = config.servers[serverName];
            lines.push(`${serverName} = "${serverConfig.address}"`);
        }
        
        // Add server properties
        for (const serverName of serverNames) {
            const serverConfig = config.servers[serverName];
            
            if (serverConfig.restricted) {
                lines.push(`${serverName}-restricted = true`);
            }
            if (serverConfig['player-info-forwarding-mode']) {
                lines.push(`${serverName}-player-info-forwarding-mode = "${serverConfig['player-info-forwarding-mode']}"`);
            }
            if (serverConfig['forwarding-secret']) {
                lines.push(`${serverName}-forwarding-secret = "${serverConfig['forwarding-secret']}"`);
            }
        }
        
        // Add try list
        lines.push('');
        lines.push(`try = [${config.try.map(s => `"${s}"`).join(', ')}]`);
        
        // Add forced hosts if any
        if (Object.keys(config['forced-hosts']).length > 0) {
            lines.push('');
            lines.push('[forced-hosts]');
            Object.entries(config['forced-hosts']).forEach(([host, servers]) => {
                lines.push(`"${host}" = [${servers.map(s => `"${s}"`).join(', ')}]`);
            });
        }
        
        return lines.join('\n');
    }

    /**
     * Parse TOML value (improved implementation)
     */
    private parseTomlValue(value: string): string | number | boolean | string[] {
        const trimmed = value.trim();
        
        // Handle boolean values
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        
        // Handle quoted strings
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return trimmed.slice(1, -1);
        }
        
        // Handle single quoted strings
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
            return trimmed.slice(1, -1);
        }
        
        // Handle arrays
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            const arrayContent = trimmed.slice(1, -1).trim();
            if (!arrayContent) return [];
            
            return arrayContent
                .split(',')
                .map(item => item.trim())
                .map(item => {
                    // Remove quotes from array elements
                    if ((item.startsWith('"') && item.endsWith('"')) || 
                        (item.startsWith("'") && item.endsWith("'"))) {
                        return item.slice(1, -1);
                    }
                    return item;
                })
                .filter(item => item.length > 0);
        }
        
        // Handle numbers
        if (!isNaN(Number(trimmed)) && trimmed !== '') {
            return Number(trimmed);
        }
        
        // Return as string if nothing else matches
        return trimmed;
    }

    /**
     * Remove server from Velocity configuration
     * @param serverName - The name of the server to remove
     * @param serverId - The unique ID of the server (for fallback matching)
     */
    async removeServerFromVelocityConfig(
        serverName: string,
        serverId?: string
    ): Promise<{ success: boolean; error?: string; details?: string[] }> {
        const details: string[] = [];
        
        try {
            details.push('Starting Velocity server removal...');
            
            // Read existing Velocity configuration
            const velocityConfig = await this.readVelocityConfig();
            
            let serverFound = false;
            let removedServerName = '';
            
            // Find the server by name or by matching the serverId in the address
            for (const [name, config] of Object.entries(velocityConfig.servers)) {
                const shouldRemove = name === serverName || 
                    (serverId && config.address.includes(serverId));
                
                if (shouldRemove) {
                    delete velocityConfig.servers[name];
                    removedServerName = name;
                    serverFound = true;
                    details.push(`Removed server from Velocity configuration: ${name}`);
                    break;
                }
            }
            
            if (!serverFound) {
                details.push(`Server not found in Velocity configuration: ${serverName}`);
                return { 
                    success: true, 
                    details,
                    error: 'Server not found in configuration (may have already been removed)'
                };
            }
            
            // Remove from try list if present
            const tryIndex = velocityConfig.try.indexOf(removedServerName);
            if (tryIndex > -1) {
                velocityConfig.try.splice(tryIndex, 1);
                details.push(`Removed server from try list: ${removedServerName}`);
            }
            
            // Remove from forced hosts if present
            const forcedHostsToUpdate: string[] = [];
            for (const [host, servers] of Object.entries(velocityConfig['forced-hosts'])) {
                const serverIndex = servers.indexOf(removedServerName);
                if (serverIndex > -1) {
                    servers.splice(serverIndex, 1);
                    forcedHostsToUpdate.push(host);
                    
                    // Remove the forced host entry if no servers remain
                    if (servers.length === 0) {
                        delete velocityConfig['forced-hosts'][host];
                        details.push(`Removed empty forced host entry: ${host}`);
                    } else {
                        details.push(`Removed server from forced host ${host}: ${removedServerName}`);
                    }
                }
            }
            
            // Write updated configuration back to WebDAV
            await this.writeVelocityConfig(velocityConfig);
            
            details.push(`Successfully removed server from Velocity configuration: ${removedServerName}`);
            details.push(`Remaining servers: ${Object.keys(velocityConfig.servers).join(', ') || 'none'}`);
            details.push(`Updated try list: [${velocityConfig.try.join(', ')}]`);
            
            return { success: true, details };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            details.push(`Velocity server removal failed: ${errorMessage}`);
            
            return {
                success: false,
                error: errorMessage,
                details
            };
        }
    }

    /**
     * Reload Velocity configuration
     * @param containerId - The ID of the Velocity container
     * @param environmentId - The ID of the Portainer environment
     */
    async reloadVelocity(containerId: string, environmentId: number = 1): Promise<void> {
        try {
            // Execute 'velocity reload' command in the container
            await portainer.executeCommand(containerId, 'velocity reload', environmentId);
            console.log(`Velocity configuration reloaded for container ${containerId}`);
        } catch (error) {
            console.error(`Failed to reload Velocity for container ${containerId}:`, error);
            // Don't throw, as this is often a non-critical operation (config might auto-reload)
        }
    }
}

const velocityServiceInstance = new VelocityService();
export default velocityServiceInstance;
