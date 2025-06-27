import mongoose from 'mongoose';

class DbConnect {
    private isConnected: boolean = false;
    private connectionPromise: Promise<void> | null = null;

    public async connect(): Promise<void> {
        if (this.isConnected) {
            return;
        }

        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = this._connect();
        return this.connectionPromise;
    }

    private async _connect(): Promise<void> {
        try {
            if (!process.env.MONGODB_URI) {
                throw new Error('MONGODB_URI environment variable is not defined');
            }

            await mongoose.connect(process.env.MONGODB_URI);
            this.isConnected = true;
            this.connectionPromise = null;
            console.log('Database connected successfully');
        } catch (error) {
            this.connectionPromise = null;
            console.error('Database connection error:', error);
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.isConnected && mongoose.connection.readyState === 1) {
            try {
                await mongoose.disconnect();
                this.isConnected = false;
                console.log('Database disconnected successfully');
            } catch (error) {
                console.error('Database disconnection error:', error);
                throw error;
            }
        }
    }

    public get connection() {
        return mongoose.connection;
    }
}

const dbConnect = new DbConnect();
export default dbConnect;