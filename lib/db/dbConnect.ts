import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from multiple possible locations
if (typeof window === 'undefined') { // Only load dotenv on server-side
    const envPaths = [
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), '.env.local')
    ];

    // Temporarily suppress console output during dotenv loading
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    console.log = () => {}; // Temporarily suppress console.log
    console.info = () => {}; // Temporarily suppress console.info

    // Try to load each env file
    envPaths.forEach(envPath => {
        try {
            dotenv.config({ path: envPath, override: false, debug: false });
        } catch {
            // Silently continue if file doesn't exist
        }
    });
    
    // Restore console methods
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
}

interface CachedConnection {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

// Type-safe global access
const cached: CachedConnection = globalThis.mongoose || { conn: null, promise: null };

if (!globalThis.mongoose) {
    globalThis.mongoose = cached;
}

async function dbConnect(): Promise<typeof mongoose> {
    if (cached.conn) {
        return cached.conn;
    }

    const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

    if (!MONGODB_URI) {
        console.error('Available environment variables:', Object.keys(process.env).filter(key => key.includes('MONGO') || key.includes('DATABASE')));
        throw new Error('MONGODB_URI or DATABASE_URL is not defined in the environment variables.');
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
            console.log('Database connected successfully');

            // Auto-update schema on first connection in development
            if (process.env.NODE_ENV === 'development') {
                import('./dbUpdater').then(({ autoUpdateSchemaOnStartup }) => {
                    autoUpdateSchemaOnStartup().catch((error) => {
                        console.error('Error during schema update:', error);
                    });
                }).catch((error) => {
                    console.warn('Could not load schema updater:', error);
                });
            }

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