import { Schema, Document, models, model } from 'mongoose';

export interface IUser extends Document {
    email: string;
    password?: string;
    isActive: boolean;
}

const UserSchema: Schema = new Schema({
    email: {
        type: String,
        required: [true, 'Email is required.'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/.+\@.+\..+/, 'Please enter a valid email address.'],
    },
    password: {
        type: String,
        required: [true, 'Password is required.'],
    },
    isActive: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

export default models.User || model<IUser>('User', UserSchema);