import pkg from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
    email: string;
    password?: string;
    isActive: boolean;
    isAdmin: boolean;
    reservedPorts: number[];
    comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: pkg.Schema = new pkg.Schema({
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
        minlength: [6, 'Password must be at least 6 characters long.'],
    },
    isActive: {
        type: Boolean,
        default: false,
    },
    maxServers: {
        type: Number,
        default: 5, // Default maximum number of servers a user can create
    },
    sessionToken: {
        type: String,
        default: null,
    },
    isAdmin: {
        type: Boolean,
        default: false,
    },
    reservedPorts: {
        type: [Number],
        default: [],
        validate: {
            validator: function (ports: number[]) {
                // Check if all ports are in the allowed range (25565-25595)
                return ports.every(port => port >= 25565 && port <= 25595);
            },
            message: 'Reserved ports must be in the range 25565-25595'
        }
    },
}, {
    timestamps: true,
});

// Hash password before saving
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password as string, salt);
        next();
    } catch (error: unknown) {
        return next(error as Error);
    }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

export default pkg.models.users || pkg.model<IUser>('users', UserSchema);