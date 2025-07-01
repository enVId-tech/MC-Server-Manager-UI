/**
 * Test script for Porkbun DNS integration
 * Run with: npx ts-node scripts/test-dns.ts
 */

import dotenv from 'dotenv';
import { PorkbunService } from '../lib/server/porkbun';

dotenv.config();

async function testDnsOperations() {
    console.log('🌐 Testing Porkbun DNS Integration...\n');

    try {
        const porkbun = new PorkbunService();
        const testDomain = process.env.MINECRAFT_DOMAIN || 'example.com';
        const testSubdomain = 'test-server';
        const testTarget = process.env.SERVER_TARGET || 'mc.example.com';
        const testPort = 25565;

        console.log(`📋 Test Configuration:`);
        console.log(`   Domain: ${testDomain}`);
        console.log(`   Subdomain: ${testSubdomain}`);
        console.log(`   Target: ${testTarget}`);
        console.log(`   Port: ${testPort}\n`);

        // Test 1: Get all domains
        console.log('1️⃣ Fetching all domains...');
        const domains = await porkbun.getAllDomainsInfo();
        if (domains) {
            console.log(`   ✅ Found ${domains.length} domain(s)`);
            domains.forEach(domain => {
                console.log(`   📄 ${domain.domain} (Status: ${domain.status})`);
            });
        } else {
            console.log('   ❌ Failed to fetch domains');
            return;
        }

        // Test 2: Get DNS records for test domain
        console.log(`\n2️⃣ Fetching DNS records for ${testDomain}...`);
        const records = await porkbun.getDnsRecords(testDomain);
        if (records) {
            console.log(`   ✅ Found ${records.length} DNS record(s)`);
            const srvRecords = records.filter(r => r.type === 'SRV');
            console.log(`   📊 SRV Records: ${srvRecords.length}`);
        } else {
            console.log('   ❌ Failed to fetch DNS records');
        }

        // Test 3: Create Minecraft SRV record (commented out to avoid creating real records)
        /*
        console.log(`\n3️⃣ Creating Minecraft SRV record...`);
        const recordId = await porkbun.createMinecraftSrvRecord(
            testDomain, 
            testSubdomain, 
            testPort, 
            testTarget
        );
        
        if (recordId) {
            console.log(`   ✅ Created SRV record with ID: ${recordId}`);
            
            // Test 4: Delete the created record
            console.log(`\n4️⃣ Deleting Minecraft SRV record...`);
            const deleteSuccess = await porkbun.deleteMinecraftSrvRecord(testDomain, testSubdomain);
            
            if (deleteSuccess) {
                console.log(`   ✅ Successfully deleted SRV record`);
            } else {
                console.log(`   ❌ Failed to delete SRV record`);
            }
        } else {
            console.log('   ❌ Failed to create SRV record');
        }
        */

        console.log('\n🎉 DNS integration test completed!');
        console.log('\n💡 To test record creation/deletion:');
        console.log('   1. Uncomment the record creation section in this script');
        console.log('   2. Ensure you have a valid domain configured in Porkbun');
        console.log('   3. Run the script again with: npx ts-node scripts/test-dns.ts');

    } catch (error) {
        console.error('\n❌ DNS test failed:', error);
        
        if (error instanceof Error && error.message.includes('API Key')) {
            console.log('\n🔧 Setup Required:');
            console.log('   1. Sign up for a Porkbun account: https://porkbun.com/');
            console.log('   2. Generate API credentials in your account settings');
            console.log('   3. Add PORKBUN_API_KEY and PORKBUN_SECRET_KEY to your .env file');
            console.log('   4. Set MINECRAFT_DOMAIN and SERVER_TARGET in your .env file');
        }
    }
}

// Run the test
testDnsOperations();
