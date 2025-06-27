import { Schema, Document, models, model } from 'mongoose';

export interface IServerConfig extends Document {
    versions?: string[];
    serverTypes?: Array<{ id: string; name: string }>;
    [key: string]: unknown; // Allow any additional properties
}

const ServerConfigSchema: Schema = new Schema({
    versions: [{
        type: String,
    }],
    serverTypes: [{
        id: { type: String },
        name: { type: String }
    }],
    worldTypes: [{
        id: { type: String },
        name: { type: String }
    }],
    gameModes: [{
        value: { type: String },
        label: { type: String }
    }],
    difficulties: [{
        value: { type: String },
        label: { type: String }
    }],
    worldFeatures: [{
        name: { type: String },
        label: { type: String }
    }]
}, {
    strict: false, // Allow fields not defined in schema
    timestamps: true,
});

const ServerConfig = models.ServerConfig || model<IServerConfig>('ServerConfig', ServerConfigSchema);

export default ServerConfig;