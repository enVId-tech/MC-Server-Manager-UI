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

/** * Represents a Minecraft server instance using the itzg/minecraft-server Docker image.
 * Provides methods to validate configuration and generate Docker Compose commands.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class MinecraftServer {
    private config: MinecraftServerConfig;

    constructor(config: MinecraftServerConfig) {
        this.config = config;
    }

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
     * @returns {boolean} True if the configuration is valid, false otherwise.
     * */
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
     * Generates the Docker run command for the Minecraft server.
     * @return {string} The Docker run command.
     */
    generateDockerComposeCommand(): string {
        if (!this.validateConfig()) {
            throw new Error('Invalid Minecraft server configuration.');
        }

        const composeFile = {
            version: '3.8',
            services: {
                minecraft: {
                    image: 'itzg/minecraft-server',
                    environment: [
                        `EULA=${this.config.EULA ? 'TRUE' : 'FALSE'}`,
                        `VERSION=${this.config.VERSION}`,
                        `MOTD=${this.config.MOTD}`,
                        `SERVER_NAME=${this.config.SERVER_NAME}`,
                        `GAMEMODE=${this.config.GAMEMODE || 'survival'}`,
                        `DIFFICULTY=${this.config.DIFFICULTY || 'normal'}`,
                        `FORCE_GAMEMODE=${this.config.FORCE_GAMEMODE ? 'TRUE' : 'FALSE'}`,
                        `HARDCORE=${this.config.HARDCORE ? 'TRUE' : 'FALSE'}`,
                        `PVP=${this.config.PVP ? 'TRUE' : 'FALSE'}`,
                        `MAX_PLAYERS=${this.config.MAX_PLAYERS || 20}`,
                        `ONLINE_MODE=${this.config.ONLINE_MODE ? 'TRUE' : 'FALSE'}`,
                        `MEMORY=${this.config.MEMORY || '2G'}`,
                        `VIEW_DISTANCE=${this.config.VIEW_DISTANCE || 10}`,
                        `SIMULATION_DISTANCE=${this.config.SIMULATION_DISTANCE || 10}`,
                        `LEVEL_SEED=${this.config.LEVEL_SEED || ''}`,
                        `LEVEL_TYPE=${this.config.LEVEL_TYPE || 'DEFAULT'}`,
                        `LEVEL_NAME=${this.config.LEVEL_NAME || 'world'}`,
                        `GENERATE_STRUCTURES=${this.config.GENERATE_STRUCTURES ? 'TRUE' : 'FALSE'}`,
                        `MAX_WORLD_SIZE=${this.config.MAX_WORLD_SIZE || 29999984}`,
                        `ALLOW_NETHER=${this.config.ALLOW_NETHER ? 'TRUE' : 'FALSE'}`,
                        `WHITELIST=${this.config.WHITELIST || ''}`,
                        `OPS=${this.config.OPS || ''}`,
                        `ENFORCE_WHITELIST=${this.config.ENFORCE_WHITELIST ? 'TRUE' : 'FALSE'}`,
                        `MAX_BUILD_HEIGHT=${this.config.MAX_BUILD_HEIGHT || 256}`,
                        `ANNOUNCE_PLAYER_ACHIEVEMENTS=${this.config.ANNOUNCE_PLAYER_ACHIEVEMENTS ? 'TRUE' : 'FALSE'}`,
                        `ENABLE_COMMAND_BLOCK=${this.config.ENABLE_COMMAND_BLOCK ? 'TRUE' : 'FALSE'}`,
                        `SPAWN_ANIMALS=${this.config.SPAWN_ANIMALS ? 'TRUE' : 'FALSE'}`,
                        `SPAWN_MONSTERS=${this.config.SPAWN_MONSTERS ? 'TRUE' : 'FALSE'}`,
                        `SPAWN_NPCS=${this.config.SPAWN_NPCS ? 'TRUE' : 'FALSE'}`,
                        `SPAWN_PROTECTION=${this.config.SPAWN_PROTECTION || 16}`,
                        `SERVER_PORT=${this.config.SERVER_PORT || 25565}`,
                        `ENABLE_RCON=${this.config.ENABLE_RCON ? 'TRUE' : 'FALSE'}`,
                        `RCON_PORT=${this.config.RCON_PORT || 25575}`,
                        `RCON_PASSWORD=${this.config.RCON_PASSWORD || 'changeme'}`,
                    ],
                },
            },
        };

        return JSON.stringify(composeFile, null, 2);
    }
}