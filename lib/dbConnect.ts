import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

interface CachedConnection {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

interface GlobalWithMongoose extends Global {
    mongoose?: CachedConnection;
}

// Type-safe global access
const globalWithMongoose = global as GlobalWithMongoose;

const cached: CachedConnection = globalWithMongoose.mongoose || { conn: null, promise: null };

if (!globalWithMongoose.mongoose) {
    globalWithMongoose.mongoose = cached;
}

async function dbConnect(): Promise<typeof mongoose> {
    if (cached.conn) {
        return cached.conn;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in the environment variables.');
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
            console.log('Database connected successfully');
            return mongoose;
        }).catch((error) => {
            console.error('Database connection error:', error);
            cached.promise = null;
            throw error;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

export default dbConnect;