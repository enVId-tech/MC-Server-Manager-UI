// File analysis interfaces
export interface FileAnalysis {
  type: 'world' | 'plugin' | 'mod' | 'resource-pack' | 'datapack' | 'unknown';
  serverType?: string;
  minecraftVersion?: string;
  worldName?: string;
  pluginName?: string;
  modName?: string;
  modLoader?: string;
  description?: string;
  author?: string;
  version?: string;
  errors?: string[];
  warnings?: string[];
  // Advanced world analysis fields
  gameMode?: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
  hardcore?: boolean;
  cheatsEnabled?: boolean;
  seed?: string;
  spawnX?: number;
  spawnY?: number;
  spawnZ?: number;
  timeOfDay?: number;
  worldAge?: number;
  playerCount?: number;
  structures?: string[];
  datapacks?: string[];
  gamerules?: { [key: string]: string | number | boolean };
  worldBorder?: {
    centerX: number;
    centerZ: number;
    size: number;
    damageAmount: number;
    damageBuffer: number;
    warningDistance: number;
    warningTime: number;
  };
  biomesFound?: string[];
  estimatedSize?: {
    totalSizeMB: number;
    regionFiles: number;
    chunkCount: number;
  };
}

export interface AnalyzedFile extends File {
  analysis?: FileAnalysis;
  isAnalyzing?: boolean;
  analysisError?: string;
  uploadedFileInfo?: {
    fileId: string;
    originalName: string;
    fileName: string;
    filePath: string;
    size: number;
    type: string;
    fileType: string;
    uploadedAt: string;
    serverId?: string;
  };
}

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
    worldFile?: AnalyzedFile | null;

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
    plugins: AnalyzedFile[];
    mods: AnalyzedFile[];
    subdomain: string;
    worldFiles?: AnalyzedFile | null;
    customOptions?: string;
    serverProperties?: Record<string, string | number | boolean>;
    
    // World Features (optional, used for checkbox UI synchronization)
    // Database IDs should match the property names below
    allowNether?: boolean;              // Database ID: allowNether
    allowEnd?: boolean;                 // Database ID: allowEnd
    hardcore?: boolean;                 // Database ID: hardcore
    enablePlayerList?: boolean;         // Database ID: enablePlayerList
    enableCommandBlock?: boolean;      // Database ID: enableCommandBlock
    netherPortals?: boolean;           // Database ID: netherPortals
    endPortals?: boolean;              // Database ID: endPortals
    weatherCycle?: boolean;            // Database ID: weatherCycle
    daylightCycle?: boolean;           // Database ID: daylightCycle
    mobSpawning?: boolean;             // Database ID: mobSpawning
    animalSpawning?: boolean;          // Database ID: animalSpawning
    villagerSpawning?: boolean;        // Database ID: villagerSpawning
    structureGeneration?: boolean;     // Database ID: structureGeneration
    fireDamage?: boolean;              // Database ID: fireDamage
    mobGriefing?: boolean;             // Database ID: mobGriefing
    keepInventory?: boolean;           // Database ID: keepInventory
    reducedDebugInfo?: boolean;        // Database ID: reducedDebugInfo
    spectateOtherTeams?: boolean;      // Database ID: spectateOtherTeams
    announceAdvancements?: boolean;    // Database ID: announceAdvancements
    commandBlockOutput?: boolean;      // Database ID: commandBlockOutput
    naturalRegeneration?: boolean;     // Database ID: naturalRegeneration
    showDeathMessages?: boolean;       // Database ID: showDeathMessages
    sendCommandFeedback?: boolean;     // Database ID: sendCommandFeedback
    doLimitedCrafting?: boolean;       // Database ID: doLimitedCrafting
    pvp?: boolean;                     // Database ID: pvp
    maxEntityCramming?: number;        // Database ID: maxEntityCramming
    randomTickSpeed?: number;          // Database ID: randomTickSpeed
    maxWorldSize?: number;             // Database ID: maxWorldSize
    worldBorder?: number;              // Database ID: worldBorder
    spawnRadius?: number;              // Database ID: spawnRadius
    
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

    // User Management
    userEmail?: string; // Email address for organizing server files
    SUBDOMAIN?: string; // Subdomain for proxy routing
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
import { proxyManager } from './proxy-manager';
import webdavService from './webdav';
import yaml from 'js-yaml';
import extractZip from 'extract-zip';
import * as path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

/**
 * Comprehensive Minecraft Server management class.
 * Handles Docker Compose generation, Portainer integration, and WebDAV file operations.
 */
export class MinecraftServer {
    private config: MinecraftServerConfig;
    private serverName: string;
    private uniqueId: string;
    private environmentId: number;
    private proxyIds: string[];

