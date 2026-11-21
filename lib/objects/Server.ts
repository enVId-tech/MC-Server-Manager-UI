import pkg from 'mongoose';
import type { ServerConfigData } from './ServerConfig.ts';

export interface IServer extends pkg.Document {
    email: string;
    uniqueId: string;
    isOnline: boolean;
    subdomainName: string;
    /** More host names the proxies send to this server (imported servers can have several forced hosts) */
    extraHostnames?: string[];
    /** Set while a start or stop is under way, so the dashboard can say starting or stopping instead of offline */
    transition?: { action: 'starting' | 'stopping'; at: Date };
    /** Where the address came from: read from a proxy's forced hosts, chosen by a person, or only guessed (imported servers) */
    subdomainSource?: 'forced-host' | 'chosen' | 'guessed';
    folderPath: string;
    serverName: string;
    port: number;
    rconPort?: number;
    environmentId?: number;
    proxyIds?: string[];
    /** 'running' while a deployment is in progress; only 'success' servers are recreated when their container is lost */
    lastDeploymentStatus?: 'running' | 'success' | 'failed';
    lastDeploymentError?: string;
    lastDeploymentAt?: Date;
    deployedAt?: Date;
    /** Docker container name. Servers created here use mc-<uniqueId>; imported servers keep the name they already had */
    containerName?: string;
    /** True for servers that existed before this app and were added to the dashboard */
    imported?: boolean;
    importedFrom?: {
        source: 'docker' | 'folder';
        /** The server folder as Docker sees it */
        hostPath?: string;
    };
    /** 'proxy' for Velocity, BungeeCord and Waterfall instances, which are managed by administrators only */
    kind?: 'server' | 'proxy';
    /** Only set when kind is 'proxy' */
    proxy?: ProxySettings;
    /** Set when the server was stopped for good after failing to start too many times in a row */
    startGuard?: { stoppedAt: Date; failures: number; exitCode?: number; lastLog?: string };
    /** Plugins and mods installed through the manager (see lib/server/addons/manager.ts) */
    addons?: Array<Record<string, unknown>>;
    /** Files the manager installed that users may not change or remove, such as the proxy forwarding mods */
    managedFiles?: Array<{ path: string; slug: string; reason: string }>;
    /** How a game server is connected to the proxy network */
    network?: ServerNetwork;
    createdAt: Date;
    serverConfig: ServerConfigData;
}

export interface ProxySettings {
    type: 'velocity' | 'bungeecord' | 'waterfall';
    /** Forwarding mode the proxy is set up for. The proxy's own configuration file is the source of truth */
    forwarding: 'modern' | 'bungeeguard' | 'legacy' | 'none';
    enabled: boolean;
    /** Higher goes first with the priority strategy */
    priority: number;
    /** Port players connect to when it differs from the record's port (adopted proxies whose port was taken) */
    publicPort?: number;
    /** Docker network the proxy shares with its servers */
    networkName: string;
    memory: string;
    image?: string;
    /** Storage path of velocity.toml or config.yml */
    configPath: string;
    /** Name of the stack that runs the proxy, when this manager created it */
    stackName?: string;
    /** Subdomain in front of the server domain that the servers behind this proxy use (ex1 gives survival.ex1.example.org). Needed when there are several proxies */
    baseSubdomain?: string;
    /** Host name players use to reach the proxy, for display. Defaults to the server domain */
    publicHost?: string;
    /** Entry name of the server that players without a host name (Bedrock players coming through Geyser) are sent to. Empty means nobody is sent anywhere */
    defaultEntry?: string;
    /** UDP port Geyser listens on when the proxy runs it. Read from Geyser's own config when present */
    bedrockPort?: number;
}

export interface NetworkLink {
    proxyId: string;
    proxyName: string;
    /** Name the server has in the proxy's configuration */
    entryName: string;
    /** Docker network the server shares with the proxy */
    networkName?: string;
    forwarding: 'modern' | 'bungeeguard' | 'legacy' | 'none';
    linkedAt: Date;
}

