import { Schema, Document, models, model } from 'mongoose';
import { IServerConfig } from './ServerConfig';

export interface IServer extends IServerConfig, Document {
    email: string;
    uniqueId: string;
    isOnline: boolean;
    subdomainName: string;
    folderPath: string;
    serverName: string;
    createdAt: Date;
    serverConfig?: IServerConfig;
}

const ServerSchema: Schema = new Schema({
    email: {
        type: String,
        required: [true, 'Email is required.'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/.+\@.+\..+/, 'Please enter a valid email address.'],
    },
    uniqueId: {
        type: String,
        required: [true, 'Unique ID is required.'],
        unique: true,
    },
    subdomainName: {
        type: String,
        required: [true, 'Subdomain name is required.'],
    },
    isOnline: {
        type: Boolean,
        default: false,
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
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    serverConfig: {
        type: Schema.Types.Mixed, // Allow any structure for serverConfig
        default: {},
    }
}, {
    timestamps: true,
});

// Fix: Use consistent model name and proper caching pattern
const Server = models.Server || model<IServer>('Server', ServerSchema);

export default Server;