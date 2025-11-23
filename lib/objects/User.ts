import pkg from 'mongoose';
import bcrypt from 'bcrypt';

export interface PortReservationRange {
    start: number;
    end: number;
    description?: string;
}

export interface IUser extends Document {
    _id: pkg.Types.ObjectId;
    email: string;
    password: string;
    isActive: boolean;
    maxServers: number; // Maximum number of servers a user can create
    sessionToken?: string | null; // Optional session token for user sessions
    isAdmin: boolean; // Flag to indicate if the user is an admin
    reservedPorts: number[]; // Array of individual reserved ports for the user
    reservedPortRanges: PortReservationRange[]; // Array of reserved port ranges for the user
    comparePassword(candidatePassword: string): Promise<boolean>; // Method to compare passwords
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
        default: 3, // Default maximum number of servers a user can create
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
                // Check if all ports are in the allowed range (1024-65535, avoiding system ports)
                return ports.every(port => port >= 1024 && port <= 65535);
            },
            message: 'Reserved ports must be in the range 1024-65535'
        }
    },
    reservedPortRanges: {
        type: [{
            start: {
                type: Number,
                required: true,
                min: 1024,
                max: 65535
            },
            end: {
                type: Number,
                required: true,
                min: 1024,
                max: 65535
            },
            description: {
                type: String,
                required: false,
                maxlength: 200
            }
        }],
        default: [],
        validate: {
            validator: function (ranges: PortReservationRange[]) {
                // Validate each range
                for (const range of ranges) {
                    if (range.start > range.end) {
                        return false;
                    }
                    if (range.start < 1024 || range.end > 65535) {
                        return false;
                    }
                }
                
                // Check for overlapping ranges
                for (let i = 0; i < ranges.length; i++) {
                    for (let j = i + 1; j < ranges.length; j++) {
                        const range1 = ranges[i];
                        const range2 = ranges[j];
                        if (range1.start <= range2.end && range2.start <= range1.end) {
                            return false; // Overlapping ranges
                        }
                    }
                }
                
                return true;
            },
            message: 'Port ranges must be valid, non-overlapping, and within 1024-65535'
        }
    },
}, {
    timestamps: true,
});

// Hash password before saving
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password as string, salt);
    } catch (error: unknown) {
        throw error;
    }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

export default pkg.models.users || pkg.model<IUser>('users', UserSchema);