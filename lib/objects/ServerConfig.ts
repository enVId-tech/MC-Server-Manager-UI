import { Document } from 'mongoose';

// Interface for file information
export interface FileInfo {
    filename: string;
    originalName: string;
    filePath: string;
    size: number;
    mimetype: string;
    uploadedAt: Date;
    analysis?: FileAnalysis; // File analysis data
}

// Import FileAnalysis from minecraft.ts
import { FileAnalysis } from '../server/minecraft';

// Interface for server configuration (used for type definitions only)
// The actual server config is embedded in the Server document as Schema.Types.Mixed
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

    // Network configuration
    subdomain: string; // User-chosen subdomain for server address

    // Server properties (from advanced section)
    serverProperties?: Record<string, string | number | boolean>;

    // File information
    plugins?: FileInfo[];
    mods?: FileInfo[];
    worldFiles?: FileInfo;
}

// Type for plain server configuration object (without Mongoose Document methods)
// This is what gets embedded in the Server document
export type ServerConfigData = Omit<IServerConfig, keyof Document>;