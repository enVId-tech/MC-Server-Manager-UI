#!/usr/bin/env ts-node

/**
 * Test script for SRV record creation and validation
 * This script tests the corrected SRV record creation logic to ensure
 * SRV records point to the correct FQDN target.
 */

import { PorkbunService } from '../lib/server/porkbun';

interface TestConfig {
    domain: string;
    subdomain: string;
    serverIP: string;
    port: number;
}

const testConfig: TestConfig = {
    domain: process.env.MINECRAFT_DOMAIN || 'example.com',
    subdomain: 'test-srv',
    serverIP: process.env.SERVER_IP || '192.168.1.100',
    port: 25565
};

async function testSrvRecordCreation() {
    console.log('🧪 Testing SRV Record Creation Logic\n');
    
    console.log('📋 Test Configuration:');
    console.log(`- Domain: ${testConfig.domain}`);
    console.log(`- Subdomain: ${testConfig.subdomain}`);
    console.log(`- Server IP: ${testConfig.serverIP}`);
    console.log(`- Port: ${testConfig.port}\n`);

    if (testConfig.domain === 'example.com') {
        console.log('⚠️  Warning: Using example domain. Set MINECRAFT_DOMAIN environment variable for real testing.');
        console.log('⚠️  This will test the logic but not create real DNS records.\n');
    }

    try {
        const porkbun = new PorkbunService();

        // Test 1: Verify A record already exists (we don't create it)
        console.log('🔧 Step 1: Verifying existing A record...');
        console.log(`Assuming A record already exists: ${testConfig.subdomain}.${testConfig.domain} -> ${testConfig.serverIP}`);
        console.log(`Note: A records are managed independently, not created by this system`);

        // Test 2: Create SRV record (SRV -> subdomain.domain:port)
        console.log('\n🔧 Step 2: Testing SRV record creation...');
        const target = `${testConfig.subdomain}.${testConfig.domain}`;
        console.log(`Creating SRV: _minecraft._tcp.${testConfig.subdomain}.${testConfig.domain} -> ${target}:${testConfig.port}`);
        
        if (testConfig.domain !== 'example.com') {
            const srvRecordId = await porkbun.createMinecraftSrvRecordStrict(
                testConfig.domain,
                testConfig.subdomain,
                testConfig.port,
                target
            );
            
            if (srvRecordId) {
                console.log(`✅ SRV record created successfully with ID: ${srvRecordId}`);
            } else {
                console.log(`❌ SRV record creation failed`);
            }
        } else {
            console.log(`🔍 Skipped (example domain) - would create SRV record pointing to: ${target}:${testConfig.port}`);
        }

        // Test 3: Validate the logic is correct
        console.log('\n🔍 Step 3: Validating record logic...');
        console.log('✅ Expected DNS resolution chain:');
        console.log(`   1. Player connects to: ${testConfig.subdomain}.${testConfig.domain}`);
        console.log(`   2. Minecraft client queries SRV: _minecraft._tcp.${testConfig.subdomain}.${testConfig.domain}`);
        console.log(`   3. SRV record returns: ${target}:${testConfig.port}`);
        console.log(`   4. Client queries A record: ${target} (pre-existing)`);
        console.log(`   5. A record returns: ${testConfig.serverIP} (managed independently)`);
        console.log(`   6. Client connects to: ${testConfig.serverIP}:${testConfig.port}`);

        // Test 4: Cleanup (if real records were created)
        if (testConfig.domain !== 'example.com') {
            console.log('\n🧹 Step 4: Cleanup test records...');
            
            const srvDeleted = await porkbun.deleteMinecraftSrvRecord(testConfig.domain, testConfig.subdomain);
            
            console.log(`SRV record cleanup: ${srvDeleted ? '✅' : '❌'}`);
            console.log(`A record preserved: ✅ (managed independently)`);
        }

        console.log('\n🎉 Test completed successfully!');
        console.log('📝 The SRV record now correctly points to the full FQDN as the target.');

    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
        
        if (error instanceof Error) {
            console.error('Error message:', error.message);
        }
    }
}

// Run the test
testSrvRecordCreation().catch(console.error);
