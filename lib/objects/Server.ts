import { Schema, Document, models, model } from 'mongoose';

export interface IServer extends Document {
    email: string;
    uniqueId: string;
    isOnline: boolean;
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
    isOnline: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

export default models.Server || model<IServer>('servers', ServerSchema);