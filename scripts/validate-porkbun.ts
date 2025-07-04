#!/usr/bin/env tsx
/**
 * Porkbun DNS Validation Script
 * Checks if Porkbun API is accessible without creating any records
 */

import dotenv from 'dotenv';
import porkbun from '../lib/server/porkbun';

dotenv.config();

async function validatePorkbunSetup() {
    console.log('🔍 Porkbun DNS Setup Validation');
    console.log('='.repeat(50));

    const domain = process.env.TEST_DOMAIN || 'etran.dev';

    try {
        // Check environment variables
        console.log('1. Checking environment variables...');
        const apiKey = process.env.PORKBUN_API_KEY;
        const secretKey = process.env.PORKBUN_SECRET_KEY;

        if (!apiKey || !secretKey) {
            console.log('❌ Missing API credentials');
            console.log('   Please set PORKBUN_API_KEY and PORKBUN_SECRET_KEY in your .env file');
            return false;
        }

        console.log('✅ API credentials found');
        console.log(`   API Key: ${apiKey.substring(0, 8)}...`);
        console.log(`   Secret: ${secretKey.substring(0, 8)}...`);

        // Test connectivity
        console.log('\n2. Testing API connectivity...');
        const connected = await porkbun.testDnsConnectivity(domain);

        if (!connected) {
            console.log(`❌ Cannot connect to Porkbun API for domain: ${domain}`);
            console.log('   Please check:');
            console.log('   - API credentials are correct');
            console.log('   - Domain exists in your Porkbun account');
            console.log('   - API keys have DNS management permissions');
            return false;
        }

        console.log(`✅ Successfully connected to Porkbun API`);
        console.log(`   Domain: ${domain}`);

        // Get domain info
        console.log('\n3. Retrieving domain information...');
        const domainInfo = await porkbun.getDomainInfo(domain);

        if (domainInfo) {
            console.log('✅ Domain information retrieved');
            console.log(`   Status: ${domainInfo.status}`);
            console.log(`   Creation Date: ${domainInfo.createDate}`);
            console.log(`   Expiry Date: ${domainInfo.expireDate}`);
        } else {
            console.log('⚠️  Could not retrieve domain info (this might be normal)');
        }

        // Get existing DNS records
        console.log('\n4. Checking DNS records access...');
        const records = await porkbun.getDnsRecords(domain);

        if (records) {
            console.log(`✅ DNS records accessible`);
            console.log(`   Found ${records.length} existing DNS records`);

            // Show some example records
            const recordTypes = [...new Set(records.map(r => r.type))];
            console.log(`   Record types: ${recordTypes.join(', ')}`);
        } else {
            console.log('❌ Cannot access DNS records');
            return false;
        }

        console.log('\n🎉 Porkbun setup validation successful!');
        console.log('');
        console.log('📝 Next steps:');
        console.log('   - Run: npm run test:dns-quick (for quick test)');
        console.log('   - Run: npm run test:porkbun-dns (for full test suite)');

        return true;

    } catch (error) {
        console.log(`\n❌ Validation failed with error:`);
        console.error(error);
        return false;
    }
}

// Command line help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🔍 Porkbun DNS Setup Validation

This script validates your Porkbun API setup without creating any DNS records.

Usage:
  npm run validate:porkbun
  npx tsx scripts/validate-porkbun.ts

Environment Variables:
  PORKBUN_API_KEY     - Required: Your Porkbun API key
  PORKBUN_SECRET_KEY  - Required: Your Porkbun secret key  
  TEST_DOMAIN         - Optional: Domain to test (default: etran.dev)

What it checks:
  ✅ Environment variables are set
  ✅ API credentials are valid
  ✅ Domain is accessible
  ✅ DNS records can be read
  ✅ API permissions are correct

Safe to run - no records are created or modified.
`);
    process.exit(0);
}

validatePorkbunSetup()
    .then((success) => {
        process.exit(success ? 0 : 1);
    })
    .catch((error) => {
        console.error('Validation script error:', error);
        process.exit(1);
    });
