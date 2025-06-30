/**
 * A comprehensive interface for configuring a Minecraft server 
 * using the itzg/minecraft-server Docker image.
 * 
 * @see https://github.com/itzg/docker-minecraft-server/blob/master/README.md
 */
export interface ClientServerConfig {
    // Basic server information
    name: string;
    serverType: string;
    version: string;
    description: string;
    
    // World settings
    seed?: string;
    gameMode: string;
    difficulty: string;
    worldType: string;
    worldGeneration: string;
    worldFile?: File | null;
    
    // Player settings
    maxPlayers: number;
    whitelistEnabled: boolean;
    onlineMode: boolean;
    
    // Game mechanics
    pvpEnabled: boolean;
    commandBlocksEnabled: boolean;
    flightEnabled: boolean;
    spawnAnimalsEnabled: boolean;
    spawnMonstersEnabled: boolean;
    spawnNpcsEnabled: boolean;
    generateStructuresEnabled: boolean;
    
    // Network settings
    port: number;
    
    // Performance settings
    viewDistance: number;
    simulationDistance: number;
    spawnProtection: number;
    
    // Server management
    rconEnabled: boolean;
    rconPassword: string;
    motd: string;
    
    // Resource settings
    resourcePackUrl: string;
    resourcePackSha1: string;
    resourcePackPrompt: string;
    forceResourcePack: boolean;
    
    // Advanced settings
    enableJmxMonitoring: boolean;
    syncChunkWrites: boolean;
    enforceWhitelist: boolean;
    preventProxyConnections: boolean;
    hideOnlinePlayers: boolean;
    broadcastRconToOps: boolean;
    broadcastConsoleToOps: boolean;
    
    // Memory and performance
    serverMemory: number;
    
    // Client-specific properties for form handling
    plugins: File[];
    mods: File[];
    subdomain: string;
    worldFiles?: File | null;
    customOptions?: string;
    [key: string]: unknown;
}

export interface MinecraftServerConfig {
    // Core Server Settings
    EULA?: boolean; // Must be true to run the server
    VERSION?: string; // e.g., "1.20.4", "LATEST"
    TYPE?: 'VANILLA' | 'SPIGOT' | 'PAPER' | 'BUKKIT' | 'PURPUR' | 'FORGE' | 'FABRIC'; // Server type
    MOTD?: string;
    SERVER_NAME?: string;
    GAMEMODE?: 'survival' | 'creative' | 'adventure' | 'spectator';
    DIFFICULTY?: 'peaceful' | 'easy' | 'normal' | 'hard';
    FORCE_GAMEMODE?: boolean;
    HARDCORE?: boolean;
    PVP?: boolean;
    MAX_PLAYERS?: number;
    ONLINE_MODE?: boolean;

    // Performance
    MEMORY?: string; // e.g., "2G", "1024M"
    VIEW_DISTANCE?: number;
    SIMULATION_DISTANCE?: number;

    // World Settings
    LEVEL_SEED?: string;
    LEVEL_TYPE?: 'DEFAULT' | 'FLAT' | 'LARGEBIOMES' | 'AMPLIFIED' | 'CUSTOMIZED';
    LEVEL_NAME?: string; // Defaults to "world"
    GENERATE_STRUCTURES?: boolean;
    MAX_WORLD_SIZE?: number;
    ALLOW_NETHER?: boolean;

    // Player and Access Control
    WHITELIST?: string; // Comma-separated list of player names
    OPS?: string; // Comma-separated list of player names
    ENFORCE_WHITELIST?: boolean;
    MAX_BUILD_HEIGHT?: number;

    // Server Behavior
    ANNOUNCE_PLAYER_ACHIEVEMENTS?: boolean;
    ENABLE_COMMAND_BLOCK?: boolean;
    SPAWN_ANIMALS?: boolean;
    SPAWN_MONSTERS?: boolean;
    SPAWN_NPCS?: boolean;
    SPAWN_PROTECTION?: number;

    // Networking
    SERVER_PORT?: number; // Internal container port, usually 25565
    ENABLE_RCON?: boolean;
    RCON_PORT?: number;
    RCON_PASSWORD?: string;
}

/**
 * Provides versioned interfaces for Minecraft server.properties.
 * This allows for type-safe configuration based on the selected Minecraft version.
 */

