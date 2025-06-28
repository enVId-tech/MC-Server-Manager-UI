import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from multiple possible locations
const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env.development'),
    path.join(process.cwd(), '.env.development.local')
];

// Try to load each env file
envPaths.forEach(envPath => {
    try {
        dotenv.config({ path: envPath });
        console.log(`Loaded environment from: ${envPath}`);
    } catch (error) {
        // Silently continue if file doesn't exist
    }
});

// Debug: Show what environment variables are loaded
console.log('Environment variables loaded:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Found' : 'Not found');

// Import after environment is loaded
import { runSchemaUpdate } from '../lib/db/dbUpdater.ts';

async function main() {
    try {
        await runSchemaUpdate();
        process.exit(0);
    } catch (error) {
        console.error('Schema update failed:', error);
        process.exit(1);
    }
}

main();