#!/usr/bin/env tsx
/**
 * Quick DNS test for Minecraft server
 * This is a simplified version for quick testing (SRV records only)
 */

import dotenv from 'dotenv';
import porkbun from '../lib/server/porkbun';

dotenv.config();

async function quickDnsTest() {
    console.log('🚀 Quick Minecraft DNS Test (SRV Only)');
    console.log('='.repeat(40));

    // Test configuration
    const domain = 'etran.dev';
    const subdomain = `quicktest-${Date.now()}`;
    const target = 'play.etran.dev';
    const port = 25566;

    console.log(`Testing: ${subdomain}.${domain} -> ${target}:${port}`);
    console.log('📋 This will test SRV record creation (required for Minecraft servers)');
    console.log('⚠️  Test records will be auto-deleted after 10 seconds');
    console.log('');

    let recordId: string | null = null;

    try {
        // Test basic connectivity
        console.log('1. Testing connectivity...');
        const connected = await porkbun.testDnsConnectivity(domain);
        console.log(`   ${connected ? '✅' : '❌'} Connectivity: ${connected ? 'OK' : 'FAILED'}`);

        if (!connected) {
            console.log('❌ Cannot proceed without connectivity');
            return;
        }

        // Test strict SRV creation (no fallback)
        console.log('\n2. Creating SRV record (strict mode - no fallback)...');
        recordId = await porkbun.createMinecraftSrvRecordStrict(domain, subdomain, port, target);

        console.log(`✅ SRV record created successfully!`);
        console.log(`   Record ID: ${recordId}`);
        console.log(`   🎮 SRV WORKS! Players connect: ${subdomain}.${domain}`);
        console.log(`   🎯 Port ${port} is automatically detected`);
        console.log(`   📡 Full record: _minecraft._tcp.${subdomain}.${domain}`);

        // Wait 10 seconds, then clean up
        console.log('\n3. Verification and cleanup...');

        if (recordId) {
            console.log('   ⏳ Waiting 10 seconds before cleanup...');
            await new Promise(resolve => setTimeout(resolve, 10000));

            try {
                const deleted = await porkbun.deleteDnsRecord(domain, recordId);
                if (deleted) {
                    console.log(`✨ Test record ${recordId} deleted successfully`);
                } else {
                    console.log(`⚠️  Failed to delete test record ${recordId} - you may need to delete it manually`);
                }
            } catch (deleteError) {
                console.log(`⚠️  Error deleting test record: ${deleteError}`);
            }
        }

        console.log('\n🎉 Quick test completed successfully!');
        console.log('📋 Summary:');
        console.log('   ✅ DNS connectivity: WORKING');
        console.log('   ✅ SRV record creation: WORKING');
        console.log('   🎮 Minecraft server creation will work properly');

    } catch (error) {
        console.error('\n❌ Quick test failed:', error);

        // Try to clean up if we created a record
        if (recordId) {
            console.log('\n🧹 Attempting cleanup of test record...');
            try {
                await porkbun.deleteDnsRecord(domain, recordId);
                console.log('✨ Cleanup successful');
            } catch (cleanupError) {
                console.log('⚠️  Cleanup failed - you may need to delete the test record manually');
            }
        }

        console.log('\n📋 What this means:');
        if (error instanceof Error && error.message.includes('SRV')) {
            console.log('   🚨 SRV records are not supported or failing');
            console.log('   📋 Minecraft server creation will fail');
            console.log('   🔧 Check your domain configuration and API permissions');
        } else {
            console.log('   🔧 Check your API credentials and network connection');
        }
    }
}

// Handle command line help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
� Quick DNS Test for Minecraft Servers

This script performs a fast test of SRV record creation for Minecraft servers.
It creates a test SRV record, waits 10 seconds, then deletes it.

Usage:
  npm run test:dns-quick
  npx tsx scripts/quick-dns-test.ts

Requirements:
  - PORKBUN_API_KEY environment variable
  - PORKBUN_SECRET_KEY environment variable
  - Domain must be managed by Porkbun

What it tests:
  ✅ DNS connectivity
  ✅ SRV record creation (required for Minecraft)
  ✅ Record cleanup

Note: SRV records are REQUIRED for Minecraft servers.
No fallback to CNAME is available.
`);
    process.exit(0);
}

// Run the test
quickDnsTest().catch(console.error);
