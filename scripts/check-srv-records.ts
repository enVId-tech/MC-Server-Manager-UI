import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function checkExistingSrvRecords() {
    console.log('=== Checking Existing SRV Records ===\n');

    try {
        // Import the Porkbun class
        const porkbunModule = await import('../lib/server/porkbun');
        const porkbun = porkbunModule.default;
        const domain = process.env.DNS_DOMAIN || 'etran.dev';

        console.log(`Checking all DNS records for domain: ${domain}`);
        console.log('');

        const records = await porkbun.getDnsRecords(domain);

        if (records) {
            console.log(`Found ${records.length} total records:`);
            console.log('');

            // Filter for SRV records
            const srvRecords = records.filter((record: any) => record.type === 'SRV');
            console.log(`SRV Records (${srvRecords.length}):`);
            srvRecords.forEach((record: any) => {
                console.log(`  - ID: ${record.id}`);
                console.log(`    Name: ${record.name}`);
                console.log(`    Content: ${record.content}`);
                console.log(`    TTL: ${record.ttl}`);
                console.log('');
            });

            // Filter for records related to "main1"
            const main1Records = records.filter((record: any) => 
                record.name.includes('main1') || record.content.includes('main1')
            );
            console.log(`Records related to "main1" (${main1Records.length}):`);
            main1Records.forEach((record: any) => {
                console.log(`  - ID: ${record.id}`);
                console.log(`    Type: ${record.type}`);
                console.log(`    Name: ${record.name}`);
                console.log(`    Content: ${record.content}`);
                console.log(`    TTL: ${record.ttl}`);
                console.log('');
            });

            // Look for _minecraft._tcp records specifically
            const minecraftRecords = records.filter((record: any) => 
                record.name.includes('_minecraft._tcp')
            );
            console.log(`Minecraft SRV Records (${minecraftRecords.length}):`);
            minecraftRecords.forEach((record: any) => {
                console.log(`  - ID: ${record.id}`);
                console.log(`    Name: ${record.name}`);
                console.log(`    Content: ${record.content}`);
                console.log(`    TTL: ${record.ttl}`);
                console.log('');
            });

        } else {
            console.log('❌ Failed to retrieve DNS records');
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            if (error.stack) {
                console.error('Stack trace:', error.stack);
            }
        }
    }
}

checkExistingSrvRecords().catch(console.error);