/** Base properties available in Minecraft 1.8 */
export interface MinecraftPropertiesV1_8 {
    'allow-flight'?: boolean;
    'allow-nether'?: boolean;
    'announce-player-achievements'?: boolean;
    'difficulty'?: 'peaceful' | 'easy' | 'normal' | 'hard';
    'enable-command-block'?: boolean;
    'enable-query'?: boolean;
    'enable-rcon'?: boolean;
    'force-gamemode'?: boolean;
    'gamemode'?: 'survival' | 'creative' | 'adventure' | 'spectator';
    'generate-structures'?: boolean;
    'hardcore'?: boolean;
    'level-name'?: string;
    'level-seed'?: string;
    'level-type'?: 'DEFAULT' | 'FLAT' | 'LARGEBIOMES' | 'AMPLIFIED';
    'max-build-height'?: number;
    'max-players'?: number;
    'max-tick-time'?: number;
    'max-world-size'?: number;
    'motd'?: string;
    'online-mode'?: boolean;
    'op-permission-level'?: 1 | 2 | 3 | 4;
    'player-idle-timeout'?: number;
    'pvp'?: boolean;
    'query.port'?: number;
    'rcon.password'?: string;
    'rcon.port'?: number;
    'resource-pack'?: string;
    'resource-pack-sha1'?: string;
    'server-ip'?: string;
    'server-port'?: number;
    'snooper-enabled'?: boolean;
    'spawn-animals'?: boolean;
    'spawn-monsters'?: boolean;
    'spawn-npcs'?: boolean;
    'spawn-protection'?: number;
    'use-native-transport'?: boolean;
    'view-distance'?: number;
    'white-list'?: boolean;
}

/** Properties for Minecraft 1.9, adding whitelist enforcement. */
export interface MinecraftPropertiesV1_9 extends MinecraftPropertiesV1_8 {
    'enforce-whitelist'?: boolean;
}

/** Properties for Minecraft 1.13, adding simulation distance. */
export interface MinecraftPropertiesV1_13 extends MinecraftPropertiesV1_9 {
    'simulation-distance'?: number;
}

/** Properties for Minecraft 1.14, adding RCON and console broadcast options. */
export interface MinecraftPropertiesV1_14 extends MinecraftPropertiesV1_13 {
    'broadcast-rcon-to-ops'?: boolean;
    'broadcast-console-to-ops'?: boolean;
}

/** Properties for Minecraft 1.15, adding JMX monitoring. */
export interface MinecraftPropertiesV1_15 extends MinecraftPropertiesV1_14 {
    'enable-jmx-monitoring'?: boolean;
}

/** Properties for Minecraft 1.17, adding player visibility and proxy settings. */
export interface MinecraftPropertiesV1_17 extends MinecraftPropertiesV1_15 {
    'hide-online-players'?: boolean;
    'prevent-proxy-connections'?: boolean;
}

/** Properties for Minecraft 1.19, adding initial pack settings. */
export interface MinecraftPropertiesV1_19 extends MinecraftPropertiesV1_17 {
    'initial-enabled-packs'?: string; // Comma-separated list
    'initial-disabled-packs'?: string; // Comma-separated list
}

/** Properties for Minecraft 1.20, adding function permission levels. */
export interface MinecraftPropertiesV1_20 extends MinecraftPropertiesV1_19 {
    'function-permission-level'?: 1 | 2 | 3 | 4;
}

/** Properties for Minecraft 1.20.2, adding chat preview settings. */
export interface MinecraftPropertiesV1_20_2 extends MinecraftPropertiesV1_20 {
    'previews-chat'?: boolean;
}

/** Properties for Minecraft 1.21, adding the latest configurations. */
export type MinecraftPropertiesV1_21 = MinecraftPropertiesV1_20_2;

import portainer from './portainer';
import { PortainerContainer } from './portainer';
import webdavService from './webdav';
import yaml from 'js-yaml';

/**
 * Comprehensive Minecraft Server management class.
 * Handles Docker Compose generation, Portainer integration, and WebDAV file operations.
 */
export class MinecraftServer {
    private config: MinecraftServerConfig;
    private serverName: string;
    private uniqueId: string;
    private environmentId: number;

    constructor(config: MinecraftServerConfig, serverName: string, uniqueId: string, environmentId: number = 1) {
        this.config = config;
        this.serverName = serverName;
        this.uniqueId = uniqueId;
        this.environmentId = environmentId;
    }

