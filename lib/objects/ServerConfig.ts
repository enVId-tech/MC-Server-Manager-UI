import { Schema, Document, models, model } from 'mongoose';

export interface IServerConfig extends Document {
    configType?: string; // 'versions', 'serverTypes', etc.
    versions?: string[]; // Array of 64 Minecraft versions
    serverTypes?: string[]; // Array of 6+ server types
    [key: string]: any; // Allow additional dynamic properties
}

const ServerConfigSchema: Schema = new Schema({
    configType: {
        type: String,
        required: false,
    },
    versions: [{
        type: String,
    }],
    serverTypes: [{
        type: String,
    }],
}, {
    strict: false, // Allow fields not defined in schema
    timestamps: true,
});

// Fix: Check if the model already exists before creating it
const ServerConfig = models.ServerConfig || model<IServerConfig>('serverconfigs', ServerConfigSchema);

export default ServerConfig;