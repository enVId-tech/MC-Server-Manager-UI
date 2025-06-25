import mongoose from "mongoose";

class DbConnect {
    private static instance: DbConnect;
    private isConnected: boolean = false;

    public static getInstance(): DbConnect {
        if (!DbConnect.instance) {
            DbConnect.instance = new DbConnect();
        }
        return DbConnect.instance;
    }

    public async connect() {
        if (!this.isConnected) {
            try {
                await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017', {
                    dbName: process.env.MONGODB_DB,
                });
                this.isConnected = true;
                console.log('Database connected successfully');
            } catch (error) {
                console.error('Database connection error:', error);
            }
        }
    }

    public async disconnect() {
        if (this.isConnected) {
            await mongoose.disconnect();
            this.isConnected = false;
            console.log('Database disconnected successfully');
        }
    }
}

const dbConnect: DbConnect = DbConnect.getInstance();
export default dbConnect;