export interface NetworkWarning {
    code: 'no-proxy' | 'unsupported-version' | 'unsupported-type' | 'no-secret' | 'link-failed';
    message: string;
    /** Port that has to be reachable from the internet for players to join */
    port?: number;
    /** Set when the user or an administrator cleared the warning. It stays cleared while the situation is unchanged */
    dismissed?: boolean;
    createdAt: Date;
}

export interface ServerNetwork {
    links: NetworkLink[];
    warnings: NetworkWarning[];
    /** Forwarding mode the server is configured for. The container environment is built from it */
    forwarding?: 'modern' | 'bungeeguard' | 'legacy' | 'none';
    syncedAt?: Date;
    /** Files of the server that did not exist yet when the proxy setup ran (it has not finished its first start) */
    pendingFiles?: string[];
}

const ServerSchema: pkg.Schema = new pkg.Schema({
    uniqueId: {
        type: String,
        required: [true, 'Unique ID is required.'],
        unique: true,
        index: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [/.+\@.+\..+/, 'Please enter a valid email address.'],
        unique: false,
    },
    subdomainName: {
        type: String,
        required: [true, 'Subdomain name is required.'],
        unique: true,
    },
    extraHostnames: { type: [String], required: false, default: undefined },
    transition: { type: pkg.Schema.Types.Mixed, required: false },
    subdomainSource: { type: String, enum: ['forced-host', 'chosen', 'guessed'], required: false },
    isOnline: {
        type: Boolean,
        default: false,
        unique: false,
    },
    folderPath: {
        type: String,
        required: [true, 'Folder path is required.'],
        unique: true,
    },
    serverName: {
        type: String,
        required: [true, 'Server name is required.'],
        trim: true,
        maxlength: [50, 'Server name cannot exceed 50 characters.'],
        unique: false,
    },
    port: {
        type: Number,
        required: [true, 'Server port is required.'],
        min: [1024, 'Port must be at least 1024.'],
        max: [65535, 'Port must be at most 65535.'],
        unique: true,
    },
    rconPort: {
        type: Number,
        required: false,
        // RCON ports are allocated from their own range (see PORT_RANGES), which lies above the game port range
        min: [1024, 'RCON port must be at least 1024.'],
        max: [65535, 'RCON port must be at most 65535.'],
    },
    environmentId: {
        type: Number,
        required: false,
        default: 1
    },
    proxyIds: {
        type: [String],
        required: false,
        default: []
    },
    lastDeploymentStatus: {
        type: String,
        enum: ['running', 'success', 'failed'],
        required: false,
    },
    lastDeploymentError: { type: String, required: false },
    lastDeploymentAt: { type: Date, required: false },
    deployedAt: { type: Date, required: false },
    containerName: { type: String, required: false },
    imported: { type: Boolean, required: false, default: false },
    importedFrom: {
        source: { type: String, enum: ['docker', 'folder'], required: false },
        hostPath: { type: String, required: false },
    },
    kind: { type: String, enum: ['server', 'proxy'], required: false, default: 'server', index: true },
    proxy: { type: pkg.Schema.Types.Mixed, required: false },
    network: { type: pkg.Schema.Types.Mixed, required: false },
    startGuard: { type: pkg.Schema.Types.Mixed, required: false },
    managedFiles: { type: pkg.Schema.Types.Mixed, required: false },
    addons: { type: pkg.Schema.Types.Mixed, required: false },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true,
        unique: false,
    },
    serverConfig: {
        type: pkg.Schema.Types.Mixed, // Allow any structure for serverConfig
        default: {},
        required: [true, 'Server configuration is required.'],
        unique: false,
    }
}, {
    timestamps: true,
});

const Server = pkg.models.servers || pkg.model<IServer>('servers', ServerSchema);

export default Server;