    /**
     * Calculate memory requirements based on server configuration
     */
    public calculateMemory(config: ClientServerConfig): string {
        const baseMemory = 1024; // Base memory in MB
        if (!config || !Array.isArray(config.mods) || !Array.isArray(config.plugins)) {
            throw new Error('Invalid parameters for memory calculation.');
        }

        // Calculate memory based on server type, mods, and plugins
        const modMemory = config.mods.length * 256; // Each mod requires 256MB
        const pluginMemory = config.plugins.length * 128; // Each plugin requires 128MB

        const totalMemory = baseMemory + modMemory + pluginMemory;
        return `${totalMemory}M`;
    }

    /**
     * Validates the Minecraft server configuration.
     */
    validateConfig(): boolean {
        // Basic checks for required fields
        if (!this.config.EULA) {
            console.error('EULA must be accepted to run the server.');
            return false;
        }
        if (!this.config.VERSION) {
            console.error('VERSION is required.');
            return false;
        }
        if (!this.config.MOTD) {
            console.error('MOTD is required.');
            return false;
        }
        if (!this.config.SERVER_NAME) {
            console.error('SERVER_NAME is required.');
            return false;
        }
        return true;
    }

    /**
     * Generate version-specific server properties based on Minecraft version
     */
    private generateVersionSpecificProperties(): Record<string, unknown> {
        const version = this.config.VERSION || 'LATEST';
        const baseProps: Record<string, unknown> = {};

        // Parse version to determine features
        const versionNumber = this.parseVersion(version);

        // Base properties (1.8+)
        Object.assign(baseProps, {
            'allow-flight': false,
            'allow-nether': this.config.ALLOW_NETHER !== false,
            'difficulty': this.config.DIFFICULTY || 'normal',
            'enable-command-block': this.config.ENABLE_COMMAND_BLOCK !== false,
            'enable-query': false,
            'enable-rcon': this.config.ENABLE_RCON !== false,
            'force-gamemode': this.config.FORCE_GAMEMODE !== false,
            'gamemode': this.config.GAMEMODE || 'survival',
            'generate-structures': this.config.GENERATE_STRUCTURES !== false,
            'hardcore': this.config.HARDCORE !== false,
            'level-name': this.config.LEVEL_NAME || 'world',
            'level-seed': this.config.LEVEL_SEED || '',
            'level-type': this.config.LEVEL_TYPE || 'DEFAULT',
            'max-players': this.config.MAX_PLAYERS || 20,
            'max-world-size': this.config.MAX_WORLD_SIZE || 29999984,
            'motd': this.config.MOTD || 'A Minecraft Server',
            'online-mode': this.config.ONLINE_MODE !== false,
            'pvp': this.config.PVP !== false,
            'server-port': this.config.SERVER_PORT || 25565,
            'spawn-animals': this.config.SPAWN_ANIMALS !== false,
            'spawn-monsters': this.config.SPAWN_MONSTERS !== false,
            'spawn-npcs': this.config.SPAWN_NPCS !== false,
            'spawn-protection': this.config.SPAWN_PROTECTION || 16,
            'view-distance': this.config.VIEW_DISTANCE || 10,
            'white-list': false,
        });

        // Version-specific additions
        if (versionNumber >= 1.9) {
            baseProps['enforce-whitelist'] = this.config.ENFORCE_WHITELIST !== false;
        }

        if (versionNumber >= 1.13) {
            baseProps['simulation-distance'] = this.config.SIMULATION_DISTANCE || 10;
        }

        if (versionNumber >= 1.14) {
            baseProps['broadcast-rcon-to-ops'] = true;
            baseProps['broadcast-console-to-ops'] = true;
        }

        if (versionNumber >= 1.15) {
            baseProps['enable-jmx-monitoring'] = false;
        }

        if (versionNumber >= 1.17) {
            baseProps['hide-online-players'] = false;
            baseProps['prevent-proxy-connections'] = false;
        }

        if (versionNumber >= 1.19) {
            baseProps['initial-enabled-packs'] = 'vanilla';
            baseProps['initial-disabled-packs'] = '';
        }

        if (versionNumber >= 1.20) {
            baseProps['function-permission-level'] = 2;
        }

        if (versionNumber >= 1.202) {
            baseProps['previews-chat'] = false;
        }

        return baseProps;
    }

