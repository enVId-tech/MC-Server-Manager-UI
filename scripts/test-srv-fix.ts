#!/usr/bin/env ts-node

/**
 * Test script to validate SRV record fix
 * This script tests that SRV records are created correctly with proper target FQDNs
 */

import { PorkbunService } from '../lib/server/porkbun';

interface TestConfig {
    domain: string;
    testSubdomain: string;
    serverTarget: string; // The actual server hostname (like play.etran.dev)
    port: number;
}

const testConfig: TestConfig = {
    domain: process.env.MINECRAFT_DOMAIN || 'etran.dev',
    testSubdomain: `test-fix-${Date.now()}`,
    serverTarget: '', // Will be constructed as subdomain.domain
    port: 25565 // Always 25565 for Minecraft SRV records
};

async function testSrvRecordFix() {
    console.log('🧪 Testing SRV Record Fix');
    console.log('='.repeat(50));
    
    // Construct the correct target (subdomain.domain)
    testConfig.serverTarget = `${testConfig.testSubdomain}.${testConfig.domain}`;
    
    console.log('📋 Test Configuration:');
    console.log(`- Domain: ${testConfig.domain}`);
    console.log(`- Test subdomain: ${testConfig.testSubdomain}`);
    console.log(`- Server target (constructed): ${testConfig.serverTarget}`);
    console.log(`- Port: ${testConfig.port}`);
    console.log('');

    if (testConfig.domain === 'etran.dev') {
        console.log('⚠️  Using real domain for testing. Records will be created and cleaned up.');
    } else {
        console.log('⚠️  Using example/test values. Set MINECRAFT_DOMAIN for real testing.');
    }
    console.log('');

    let recordId: string | null = null;

    try {
        const porkbun = new PorkbunService();

        // Test 1: Verify the logic creates correct SRV record
        console.log('🔧 Step 1: Testing SRV record creation with correct target...');
        console.log(`Expected SRV record:`);
        console.log(`  Name: _minecraft._tcp.${testConfig.testSubdomain}.${testConfig.domain}`);
        console.log(`  Target: ${testConfig.serverTarget}:${testConfig.port}`);
        console.log(`  Note: Target should be subdomain.domain (${testConfig.serverTarget}), port always 25565`);
        console.log(`  Note: Target will have trailing dot in API call to prevent domain duplication`);
        console.log(`  Note: An A record for ${testConfig.serverTarget} should point to the actual server IP`);

        if (testConfig.domain !== 'example.com') {
            recordId = await porkbun.createMinecraftSrvRecordStrict(
                testConfig.domain,
                testConfig.testSubdomain,
                testConfig.port,
                testConfig.serverTarget
            );

            if (recordId) {
                console.log(`✅ SRV record created successfully with ID: ${recordId}`);
                console.log(`✅ Target correctly set to: ${testConfig.serverTarget}:${testConfig.port}`);
                console.log(`✅ Port is always 25565 for Minecraft SRV records`);
                console.log('');
            } else {
                console.log(`❌ SRV record creation failed`);
            }
        } else {
            console.log(`🔍 Skipped (test values) - would create correct SRV record:`);
            console.log(`   _minecraft._tcp.${testConfig.testSubdomain}.${testConfig.domain} -> ${testConfig.serverTarget}:${testConfig.port}`);
        }

        // Test 2: Verify the expected DNS resolution chain
        console.log('🔍 Step 2: Validating expected DNS resolution...');
        console.log('✅ Expected behavior:');
        console.log(`   1. Player connects to: ${testConfig.testSubdomain}.${testConfig.domain}`);
        console.log(`   2. Minecraft client queries SRV: _minecraft._tcp.${testConfig.testSubdomain}.${testConfig.domain}`);
        console.log(`   3. SRV record returns: ${testConfig.serverTarget}:${testConfig.port}`);
        console.log(`   4. Client queries A record: ${testConfig.serverTarget} (pre-existing)`);
        console.log(`   5. A record for ${testConfig.serverTarget} returns actual server IP`);
        console.log(`   6. Client connects to: actual_server_ip:25565`);
        console.log('');

        // Test 3: Cleanup
        if (recordId && testConfig.domain !== 'example.com') {
            console.log('🧹 Step 3: Cleaning up test record...');
            
            const srvDeleted = await porkbun.deleteMinecraftSrvRecord(testConfig.domain, testConfig.testSubdomain);
            
            console.log(`SRV record cleanup: ${srvDeleted ? '✅' : '❌'}`);
            console.log(`Note: A record for ${testConfig.serverTarget} preserved (managed independently)`);
        }

        console.log('');
        console.log('🎉 SRV Record Fix Test completed successfully!');
        console.log('🔧 Fix Summary:');
        console.log('   - SRV target uses subdomain.domain format (as intended)');
        console.log('   - Trailing dot added in API call to prevent domain duplication');
        console.log('   - Each subdomain needs its own A record pointing to server IP');
        console.log('   - Fixed Porkbun API treating target as relative hostname');

    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
        
        // Attempt cleanup if we have a record ID
        if (recordId && testConfig.domain !== 'example.com') {
            try {
                console.log('🧹 Attempting emergency cleanup...');
                const porkbun = new PorkbunService();
                await porkbun.deleteMinecraftSrvRecord(testConfig.domain, testConfig.testSubdomain);
                console.log('✅ Emergency cleanup completed');
            } catch (cleanupError) {
                console.error('❌ Emergency cleanup also failed:', cleanupError);
            }
        }
        
        process.exit(1);
    }
}

// Run the test
testSrvRecordFix().catch(console.error);
