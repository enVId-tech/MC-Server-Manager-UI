import pkg from 'mongoose';
import type { ServerConfigData } from './ServerConfig.ts';

export interface IServer extends Document {
    email: string;
    uniqueId: string;
    isOnline: boolean;
    subdomainName: string;
    folderPath: string;
    serverName: string;
    port: number;
    rconPort?: number;
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
        min: [25565, 'Port must be at least 25565.'],
        max: [25595, 'Port must be at most 25595.'],
        unique: true,
    },
    rconPort: {
        type: Number,
        required: false,
        min: [25565, 'RCON port must be at least 25565.'],
        max: [25595, 'RCON port must be at most 25595.'],
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