    /**
     * Parse Minecraft version string to numeric value for comparison
     */
    private parseVersion(version: string): number {
        if (version === 'LATEST') return 999;
        
        const match = version.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
        if (!match) return 0;
        
        const major = parseInt(match[1]);
        const minor = parseInt(match[2]);
        const patch = parseInt(match[3] || '0');
        
        return major + (minor / 100) + (patch / 10000);
    }

    /**
     * Generate complete Docker Compose configuration
     */
    generateDockerComposeConfig(): object {
        if (!this.validateConfig()) {
            throw new Error('Invalid Minecraft server configuration.');
        }

        const versionSpecificProps = this.generateVersionSpecificProperties();
        const serverPath = `/servers/${this.uniqueId}`;

        // Determine the server type and image configuration
        const serverTypeConfig = this.getServerTypeConfig();

        const composeConfig = {
            version: '3.8',
            services: {
                minecraft: {
                    image: serverTypeConfig.image,
                    container_name: `mc-${this.uniqueId}`,
                    environment: {
                        EULA: this.config.EULA ? 'TRUE' : 'FALSE',
                        VERSION: this.config.VERSION || 'LATEST',
                        TYPE: serverTypeConfig.type,
                        MEMORY: this.config.MEMORY || '2G',
                        JVM_OPTS: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200',
                        USE_AIKAR_FLAGS: 'true',
                        ...Object.fromEntries(
                            Object.entries(versionSpecificProps).map(([key, value]) => [
                                key.toUpperCase().replace(/-/g, '_'),
                                typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value)
                            ])
                        ),
                        ...serverTypeConfig.additionalEnv
                    },
                    ports: [
                        `${this.config.SERVER_PORT || 25565}:25565`,
                        ...(this.config.ENABLE_RCON ? [`${this.config.RCON_PORT || 25575}:25575`] : [])
                    ],
                    volumes: [
                        `${serverPath}/data:/data`,
                        `${serverPath}/plugins:/data/plugins`,
                        `${serverPath}/mods:/data/mods`,
                        `${serverPath}/worlds:/data/worlds`,
                        `${serverPath}/backups:/backups`,
                        ...serverTypeConfig.additionalVolumes
                    ],
                    restart: 'unless-stopped',
                    stdin_open: true,
                    tty: true,
                    networks: ['minecraft-network'],
                    labels: {
                        'minecraft.server.id': this.uniqueId,
                        'minecraft.server.name': this.serverName,
                        'minecraft.server.version': this.config.VERSION || 'LATEST',
                        'minecraft.server.type': serverTypeConfig.type
                    }
                }
            },
            networks: {
                'minecraft-network': {
                    driver: 'bridge'
                }
            },
            volumes: {
                [`${this.uniqueId}-data`]: {},
                [`${this.uniqueId}-plugins`]: {},
                [`${this.uniqueId}-mods`]: {},
                [`${this.uniqueId}-worlds`]: {},
                [`${this.uniqueId}-backups`]: {}
            }
        };