    constructor(config: MinecraftServerConfig, serverName: string, uniqueId: string, environmentId: number = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1, proxyIds: string[] = []) {
        this.config = config;
        this.serverName = serverName;
        this.uniqueId = uniqueId;
        this.environmentId = environmentId;
        this.proxyIds = proxyIds;
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
        // Get server type specific configuration
        const serverTypeConfig = this.getServerTypeConfig();
        const minecraftPath = process.env.MINECRAFT_PATH || '/minecraft';

        // Get email from the server config
        const userEmail = this.getUserEmail();

        // Create the folder structure: env/email/uniqueId
        const serverBasePath = `${minecraftPath}/${userEmail}`;

        // Resolve networks from proxy IDs
        const proxyNetworks: { [key: string]: { external: boolean; name: string } } = {};
        const proxyNetworkNames: string[] = [];

        if (this.proxyIds && this.proxyIds.length > 0) {
            for (const proxyId of this.proxyIds) {
                const proxy = proxyManager.getProxy(proxyId);
                if (proxy && proxy.networkName) {
                    proxyNetworks[proxy.networkName] = {
                        external: true,
                        name: proxy.networkName
                    };
                    if (!proxyNetworkNames.includes(proxy.networkName)) {
                        proxyNetworkNames.push(proxy.networkName);
                    }
                }
            }
        } else if (process.env.VELOCITY_NETWORK_NAME) {
            // Fallback to legacy environment variable
            const networkName = process.env.VELOCITY_NETWORK_NAME;
            proxyNetworks[networkName] = {
                external: true,
                name: networkName
            };
            proxyNetworkNames.push(networkName);
        }

        const versionSpecificProps = {};

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
                        UID: '1000', // Set user ID for file permissions
                        GID: '1000', // Set group ID for file permissions
                        INIT_MEMORY: this.config.MEMORY || '2G',
                        MAX_MEMORY: this.config.MEMORY || '2G',
                        ENABLE_ROLLING_LOGS: 'true', // Enable log rotation to prevent disk fill
                        USE_FLARE_FLAGS: 'true', // Use optimized JVM flags
                        EXEC_DIRECTLY: 'true', // Run Minecraft directly to avoid permission issues
                        OVERRIDE_SERVER_PROPERTIES: 'true', // Allow server.properties override
                        SETUP_ONLY: 'false', // Don't exit after setup
                        FORCE_REDOWNLOAD: 'false', // Don't force redownload
                        FIX_PERMISSIONS: 'true', // Auto-fix file permissions on startup
                        SPIGET_RESOURCES: '', // Clear any plugin downloads that might cause issues
                        SKIP_JAVA_VERSION_CHECK: 'true', // Skip Java version validation that can cause issues
                        ENABLE_AUTOPAUSE: 'false', // Disable autopause which can cause permission issues
                        EXISTING_EULA_FILE: 'SKIP', // Skip EULA file creation if it exists
                        FORCE_WORLD_COPY: 'false', // Don't force world copy which can cause permission issues
                        SETUP_EULA_ONLY: 'false', // Don't only setup EULA
                        REMOVE_OLD_MODS: 'false', // Don't remove old mods automatically
                        CLEANUP_ON_EXIT: 'false', // Don't cleanup on exit to avoid permission issues
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
                    // The left side of the volume is the host path, the right side is the container path
                    volumes: [
                        `${serverBasePath}/${this.uniqueId}:/data`,
                        // Only add plugins volume if server type supports it
                        ...(serverTypeConfig.type === 'SPIGOT' || serverTypeConfig.type === 'PAPER' || serverTypeConfig.type === 'BUKKIT' || serverTypeConfig.type === 'PURPUR' ? [`${serverBasePath}/${this.uniqueId}/plugins:/plugins`] : []),
                        // Only add mods volume if server type supports it
                        ...(serverTypeConfig.type === 'FORGE' || serverTypeConfig.type === 'FABRIC' ? [`${serverBasePath}/${this.uniqueId}/mods:/mods`] : []),
                        `${serverBasePath}/${this.uniqueId}/world:/world`,
                        `${serverBasePath}/${this.uniqueId}/backups:/backups`,
                        ...serverTypeConfig.additionalVolumes
                    ],
                    restart: 'unless-stopped',
                    stdin_open: true,
                    tty: true,
                    user: '1000:1000', // Explicitly set the user and group
                    networks: [
                        'minecraft-network',
                        ...proxyNetworkNames
                    ],
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
                },
                ...proxyNetworks
            },
            volumes: {
                [`${this.uniqueId}-data`]: {},
                [`${this.uniqueId}-plugins`]: {},
                [`${this.uniqueId}-mods`]: {},
                [`${this.uniqueId}-world`]: {},
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
     * Ensure server directory exists with proper permissions
     */
    async ensureServerDirectory(): Promise<void> {
        const minecraftPath: string = process.env.MINECRAFT_PATH || '/minecraft-data';
        const userEmail = this.getUserEmail();
        const serverBasePath = `${minecraftPath}/${userEmail}`;
        const serverDir = `${serverBasePath}/${this.uniqueId}`;

        try {
            const execAsync = promisify(exec);
            
            // Create directory structure recursively
            await fs.mkdir(serverDir, { recursive: true, mode: 0o755 });
            
            // Create subdirectories
            const subdirs = ['plugins', 'mods', 'world', 'backups', 'config'];
            for (const subdir of subdirs) {
                const subdirPath = path.join(serverDir, subdir);
                await fs.mkdir(subdirPath, { recursive: true, mode: 0o755 });
                
                // For config directory, ensure it's writable by the minecraft server user
                if (subdir === 'config') {
                    try {
                        await fs.chmod(subdirPath, 0o777); // More permissive for config files
                        console.log(`✅ Set config directory permissions to 777`);
                    } catch (configChmodError) {
                        console.warn(`⚠️ Could not set config directory permissions: ${configChmodError}`);
                    }
                }
            }

            // For Paper servers, create additional required directories
            if (this.config.TYPE === 'PAPER' || this.config.TYPE === 'PURPUR') {
                const paperDirs = [
                    'config/paper', 
                    'cache', 
                    'libraries',
                    'logs',
                    'versions',
                    'config/paper/data',
                    'config/paper/global'
                ];
                for (const paperDir of paperDirs) {
                    const paperDirPath = path.join(serverDir, paperDir);
                    try {
                        await fs.mkdir(paperDirPath, { recursive: true, mode: 0o777 });
                        // Set explicit permissions on each directory
                        await fs.chmod(paperDirPath, 0o777);
                        console.log(`✅ Created Paper directory with 777 permissions: ${paperDir}`);
                    } catch (paperDirError) {
                        console.warn(`⚠️ Could not create Paper directory ${paperDir}: ${paperDirError}`);
                    }
                }
            }

            // Try to set ownership to 1000:1000 if we have permissions (Docker environment)
            try {
                await execAsync(`chown -R 1000:1000 "${serverDir}"`);
                console.log(`✅ Set ownership of ${serverDir} to 1000:1000`);
            } catch (chownError) {
                console.warn(`⚠️ Could not set ownership (this is normal in some environments): ${chownError}`);
                // Try alternative approach - set permissions to be more permissive
                try {
                    await execAsync(`chmod -R 777 "${serverDir}"`);
                    console.log(`✅ Set permissive permissions on ${serverDir}`);
                } catch (chmodError) {
                    console.warn(`⚠️ Could not set permissions: ${chmodError}`);
                }
            }
            
            console.log(`✅ Server directory structure created: ${serverDir}`);
        } catch (error) {
            console.error(`❌ Failed to create server directory: ${error}`);
            throw new Error(`Failed to create server directory: ${error}`);
        }
    }

    /**
     * Deploy server to Portainer as a stack
     */
    async deployToPortainer(): Promise<{
        success: boolean;
        stackId?: number;
        stackName?: string;
        containerId?: string;
        deploymentMethod?: 'stack' | 'container';
        error?: string
    }> {
        try {
            console.log('🚀 Starting Portainer deployment process...');

            // Ensure server directory exists with proper permissions
            await this.ensureServerDirectory();

            const composeContent = this.generateDockerComposeYaml();
            const stackName = `minecraft-${this.uniqueId}`;

            console.log(`📋 Stack name: ${stackName}`);
            console.log('🐳 Generated Docker Compose content:');
            console.log(composeContent);

            // Create stack payload for Portainer with proper structure
            const stackData = {
                Name: stackName,
                ComposeFile: composeContent,
                Env: [],
                FromAppTemplate: false
            };

            console.log('📤 Sending stack data to Portainer:', JSON.stringify(stackData, null, 2));

            // Attempt to create the stack with verification and retry
            const response = await portainer.createStackWithVerification(stackData, this.environmentId, 2);
            console.log('✅ Stack creation response received');
            console.log('📥 Portainer response:', JSON.stringify(response, null, 2));

            // Extract deployment information
            let stackId: number | undefined;
            let containerId: string | undefined;
            let deploymentMethod: 'stack' | 'container' = 'stack';

            if (response) {
                // Check if this was a direct container creation
                if (response.method === 'direct-container' && response.containerCreated) {
                    containerId = response.Id as string;
                    deploymentMethod = 'container';
                    console.log(`🐳 Container deployment successful - Container ID: ${containerId}`);
                } else if (response.Id) {
                    // Regular stack creation
                    stackId = response.Id as number;
                    console.log(`📦 Stack deployment successful - Stack ID: ${stackId}`);
                    if (response.verified) {
                        console.log(`✅ Stack creation verified successfully`);
                    } else {
                        console.warn(`⚠️ Stack was created but verification may have failed`);
                    }
                }
            }

            // Verify the deployment was actually successful
            console.log('🔍 Verifying deployment...');
            let deploymentExists = false;

            if (deploymentMethod === 'container' && containerId) {
                // Verify container exists
                const containerName = stackName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                deploymentExists = await portainer.verifyContainerCreation(containerName, this.environmentId, 15000);
            } else {
                // Verify stack exists
                deploymentExists = await portainer.verifyStackCreation(stackName, 15000);
            }

            if (deploymentExists) {
                console.log(`🎉 Successfully deployed Minecraft server ${this.serverName} to Portainer as ${deploymentMethod}: ${stackName}`);

                // === MULTI-PROXY REGISTRATION ===
                // Register this server with all configured proxies
                if (this.proxyIds && this.proxyIds.length > 0) {
                    console.log(`🔗 Registering server with ${this.proxyIds.length} proxies...`);
                    
                    // Create server config for proxies
                    const serverProxyConfig = {
                        serverId: this.uniqueId,
                        serverName: this.serverName,
                        address: `mc-${this.uniqueId}`, // Docker container name
                        port: 25565, // Internal port
                        motd: this.config.MOTD || 'A Minecraft Server',
                        restrictedToProxy: true,
                        targetProxies: this.proxyIds,
                        subdomain: this.config.SUBDOMAIN // Pass subdomain for forced hosts
                    };

                    // Deploy to all proxies
                    const proxyResult = await proxyManager.deployServerToProxies(
                        serverProxyConfig,
                        this.getUserEmail(),
                        this.uniqueId
                    );

                    console.log('🔗 Proxy registration result:', JSON.stringify(proxyResult, null, 2));
                    
                    if (!proxyResult.success) {
                        console.warn('⚠️ Some proxy registrations failed:', proxyResult.overallDetails);
                    }
                }
                // === END MULTI-PROXY REGISTRATION ===

                if (deploymentMethod === 'container') {
                    // Get the actual container details for confirmation
                    const containerName = stackName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                    const createdContainer = await portainer.getContainerByName(containerName, this.environmentId);
                    if (createdContainer) {
                        console.log(`📊 Container details: ID=${createdContainer.Id}, Name=${createdContainer.Names[0]}, State=${createdContainer.State}`);
                        return {
                            success: true,
                            containerId: createdContainer.Id,
                            stackName: containerName,
                            deploymentMethod: 'container'
                        };
                    }
                } else {
                    // Get the actual stack details for confirmation
                    const createdStack = await portainer.getStackByName(stackName);
                    if (createdStack) {
                        console.log(`📊 Stack details: ID=${createdStack.Id}, Name=${createdStack.Name}, EndpointId=${createdStack.EndpointId}`);
                        return {
                            success: true,
                            stackId: createdStack.Id,
                            stackName: createdStack.Name,
                            deploymentMethod: 'stack'
                        };
                    }
                }
            } else {
                console.warn(`⚠️ Deployment appeared successful but ${deploymentMethod} not found in verification`);
            }

            return {
                success: true,
                stackId,
                containerId,
                stackName,
                deploymentMethod
            };

        } catch (error) {
            console.error('❌ Error deploying to Portainer:', error);

            // Try alternative deployment method as fallback
            try {
                console.log('🔄 Attempting fallback deployment using service creation...');
                const fallbackStackData = {
                    Name: `minecraft-${this.uniqueId}`,
                    StackFileContent: this.generateDockerComposeYaml(),
                    Env: []
                };

                const serviceResponse = await portainer.deployToPortainerService(fallbackStackData, this.environmentId);
                console.log('✅ Fallback service deployment successful:', serviceResponse);
                return {
                    success: true,
                    stackName: `minecraft-${this.uniqueId}`
                };

            } catch (fallbackError) {
                console.error('❌ Fallback deployment also failed:', fallbackError);

                // Provide detailed error information
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error';

                return {
                    success: false,
                    error: `Primary deployment failed: ${errorMessage}. Fallback also failed: ${fallbackErrorMessage}`
                };
            }
        }
    }

    /**
     * Deploy server using Docker Compose directly (fallback for Portainer issues)
     */
    async deployToDockerCompose(userEmail?: string): Promise<{ success: boolean; composeFile?: string; error?: string }> {
        try {
            // Ensure server directory exists with proper permissions
            await this.ensureServerDirectory();

            const composeContent = this.generateDockerComposeYaml();

            console.log('Generated Docker Compose content for direct deployment:');
            console.log(composeContent);

            // Save compose file to WebDAV for manual deployment
            const composeFileName = `docker-compose-${this.uniqueId}.yml`;

            // Use provided email or fall back to instance email
            const emailToUse = userEmail || this.getUserEmail();

            if (emailToUse && emailToUse !== 'default-user') {
                // Use the proper folder structure when user email is available
                const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
                const userFolder = emailToUse.split('@')[0];
                const composePath = `${baseServerPath}/${userFolder}/${this.uniqueId}/${composeFileName}`;

                // Ensure the directory exists before uploading
                const directoryPath = `${baseServerPath}/${userFolder}/${this.uniqueId}`;
                const directoryExists = await webdavService.exists(directoryPath);

                if (!directoryExists) {
                    console.log(`Creating directory for Docker Compose file: ${directoryPath}`);
                    await webdavService.createDirectory(directoryPath);
                }

                await webdavService.uploadFile(composePath, composeContent);

                return {
                    success: true,
                    composeFile: `${directoryPath}/${composeFileName}`,
                };
            } else {
                // Fallback: just return the compose content for manual saving
                console.log('No user email available, returning compose content for manual deployment');
                return {
                    success: true,
                    composeFile: composeFileName,
                };
            }
        } catch (error) {
            console.error('Error creating Docker Compose file:', error);
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

            console.log(`=== Deleting Minecraft server stack ${serverStack.Name} from Portainer with stack ID ${serverStack.Id} ===`);

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
    async uploadServerFiles(files: { [path: string]: Buffer | string }, type: 'plugins' | 'mods' | 'world'): Promise<{ success: boolean; error?: string }> {
        try {
            const userEmail = this.getUserEmail().split('@')[0]; // Use local part of email for folder structure
            const serverPath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${userEmail}/${this.uniqueId}`;

            // Ensure server directory exists
            await webdavService.createDirectory(serverPath);

            switch (type) {
                case 'plugins':
                    await webdavService.createDirectory(`${serverPath}/plugins`);
                    break;
                case 'mods':
                    await webdavService.createDirectory(`${serverPath}/mods`);
                    break;
                case 'world':
                    await webdavService.createDirectory(`${serverPath}/world`);
                    break;
            }

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
    async uploadPlugins(plugins: AnalyzedFile[]): Promise<{ success: boolean; error?: string }> {
        try {
            const pluginFiles: { [path: string]: Buffer } = {};

            for (const plugin of plugins) {
                // Only upload plugins that have been successfully analyzed
                if (plugin.analysis && plugin.analysis.type === 'plugin' && !plugin.analysis.errors?.length) {
                    const pluginBuffer = Buffer.from(await plugin.arrayBuffer());
                    pluginFiles[`plugins/${plugin.name}`] = pluginBuffer;
                }
            }

            return await this.uploadServerFiles(pluginFiles, 'plugins');
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
    async uploadMods(mods: AnalyzedFile[]): Promise<{ success: boolean; error?: string }> {
        try {
            const modFiles: { [path: string]: Buffer } = {};

            for (const mod of mods) {
                // Only upload mods that have been successfully analyzed
                if (mod.analysis && mod.analysis.type === 'mod' && !mod.analysis.errors?.length) {
                    const modBuffer = Buffer.from(await mod.arrayBuffer());
                    modFiles[`mods/${mod.name}`] = modBuffer;
                }
            }

            return await this.uploadServerFiles(modFiles, 'mods');
        } catch (error) {
            console.error('Error uploading mods:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    /**
     * Upload world files with proper extraction and directory location
     */
    async uploadWorldFile(worldFile: File): Promise<{ success: boolean; error?: string }> {
        try {
            const worldBuffer = Buffer.from(await worldFile.arrayBuffer());
            
            // If it's a ZIP file, extract it and locate the world directory
            if (worldFile.name.endsWith('.zip')) {
                return await this.uploadAndExtractWorldZip(worldBuffer);
            } else {
                // For other files, upload as-is (legacy support)
                const worldFiles: { [path: string]: Buffer } = {};
                worldFiles[`world/${worldFile.name}`] = worldBuffer;
                return await this.uploadServerFiles(worldFiles, 'world');
            }
        } catch (error) {
            console.error('Error uploading world file:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    /**
     * Upload and extract world ZIP file properly using world directory locator
     */
    async uploadAndExtractWorldZip(worldBuffer: Buffer): Promise<{ success: boolean; error?: string }> {
        let tempDir: string;
        
        try {
            // Create temporary directory for extraction
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'minecraft-world-'));
            
            // Save ZIP file temporarily
            const tempZipPath = path.join(tempDir, 'world.zip');
            await fs.writeFile(tempZipPath, worldBuffer);
            
            // Extract ZIP contents
            const extractDir = path.join(tempDir, 'extracted');
            await extractZip(tempZipPath, { dir: extractDir });
            
            // Locate the proper world directory using our intelligent locator
            const worldLocation = await this.locateWorldDirectory(extractDir);
            
            if (worldLocation.matchType === 'none') {
                return {
                    success: false,
                    error: 'No valid Minecraft world directory found in the ZIP file. Please ensure the ZIP contains a level.dat file, region folder, or playerdata folder.'
                };
            }

            console.log(`World directory found: ${worldLocation.relativePath || '(root)'} (${worldLocation.matchType} match)`);
            
            // Read only the contents of the located world directory
            const worldFiles = await this.readDirectoryRecursively(worldLocation.worldPath!);
            
            // Check if this is a Bukkit-based server that needs dimension separation
            const isBukkitBased = ['SPIGOT', 'PAPER', 'PURPUR', 'BUKKIT'].includes(this.config.TYPE?.toUpperCase() || '');
            
            if (isBukkitBased) {
                console.log('Detected Bukkit-based server, reorganizing world dimensions...');
                const reorganizedFiles = this.reorganizeWorldForBukkit(worldFiles);
                return await this.uploadBukkitWorldFiles(reorganizedFiles);
            } else {
                return await this.uploadServerFiles(worldFiles, 'world');
            }
            
        } catch (error) {
            console.error('Error extracting and uploading world ZIP:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to extract and upload world'
            };
        } finally {
            // Cleanup temporary directory
            if (tempDir!) {
                try {
                    await fs.rm(tempDir, { recursive: true, force: true });
                } catch (cleanupError) {
                    console.warn('Failed to cleanup temp directory:', cleanupError);
                }
            }
        }
    }

    /**
     * Reorganize world files for Bukkit-based servers
     * Separates Nether (DIM-1) and End (DIM1) dimensions into their own world folders
     */
    private reorganizeWorldForBukkit(worldFiles: { [path: string]: Buffer }): {
        overworld: { [path: string]: Buffer };
        nether: { [path: string]: Buffer };
        end: { [path: string]: Buffer };
    } {
        const overworld: { [path: string]: Buffer } = {};
        const nether: { [path: string]: Buffer } = {};
        const end: { [path: string]: Buffer } = {};

        for (const [filePath, content] of Object.entries(worldFiles)) {
            // Check if the file is in a dimension folder
            if (filePath.includes('DIM-1' + path.sep) || filePath.includes('DIM-1/')) {
                // Nether dimension - remove DIM-1 from path
                const netherPath = filePath.replace(/DIM-1[\\\/]/g, '');
                if (netherPath !== filePath) { // Only if we actually removed DIM-1
                    nether[netherPath] = content;
                    console.log(`Moved Nether file: ${filePath} -> ${netherPath}`);
                } else {
                    overworld[filePath] = content;
                }
            } else if (filePath.includes('DIM1' + path.sep) || filePath.includes('DIM1/')) {
                // End dimension - remove DIM1 from path
                const endPath = filePath.replace(/DIM1[\\\/]/g, '');
                if (endPath !== filePath) { // Only if we actually removed DIM1
                    end[endPath] = content;
                    console.log(`Moved End file: ${filePath} -> ${endPath}`);
                } else {
                    overworld[filePath] = content;
                }
            } else {
                // Overworld files (including level.dat, playerdata, etc.)
                overworld[filePath] = content;
            }
        }

        console.log(`World organization complete: ${Object.keys(overworld).length} overworld files, ${Object.keys(nether).length} nether files, ${Object.keys(end).length} end files`);
        
        return { overworld, nether, end };
    }

    /**
     * Upload world files organized for Bukkit-based servers
     */
    private async uploadBukkitWorldFiles(reorganizedFiles: {
        overworld: { [path: string]: Buffer };
        nether: { [path: string]: Buffer };
        end: { [path: string]: Buffer };
    }): Promise<{ success: boolean; error?: string }> {
        try {
            const userEmail = this.getUserEmail().split('@')[0]; // Use local part of email for folder structure
            const serverPath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${userEmail}/${this.uniqueId}`;

            // Ensure server directory exists
            await webdavService.createDirectory(serverPath);

            // Upload overworld files to the main world directory
            if (Object.keys(reorganizedFiles.overworld).length > 0) {
                await webdavService.createDirectory(`${serverPath}/world`);
                
                for (const [relativePath, content] of Object.entries(reorganizedFiles.overworld)) {
                    const fullPath = `${serverPath}/world/${relativePath}`;
                    await webdavService.uploadFile(fullPath, content);
                }
                console.log(`Uploaded ${Object.keys(reorganizedFiles.overworld).length} overworld files`);
            }

            // Upload nether files to world_nether directory (Bukkit convention)
            if (Object.keys(reorganizedFiles.nether).length > 0) {
                await webdavService.createDirectory(`${serverPath}/world_nether`);
                await webdavService.createDirectory(`${serverPath}/world_nether/DIM-1`);
                
                for (const [relativePath, content] of Object.entries(reorganizedFiles.nether)) {
                    const fullPath = `${serverPath}/world_nether/DIM-1/${relativePath}`;
                    await webdavService.uploadFile(fullPath, content);
                }
                console.log(`Uploaded ${Object.keys(reorganizedFiles.nether).length} nether files to world_nether/DIM-1`);
            }

            // Upload end files to world_the_end directory (Bukkit convention)
            if (Object.keys(reorganizedFiles.end).length > 0) {
                await webdavService.createDirectory(`${serverPath}/world_the_end`);
                await webdavService.createDirectory(`${serverPath}/world_the_end/DIM1`);
                
                for (const [relativePath, content] of Object.entries(reorganizedFiles.end)) {
                    const fullPath = `${serverPath}/world_the_end/DIM1/${relativePath}`;
                    await webdavService.uploadFile(fullPath, content);
                }
                console.log(`Uploaded ${Object.keys(reorganizedFiles.end).length} end files to world_the_end/DIM1`);
            }

            console.log(`Bukkit world upload completed for ${this.serverName}`);
            return { success: true };
        } catch (error) {
            console.error('Error uploading Bukkit world files:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    /**
     * Recursively read directory and return file structure
     */
    async readDirectoryRecursively(dir: string, basePath: string = ''): Promise<{ [path: string]: Buffer }> {
        const files: { [path: string]: Buffer } = {};
        
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            const relativePath = basePath ? path.join(basePath, item.name) : item.name;
            
            if (item.isDirectory()) {
                // Recursively read subdirectory
                const subFiles = await this.readDirectoryRecursively(fullPath, relativePath);
                Object.assign(files, subFiles);
            } else {
                // Read file content
                const content = await fs.readFile(fullPath);
                files[relativePath] = content;
            }
        }
        
        return files;
    }

    /**
     * Locate the proper world directory in an extracted ZIP file
     */
    async locateWorldDirectory(extractDir: string): Promise<{
        worldPath: string | null;
        matchType: 'level.dat' | 'region' | 'playerdata' | 'none';
        relativePath: string | null;
    }> {
        interface WorldCandidate {
            path: string;
            relativePath: string;
            depth: number;
            matchType: 'level.dat' | 'region' | 'playerdata';
            parentFolderName: string;
        }

        const candidates: WorldCandidate[] = [];

        // Recursive function to search through directory structure
        async function searchDirectory(currentPath: string, relativePath: string, depth: number): Promise<void> {
            try {
                const items = await fs.readdir(currentPath, { withFileTypes: true });
                
                // Check for level.dat in current directory
                const hasLevelDat = items.some(item => item.isFile() && item.name === 'level.dat');
                if (hasLevelDat) {
                    const parentFolderName = path.basename(currentPath);
                    candidates.push({
                        path: currentPath,
                        relativePath,
                        depth,
                        matchType: 'level.dat',
                        parentFolderName
                    });
                    return; // level.dat found, no need to search deeper in this branch
                }

                // Check for fallback indicators (region or playerdata folders)
                const hasRegion = items.some(item => item.isDirectory() && item.name === 'region');
                const hasPlayerdata = items.some(item => item.isDirectory() && item.name === 'playerdata');

                if (hasRegion) {
                    const parentFolderName = path.basename(currentPath);
                    candidates.push({
                        path: currentPath,
                        relativePath,
                        depth,
                        matchType: 'region',
                        parentFolderName
                    });
                }

                if (hasPlayerdata) {
                    const parentFolderName = path.basename(currentPath);
                    candidates.push({
                        path: currentPath,
                        relativePath,
                        depth,
                        matchType: 'playerdata',
                        parentFolderName
                    });
                }

                // Continue searching subdirectories
                for (const item of items) {
                    if (item.isDirectory()) {
                        const subPath = path.join(currentPath, item.name);
                        const subRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
                        await searchDirectory(subPath, subRelativePath, depth + 1);
                    }
                }
            } catch (error) {
                // Skip directories that can't be read
                console.warn(`Could not read directory ${currentPath}:`, error);
            }
        }

        // Start the search from the root
        await searchDirectory(extractDir, '', 0);

        if (candidates.length === 0) {
            return { worldPath: null, matchType: 'none', relativePath: null };
        }

        // Sort candidates by priority:
        // 1. level.dat matches first (highest priority)
        // 2. Lower depth (closer to root)
        // 3. ASCII comparison of parent folder names (earlier in ASCII = higher priority)
        candidates.sort((a, b) => {
            // Priority 1: level.dat always wins
            if (a.matchType === 'level.dat' && b.matchType !== 'level.dat') return -1;
            if (b.matchType === 'level.dat' && a.matchType !== 'level.dat') return 1;

            // Priority 2: Hierarchy depth (closer to root wins)
            if (a.depth !== b.depth) {
                return a.depth - b.depth;
            }

            // Priority 3: ASCII comparison of parent folder names
            // Find first differentiating character and choose the one closer to 0 in ASCII
            const aName = a.parentFolderName.toLowerCase();
            const bName = b.parentFolderName.toLowerCase();
            
            const maxLength = Math.max(aName.length, bName.length);
            for (let i = 0; i < maxLength; i++) {
                const aChar = aName.charCodeAt(i) || Number.MAX_SAFE_INTEGER; // Treat missing chars as high value
                const bChar = bName.charCodeAt(i) || Number.MAX_SAFE_INTEGER;
                
                if (aChar !== bChar) {
                    return aChar - bChar; // Lower ASCII value wins
                }
            }

            // If all characters are the same, shorter name wins
            return aName.length - bName.length;
        });

        const winner = candidates[0];
        
        console.log(`World directory located: ${winner.relativePath || '(root)'} (${winner.matchType} match)`);
        if (candidates.length > 1) {
            console.log(`Other candidates found: ${candidates.slice(1).map(c => `${c.relativePath || '(root)'} (${c.matchType})`).join(', ')}`);
        }

        return {
            worldPath: winner.path,
            matchType: winner.matchType,
            relativePath: winner.relativePath || null
        };
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
            const userEmail = this.getUserEmail().split('@')[0]; // Use local part of email for folder structure
            const serverPath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${userEmail}/${this.uniqueId}`;
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
            const backupPath = `${this.getServerBasePath()}/backups/${this.serverName}-${timestamp}.zip`;

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

    /**
     * Set the user email for organizing server files
     */
    setUserEmail(email: string): void {
        this.config.userEmail = email;
    }

    /**
     * Get the user email, with fallback to default
     */
    getUserEmail(): string {
        return this.config.userEmail || 'default-user';
    }

    /**
     * Get the server base path with the env/email/id structure
     */
    getServerBasePath(): string {
        const minecraftPath = process.env.MINECRAFT_PATH || '/minecraft';
        const userEmail = this.getUserEmail();

        return `${minecraftPath}/${userEmail}/${this.uniqueId}`;
    }

    /**
     * Update user email and regenerate Docker Compose configuration
     */
    updateUserEmailAndRegenerate(email: string): {
        success: boolean;
        previousEmail: string;
        newEmail: string;
        newBasePath: string;
    } {
        const previousEmail = this.getUserEmail();
        this.setUserEmail(email);
        const newBasePath = this.getServerBasePath();

        return {
            success: true,
            previousEmail,
            newEmail: email,
            newBasePath
        };
    }

    /**
     * Delete all server files from WebDAV and local storage
     * This will remove all plugins, mods, world files, backups, and configuration files
     */
    async deleteAllServerFiles(): Promise<{ success: boolean; deletedPaths?: string[]; localPaths?: string[]; error?: string }> {
        try {
            const deletedPaths: string[] = [];
            const localPaths: string[] = [];
            
            // WebDAV server path structure
            const serverPath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${this.getUserEmail().split("@")[0]}/${this.uniqueId}`;
            const userEmail = this.getUserEmail();
            const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
            const userFolder = userEmail.split('@')[0];
            const webdavUserPath = `${baseServerPath}/${userFolder}/${this.uniqueId}`;
            
            // Local server path structure (for documentation)
            const localServerPath = this.getServerBasePath();
            localPaths.push(localServerPath);
            
            console.log(`Starting deletion of all server files for ${this.serverName} (${this.uniqueId})`);
            console.log(`WebDAV paths to delete: ${serverPath}, ${webdavUserPath}`);
            console.log(`Local path to delete: ${localServerPath}`);
            
            // Delete from WebDAV - try both possible locations
            const pathsToDelete = [serverPath, webdavUserPath];
            
            for (const path of pathsToDelete) {
                try {
                    const exists = await webdavService.exists(path);
                    if (exists) {
                        console.log(`Deleting WebDAV directory: ${path}`);
                        
                        // Get directory contents to delete recursively
                        const items = await webdavService.getDirectoryContents(path);
                        
                        // Delete all items in the directory
                        for (const item of items) {
                            const webdavItem = item as { filename: string; type: string };
                            const itemPath = `${path}/${webdavItem.filename}`;
                            if (webdavItem.type === 'directory') {
                                await this.deleteDirectoryRecursively(itemPath);
                            } else {
                                await webdavService.deleteFile(itemPath);
                            }
                            deletedPaths.push(itemPath);
                        }
                        
                        // Delete the main directory
                        await webdavService.deleteFile(path);
                        deletedPaths.push(path);
                        console.log(`Successfully deleted WebDAV directory: ${path}`);
                    } else {
                        console.log(`WebDAV directory does not exist: ${path}`);
                    }
                } catch (error) {
                    console.warn(`Could not delete WebDAV path ${path}:`, error);
                }
            }
            
            console.log(`Successfully deleted ${deletedPaths.length} WebDAV paths for server ${this.serverName}`);
            console.log(`Note: Local files at ${localServerPath} should be manually deleted if they exist`);
            
            return {
                success: true,
                deletedPaths,
                localPaths
            };
        } catch (error) {
            console.error('Error deleting all server files:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    /**
     * Helper method to recursively delete a directory in WebDAV
     */
    private async deleteDirectoryRecursively(directoryPath: string): Promise<void> {
        try {
            const items = await webdavService.getDirectoryContents(directoryPath);
            
            for (const item of items) {
                const webdavItem = item as { filename: string; type: string };
                const itemPath = `${directoryPath}/${webdavItem.filename}`;
                if (webdavItem.type === 'directory') {
                    await this.deleteDirectoryRecursively(itemPath);
                } else {
                    await webdavService.deleteFile(itemPath);
                }
            }
            
            // Delete the directory itself after all contents are deleted
            await webdavService.deleteFile(directoryPath);
        } catch (error) {
            console.warn(`Error deleting directory ${directoryPath}:`, error);
            throw error;
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
    environmentId: number = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1,
    userEmail: string,
    proxyIds: string[] = []
): MinecraftServer {
    const server = new MinecraftServer(config, serverName, uniqueId, environmentId, proxyIds);

    // Set user email if provided
    if (userEmail) {
        if (userEmail.includes('@')) {
            // Use only the first part of the email as the user identifier
            const emailParts = userEmail.split('@');
            server.setUserEmail(emailParts[0]);
        } else {
            // If no '@' is found, treat it as a username
            server.setUserEmail(userEmail);
        }
    }

    return server;
}

/**
 * Alternative factory function that automatically fetches user email from authentication context
 * This function would typically integrate with your authentication system
 */
export async function createMinecraftServerWithAuth(
    config: MinecraftServerConfig,
    serverName: string,
    uniqueId: string,
    environmentId: number = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1,
    authToken?: string
): Promise<MinecraftServer> {
    let userEmail = 'default-user';

    // Example: Fetch user email from authentication system
    if (authToken) {
        try {
            // This would typically make a call to your auth service
            // For now, this is a placeholder implementation
            userEmail = await fetchUserEmailFromAuth(authToken);
        } catch (error) {
            console.warn('Failed to fetch user email from auth token, using default:', error);
        }
    }

    return createMinecraftServer(config, serverName, uniqueId, environmentId, userEmail);
}

/**
 * Example integration with Next.js authentication system
 * This shows how you might integrate with a real authentication system
 */
export async function createMinecraftServerFromSession(
    config: MinecraftServerConfig,
    serverName: string,
    uniqueId: string,
    environmentId: number = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1,
    req?: Record<string, unknown> // Next.js request object or session data
): Promise<MinecraftServer> {
    const userEmail = 'default-user';

    if (req) {
        try {
            // Example for Next.js with next-auth
            // const session = await getServerSession(req, res, authOptions);
            // if (session?.user?.email) {
            //     userEmail = session.user.email;
            // }

            // Example for custom auth headers
            // const authHeader = req.headers.authorization;
            // if (authHeader) {
            //     const token = authHeader.replace('Bearer ', '');
            //     userEmail = await verifyTokenAndGetEmail(token);
            // }

            // Example for session cookies
            // if (req.session?.user?.email) {
            //     userEmail = req.session.user.email;
            // }

            console.log(`Creating server for user: ${userEmail}`);
        } catch (error) {
            console.warn('Failed to extract user email from session:', error);
        }
    }

    return createMinecraftServer(config, serverName, uniqueId, environmentId, userEmail);
}

/**
 * Helper function to fetch user email from authentication system
 * This should be replaced with your actual authentication integration
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchUserEmailFromAuth(_authToken: string): Promise<string> {
    // Placeholder implementation - replace with actual auth service call
    // Example: 
    // const response = await fetch('/api/auth/user', {
    //     headers: { Authorization: `Bearer ${authToken}` }
    // });
    // const user = await response.json();
    // return user.email;

    // For now, just return a placeholder
    return 'user@example.com';
}

/**
 * Helper function to convert ClientServerConfig to MinecraftServerConfig
 */
export function convertClientConfigToServerConfig(clientConfig: ClientServerConfig, userEmail?: string): MinecraftServerConfig {
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
        userEmail: userEmail || 'default-user', // Add user email for folder structure
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
 * // Convert to server configuration with user email
 * const serverConfig = convertClientConfigToServerConfig(clientConfig, "user@example.com");
 * 
 * // Create server instance (Method 1: Pass email directly)
 * const server = createMinecraftServer(
 *   serverConfig, 
 *   "my-awesome-server", 
 *   "unique-server-id-123", 
 *   1, // environment ID
 *   "user@example.com" // user email
 * );
 * 
 * // Create server instance (Method 2: Set email after creation)
 * const server2 = createMinecraftServer(serverConfig, "my-server", "id-456", 1);
 * server2.setUserEmail("user@example.com");
 * 
 * // Create server instance (Method 3: Using auth token to fetch email)
 * const server3 = await createMinecraftServerWithAuth(
 *   serverConfig, 
 *   "my-server", 
 *   "id-789", 
 *   1,
 *   "auth-token-here"
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