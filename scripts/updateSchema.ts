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