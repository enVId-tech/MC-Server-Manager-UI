// Connect to the mongoDB database
import { MongoClient } from 'mongodb';

class DBConnect {
    client: MongoClient;

    constructor() {
        this.client = new MongoClient(
            process.env.MONGODB_URI || 'mongodb://localhost:27017'
        );
    }

    public async connect() {
        if (!await this.client.connect()) {
            await this.client.connect();
        }
        return this.client.db(process.env.MONGODB_DB);
    }

    public async disconnect() {
        if (await this.client.connect()) {
            await this.client.close();
        }
    }

    public async getCollection(collectionName: string) {
        const db = await this.connect();
        return db.collection(collectionName);
    }

    public async getClient() {
        return this.client;
    }

    async close() {
        await this.disconnect();
    }
}

const dbConnect = new DBConnect();
export default dbConnect;