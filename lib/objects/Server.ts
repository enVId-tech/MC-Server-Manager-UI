import { Schema, Document, models, model } from 'mongoose';

export interface IServer extends Document {
    email: string;
    uniqueId: string;
    isOnline: boolean;
    subdomainName: string;
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
}, {
    timestamps: true,
});

export default models.Server || model<IServer>('servers', ServerSchema);