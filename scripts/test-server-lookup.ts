import Server from '../lib/objects/Server.ts';
import dbConnect from '../lib/db/dbConnect.ts';

async function testServerLookup() {
    await dbConnect();
    
    try {
        // Test server lookup with different formats
        const testCases = [
            'main1.etran.dev',
            'main1',
            'test.example.com',
            'test'
        ];
        
        console.log('Testing server lookups...\n');
        
        for (const serverSlug of testCases) {
            console.log(`Testing server slug: ${serverSlug}`);
            
            // Extract unique ID like the API does
            let uniqueId = serverSlug;
            if (serverSlug.includes('.')) {
                uniqueId = serverSlug.split('.')[0];
            }
            
            console.log(`  Extracted unique ID: ${uniqueId}`);
            
            // Find servers (without email filter for testing)
            const servers = await Server.find({
                $or: [
                    { uniqueId: uniqueId },
                    { uniqueId: serverSlug },
                    { subdomainName: serverSlug },
                    { subdomainName: uniqueId },
                    { serverName: serverSlug },
                    { serverName: uniqueId }
                ]
            }).limit(5);
            
            console.log(`  Found ${servers.length} servers:`);
            servers.forEach(server => {
                console.log(`    - ${server.serverName} (${server.uniqueId}) - ${server.subdomainName} - ${server.email}`);
            });
            console.log();
        }
        
        // List all servers to see what's in the database
        console.log('All servers in database:');
        const allServers = await Server.find({}).limit(10);
        allServers.forEach(server => {
            console.log(`  - ${server.serverName} (${server.uniqueId}) - ${server.subdomainName} - ${server.email}`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    }
    
    process.exit(0);
}

testServerLookup();