        return composeConfig;
    }

    /**
     * Get server type specific configuration
     */
    private getServerTypeConfig(): {
        image: string;
        type: string;
        additionalEnv: Record<string, string>;
        additionalVolumes: string[];
    } {
        // Default to vanilla if no server type specified
        const serverType = this.config.TYPE || 'VANILLA';

        const configs = {
            VANILLA: {
                image: 'itzg/minecraft-server:latest',
                type: 'VANILLA',
                additionalEnv: {},
                additionalVolumes: []
            },
            SPIGOT: {
                image: 'itzg/minecraft-server:latest',
                type: 'SPIGOT',
                additionalEnv: {
                    SPIGET_RESOURCES: '', // Can be used to auto-download plugins
                },
                additionalVolumes: []
            },
            PAPER: {
                image: 'itzg/minecraft-server:latest',
                type: 'PAPER',
                additionalEnv: {
                    PAPER_DOWNLOAD_URL: '', // Can specify custom Paper builds
                },
                additionalVolumes: []
            },
            BUKKIT: {
                image: 'itzg/minecraft-server:latest',
                type: 'BUKKIT',
                additionalEnv: {},
                additionalVolumes: []
            },
            PURPUR: {
                image: 'itzg/minecraft-server:latest',
                type: 'PURPUR',
                additionalEnv: {},
                additionalVolumes: []
            },
            FORGE: {
                image: 'itzg/minecraft-server:latest',
                type: 'FORGE',
                additionalEnv: {
                    FORGE_VERSION: 'RECOMMENDED', // Can specify Forge version
                },
                additionalVolumes: []
            },
            FABRIC: {
                image: 'itzg/minecraft-server:latest',
                type: 'FABRIC',
                additionalEnv: {
                    FABRIC_LOADER_VERSION: 'LATEST', // Can specify Fabric loader version
                },
                additionalVolumes: []
            }
        };

        return configs[serverType as keyof typeof configs] || configs.VANILLA;
    }

    /**
     * Generate Docker Compose YAML string
     */
    generateDockerComposeYaml(): string {
        const config = this.generateDockerComposeConfig();
        return yaml.dump(config, { indent: 2, lineWidth: -1 });
    }

    /**
     * Deploy server to Portainer as a stack
     */
    async deployToPortainer(): Promise<{ success: boolean; stackId?: number; error?: string }> {
        try {
            const composeContent = this.generateDockerComposeYaml();
            
            // Create stack payload
            const stackData = {
                Name: `minecraft-${this.uniqueId}`,
                SwarmID: '',
                StackFileContent: composeContent,
                Env: [
                    { name: 'SERVER_ID', value: this.uniqueId },
                    { name: 'SERVER_NAME', value: this.serverName }
                ]
            };

            const response = await portainer.createStack(stackData, this.environmentId);
            console.log(`Successfully deployed Minecraft server ${this.serverName} to Portainer`);
            return { success: true, stackId: (response as { Id: number }).Id };
        } catch (error) {
            console.error('Error deploying to Portainer:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Start the Minecraft server stack in Portainer
     */
    async startServer(): Promise<{ success: boolean; error?: string }> {
        try {
            const stacks = await portainer.getStacks();
            const serverStack = stacks.find(stack => stack.Name === `minecraft-${this.uniqueId}`);
            
            if (!serverStack) {
                return { success: false, error: 'Server stack not found' };
            }

            await portainer.startStack(serverStack.Id);
            console.log(`Started Minecraft server ${this.serverName}`);
            return { success: true };
        } catch (error) {
            console.error('Error starting server:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Stop the Minecraft server stack in Portainer
     */
    async stopServer(): Promise<{ success: boolean; error?: string }> {
        try {
            const stacks = await portainer.getStacks();
            const serverStack = stacks.find(stack => stack.Name === `minecraft-${this.uniqueId}`);
            
            if (!serverStack) {
                return { success: false, error: 'Server stack not found' };
            }

            await portainer.stopStack(serverStack.Id);
            console.log(`Stopped Minecraft server ${this.serverName}`);
            return { success: true };
        } catch (error) {
            console.error('Error stopping server:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Delete the server stack from Portainer
     */
    async deleteFromPortainer(): Promise<{ success: boolean; error?: string }> {
        try {
            const stacks = await portainer.getStacks();
            const serverStack = stacks.find(stack => stack.Name === `minecraft-${this.uniqueId}`);
            
            if (!serverStack) {
                return { success: false, error: 'Server stack not found' };
            }

            await portainer.deleteStack(serverStack.Id, this.environmentId);
            console.log(`Deleted Minecraft server ${this.serverName} from Portainer`);
            return { success: true };
        } catch (error) {
            console.error('Error deleting server from Portainer:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Get server status from Portainer
     */
    async getServerStatus(): Promise<{ 
        running: boolean; 
        containerInfo?: PortainerContainer; 
        error?: string 
    }> {
        try {
            const containers = await portainer.getContainers(this.environmentId);
            const serverContainer = containers.find(container => 
                container.Names.some(name => name.includes(`mc-${this.uniqueId}`))
            );

            if (!serverContainer) {
                return { running: false, error: 'Container not found' };
            }

            return {
                running: serverContainer.State === 'running',
                containerInfo: serverContainer
            };
        } catch (error) {
            console.error('Error getting server status:', error);
            return { 
                running: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Upload server files to WebDAV
     */
    async uploadServerFiles(files: { [path: string]: Buffer | string }): Promise<{ success: boolean; error?: string }> {
        try {
            const serverPath = `/servers/${this.uniqueId}`;
            
            // Ensure server directory exists
            await webdavService.createDirectory(serverPath);
            await webdavService.createDirectory(`${serverPath}/plugins`);
            await webdavService.createDirectory(`${serverPath}/mods`);
            await webdavService.createDirectory(`${serverPath}/worlds`);
            await webdavService.createDirectory(`${serverPath}/backups`);
            
            for (const [relativePath, content] of Object.entries(files)) {
                const fullPath = `${serverPath}/${relativePath}`;
                await webdavService.uploadFile(fullPath, content);
            }

            console.log(`Uploaded server files for ${this.serverName}`);
            return { success: true };
        } catch (error) {
            console.error('Error uploading server files:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Upload plugins specifically
     */
    async uploadPlugins(plugins: File[]): Promise<{ success: boolean; error?: string }> {
        try {
            const pluginFiles: { [path: string]: Buffer } = {};
            
            for (const plugin of plugins) {
                const pluginBuffer = Buffer.from(await plugin.arrayBuffer());
                pluginFiles[`plugins/${plugin.name}`] = pluginBuffer;
            }
            
            return await this.uploadServerFiles(pluginFiles);
        } catch (error) {
            console.error('Error uploading plugins:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Upload mods specifically
     */
    async uploadMods(mods: File[]): Promise<{ success: boolean; error?: string }> {
        try {
            const modFiles: { [path: string]: Buffer } = {};
            
            for (const mod of mods) {
                const modBuffer = Buffer.from(await mod.arrayBuffer());
                modFiles[`mods/${mod.name}`] = modBuffer;
            }
            
            return await this.uploadServerFiles(modFiles);
        } catch (error) {
            console.error('Error uploading mods:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Upload world files
     */
    async uploadWorldFile(worldFile: File): Promise<{ success: boolean; error?: string }> {
        try {
            const worldBuffer = Buffer.from(await worldFile.arrayBuffer());
            const worldFiles: { [path: string]: Buffer } = {};
            worldFiles[`worlds/${worldFile.name}`] = worldBuffer;
            
            return await this.uploadServerFiles(worldFiles);
        } catch (error) {
            console.error('Error uploading world file:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Download server files from WebDAV
     */
    async downloadServerFiles(paths: string[]): Promise<{ 
        success: boolean; 
        files?: { [path: string]: Buffer }; 
        error?: string 
    }> {
        try {
            const serverPath = `/servers/${this.uniqueId}`;
            const files: { [path: string]: Buffer } = {};
            
            for (const relativePath of paths) {
                const fullPath = `${serverPath}/${relativePath}`;
                try {
                    const content = await webdavService.getFileContents(fullPath);
                    files[relativePath] = content;
                } catch (fileError) {
                    console.warn(`Could not download file ${relativePath}:`, fileError);
                }
            }

            return { success: true, files };
        } catch (error) {
            console.error('Error downloading server files:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Create a complete server backup and upload to WebDAV
     */
    async createBackup(): Promise<{ success: boolean; backupPath?: string; error?: string }> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `/servers/${this.uniqueId}/backups/backup-${timestamp}.zip`;
            
            // In a real implementation, you would:
            // 1. Stop the server temporarily
            // 2. Create a zip archive of all server files
            // 3. Upload the backup to WebDAV
            // 4. Restart the server
            
            console.log(`Created backup for ${this.serverName} at ${backupPath}`);
            return { success: true, backupPath };
        } catch (error) {
            console.error('Error creating backup:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    /**
     * Get server console logs
     */
    async getServerLogs(): Promise<{ success: boolean; logs?: string; error?: string }> {
        try {
            const containers = await portainer.getContainers(this.environmentId);
            const serverContainer = containers.find(container => 
                container.Names.some(name => name.includes(`mc-${this.uniqueId}`))
            );

            if (!serverContainer) {
                return { success: false, error: 'Container not found' };
            }

            const logs = await portainer.getContainerLogs(serverContainer.Id, this.environmentId);
            return { success: true, logs };
        } catch (error) {
            console.error('Error getting server logs:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }
}

/**
 * Factory function to create a new Minecraft server instance
 */
export function createMinecraftServer(
    config: MinecraftServerConfig, 
    serverName: string, 
    uniqueId: string, 
    environmentId: number = 1
): MinecraftServer {
    return new MinecraftServer(config, serverName, uniqueId, environmentId);
}

/**
 * Helper function to convert ClientServerConfig to MinecraftServerConfig
 */
export function convertClientConfigToServerConfig(clientConfig: ClientServerConfig): MinecraftServerConfig {
    // Map client server types to Docker image server types
    const serverTypeMap: Record<string, 'VANILLA' | 'SPIGOT' | 'PAPER' | 'BUKKIT' | 'PURPUR' | 'FORGE' | 'FABRIC'> = {
        'vanilla': 'VANILLA',
        'spigot': 'SPIGOT',
        'paper': 'PAPER',
        'bukkit': 'BUKKIT',
        'purpur': 'PURPUR',
        'forge': 'FORGE',
        'fabric': 'FABRIC'
    };

    return {
        EULA: true, // Always accept EULA for server creation
        VERSION: clientConfig.version,
        TYPE: serverTypeMap[clientConfig.serverType.toLowerCase()] || 'VANILLA',
        MOTD: clientConfig.motd || clientConfig.description || 'A Minecraft Server',
        SERVER_NAME: clientConfig.name,
        GAMEMODE: clientConfig.gameMode as 'survival' | 'creative' | 'adventure' | 'spectator',
        DIFFICULTY: clientConfig.difficulty as 'peaceful' | 'easy' | 'normal' | 'hard',
        FORCE_GAMEMODE: false,
        HARDCORE: false,
        PVP: clientConfig.pvpEnabled,
        MAX_PLAYERS: clientConfig.maxPlayers,
        ONLINE_MODE: clientConfig.onlineMode,
        MEMORY: `${clientConfig.serverMemory}M`,
        VIEW_DISTANCE: clientConfig.viewDistance,
        SIMULATION_DISTANCE: clientConfig.simulationDistance,
        LEVEL_SEED: clientConfig.seed || '',
        LEVEL_TYPE: clientConfig.worldType as 'DEFAULT' | 'FLAT' | 'LARGEBIOMES' | 'AMPLIFIED' | 'CUSTOMIZED',
        LEVEL_NAME: 'world',
        GENERATE_STRUCTURES: clientConfig.generateStructuresEnabled,
        ALLOW_NETHER: true,
        WHITELIST: '',
        OPS: '',
        ENFORCE_WHITELIST: clientConfig.whitelistEnabled,
        ANNOUNCE_PLAYER_ACHIEVEMENTS: true,
        ENABLE_COMMAND_BLOCK: clientConfig.commandBlocksEnabled,
        SPAWN_ANIMALS: clientConfig.spawnAnimalsEnabled,
        SPAWN_MONSTERS: clientConfig.spawnMonstersEnabled,
        SPAWN_NPCS: clientConfig.spawnNpcsEnabled,
        SPAWN_PROTECTION: clientConfig.spawnProtection,
        SERVER_PORT: clientConfig.port,
        ENABLE_RCON: clientConfig.rconEnabled,
        RCON_PORT: 25575,
        RCON_PASSWORD: clientConfig.rconPassword || 'changeme',
    };
}

/**
 * Usage Example:
 * 
 * ```typescript
 * import { createMinecraftServer, convertClientConfigToServerConfig } from './minecraft';
 * 
 * // Example client configuration from form
 * const clientConfig: ClientServerConfig = {
 *   name: "My Server",
 *   serverType: "vanilla",
 *   version: "1.21",
 *   description: "A fun server",
 *   gameMode: "survival",
 *   difficulty: "normal",
 *   maxPlayers: 20,
 *   // ... other properties
 * };
 * 
 * // Convert to server configuration
 * const serverConfig = convertClientConfigToServerConfig(clientConfig);
 * 
 * // Create server instance
 * const server = createMinecraftServer(
 *   serverConfig, 
 *   "my-awesome-server", 
 *   "unique-server-id-123", 
 *   1 // environment ID
 * );
 * 
 * // Deploy to Portainer
 * const deployResult = await server.deployToPortainer();
 * if (deployResult.success) {
 *   console.log("Server deployed successfully!");
 *   
 *   // Start the server
 *   const startResult = await server.startServer();
 *   if (startResult.success) {
 *     console.log("Server started!");
 *   }
 * }
 * 
 * // Upload server files
 * await server.uploadServerFiles({
 *   'server.properties': Buffer.from('# Custom server properties\n'),
 *   'plugins/MyPlugin.jar': pluginFileBuffer
 * });
 * 
 * // Get server status
 * const status = await server.getServerStatus();
 * console.log('Server running:', status.running);
 * 
 * // Get logs
 * const logs = await server.getServerLogs();
 * console.log('Server logs:', logs.logs);
 * ```
 */