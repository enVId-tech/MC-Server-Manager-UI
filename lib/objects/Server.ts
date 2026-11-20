import pkg from 'mongoose';
import type { ServerConfigData } from './ServerConfig.ts';

export interface IServer extends pkg.Document {
    email: string;
    uniqueId: string;
    isOnline: boolean;
    subdomainName: string;
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
    createdAt: Date;
    serverConfig: ServerConfigData;
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