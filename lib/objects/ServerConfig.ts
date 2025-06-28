import { Schema, Document, models, model } from 'mongoose';

export interface IServerConfig extends Document {
    // Basic server information
    name: string;
    serverType: string;
    version: string;
    description: string;
    
    // World settings
    seed: string;
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
}

const ServerConfigSchema: Schema = new Schema({
    // Basic server information
    name: { type: String, required: true },
    serverType: { type: String, required: true },
    version: { type: String, required: true },
    description: { type: String, default: '' },
    
    // World settings
    seed: { type: String, default: '' },
    gameMode: { type: String, default: 'survival' },
    difficulty: { type: String, default: 'easy' },
    worldType: { type: String, default: 'default' },
    worldGeneration: { type: String, default: 'new' },
    worldFile: { type: Schema.Types.Mixed, default: null },
    
    // Player settings
    maxPlayers: { type: Number, default: 20 },
    whitelistEnabled: { type: Boolean, default: false },
    onlineMode: { type: Boolean, default: true },
    
    // Game mechanics
    pvpEnabled: { type: Boolean, default: true },
    commandBlocksEnabled: { type: Boolean, default: false },
    flightEnabled: { type: Boolean, default: false },
    spawnAnimalsEnabled: { type: Boolean, default: true },
    spawnMonstersEnabled: { type: Boolean, default: true },
    spawnNpcsEnabled: { type: Boolean, default: true },
    generateStructuresEnabled: { type: Boolean, default: true },
    
    // Network settings
    port: { type: Number, default: 25565 },
    
    // Performance settings
    viewDistance: { type: Number, default: 10 },
    simulationDistance: { type: Number, default: 10 },
    spawnProtection: { type: Number, default: 16 },
    
    // Server management
    rconEnabled: { type: Boolean, default: false },
    rconPassword: { type: String, default: '' },
    motd: { type: String, default: 'A Minecraft Server' },
    
    // Resource settings
    resourcePackUrl: { type: String, default: '' },
    resourcePackSha1: { type: String, default: '' },
    resourcePackPrompt: { type: String, default: '' },
    forceResourcePack: { type: Boolean, default: false },
    
    // Advanced settings
    enableJmxMonitoring: { type: Boolean, default: false },
    syncChunkWrites: { type: Boolean, default: true },
    enforceWhitelist: { type: Boolean, default: false },
    preventProxyConnections: { type: Boolean, default: false },
    hideOnlinePlayers: { type: Boolean, default: false },
    broadcastRconToOps: { type: Boolean, default: true },
    broadcastConsoleToOps: { type: Boolean, default: true },
    
    // Memory and performance
    serverMemory: { type: Number, default: 1024 }
}, {
    timestamps: true
});

const ServerConfig = models.servers || model<IServerConfig>('servers', ServerConfigSchema);

export default ServerConfig;