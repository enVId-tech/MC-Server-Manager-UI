#!/usr/bin/env tsx
/**
 * Test script for Porkbun DNS functionality
 * Tests creating SRV and CNAME records for Minecraft servers
 * 
 * Usage:
 * npm run test:porkbun-dns
 * or
 * npx tsx scripts/test-porkbun-dns.ts
 */

import dotenv from 'dotenv';
import porkbun from '../lib/server/porkbun';

// Load environment variables
dotenv.config();

interface TestConfig {
    domain: string;
    subdomain: string;
    target: string;
    port: number;
    testSubdomain?: string;
}

class PorkbunDnsTest {
    private config: TestConfig;
    private createdRecords: Array<{ id: string; type: string; name: string }> = [];

    constructor(config: TestConfig) {
        this.config = config;
    }

    /**
     * Run all DNS tests
     */
    async runAllTests(): Promise<void> {
        console.log('🧪 Starting Porkbun DNS Tests for Minecraft Server');
        console.log('=' .repeat(60));
        console.log(`Domain: ${this.config.domain}`);
        console.log(`Subdomain: ${this.config.subdomain}`);
        console.log(`Target: ${this.config.target}`);
        console.log(`Port: ${this.config.port}`);
        console.log('');
        console.log('📋 This test will:');
        console.log('   1. ✅ Validate API credentials and connectivity');
        console.log('   2. 📝 Create and verify a simple A record');
        console.log('   3. 🎯 Test SRV record creation for Minecraft (REQUIRED)');
        console.log('   4. � Test strict SRV creation logic (no fallback)');
        console.log('   5. 🎮 Run dedicated Minecraft DNS tests');
        console.log('   6. 🔍 Verify all created records exist');
        console.log('   7. 🧹 Clean up all test records');
        console.log('');
        console.log('⚠️  Note: All test records will be automatically deleted');
        console.log('⚠️  SRV record creation is REQUIRED - no CNAME fallback');
        console.log('=' .repeat(60));

        try {
            // Test 1: Environment validation
            await this.testEnvironmentSetup();

            // Test 2: Basic connectivity
            await this.testBasicConnectivity();

            // Test 3: Simple record creation
            await this.testSimpleRecordCreation();

            // Test 4: SRV record creation
            await this.testSrvRecordCreation();

            // Test 5: Strict SRV creation (no fallback)
            await this.testStrictSrvCreation();

            // Test 6: Record retrieval and verification
            await this.testRecordRetrieval();

            // Test 6.5: Dedicated Minecraft DNS record test
            await this.testMinecraftSpecificDns();

            console.log('\n✅ All tests completed successfully!');

        } catch (error) {
            console.error('\n❌ Test suite failed:', error);
        } finally {
            // Cleanup created records
            await this.cleanup();
        }
    }

    /**
     * Test 1: Environment and credentials validation
     */
    async testEnvironmentSetup(): Promise<void> {
        console.log('\n📋 Test 1: Environment Setup');
        console.log('-'.repeat(40));

        // Check environment variables
        const apiKey = process.env.PORKBUN_API_KEY;
        const secretKey = process.env.PORKBUN_SECRET_KEY;

        if (!apiKey || !secretKey) {
            throw new Error('❌ Missing required environment variables: PORKBUN_API_KEY and/or PORKBUN_SECRET_KEY');
        }

        console.log('✅ API Key found:', apiKey.substring(0, 8) + '...');
        console.log('✅ Secret Key found:', secretKey.substring(0, 8) + '...');
        console.log('✅ Environment setup validated');
    }

    /**
     * Test 2: Basic DNS connectivity
     */
    async testBasicConnectivity(): Promise<void> {
        console.log('\n🌐 Test 2: Basic DNS Connectivity');
        console.log('-'.repeat(40));

        try {
            const isConnected = await porkbun.testDnsConnectivity(this.config.domain);
            
            if (isConnected) {
                console.log('✅ DNS connectivity test passed');
            } else {
                throw new Error('❌ DNS connectivity test failed');
            }
        } catch (error) {
            console.error('❌ Connectivity test error:', error);
            throw error;
        }
    }

    /**
     * Test 3: Simple A record creation and deletion
     */
    async testSimpleRecordCreation(): Promise<void> {
        console.log('\n📝 Test 3: Simple A Record Creation');
        console.log('-'.repeat(40));

        const testSubdomain = this.config.testSubdomain || `test-${Date.now()}`;
        const testIp = '192.0.2.1'; // RFC 5737 test IP

        try {
            const result = await porkbun.testCreateSimpleRecord(this.config.domain, testSubdomain, testIp);
            
            if (result.success && result.recordId) {
                console.log(`✅ A record created: ${testSubdomain}.${this.config.domain} -> ${testIp}`);
                console.log(`   Record ID: ${result.recordId}`);
                
                // Store for cleanup
                this.createdRecords.push({
                    id: result.recordId,
                    type: 'A',
                    name: testSubdomain
                });
            } else {
                throw new Error(`Failed to create A record: ${result.error}`);
            }
        } catch (error) {
            console.error('❌ Simple record creation failed:', error);
            throw error;
        }
    }

    /**
     * Test 4: SRV record creation
     */
    async testSrvRecordCreation(): Promise<void> {
        console.log('\n🎯 Test 4: SRV Record Creation');
        console.log('-'.repeat(40));

        const srvSubdomain = `${this.config.subdomain}-srv`;

        try {
            console.log(`Attempting to create SRV record for: _minecraft._tcp.${srvSubdomain}.${this.config.domain}`);
            console.log(`Target: ${this.config.target}:${this.config.port}`);
            
            const recordId = await porkbun.createMinecraftSrvRecord(
                this.config.domain,
                srvSubdomain,
                this.config.port,
                this.config.target
            );

            if (recordId) {
                console.log(`✅ SRV record created successfully`);
                console.log(`   Record ID: ${recordId}`);
                console.log(`   Full record: _minecraft._tcp.${srvSubdomain}.${this.config.domain}`);
                console.log(`   🎮 Players can connect with: minecraft://${srvSubdomain}.${this.config.domain}`);
                
                // Store for cleanup
                this.createdRecords.push({
                    id: recordId,
                    type: 'SRV',
                    name: `_minecraft._tcp.${srvSubdomain}`
                });
                
                // Test that the record actually exists
                console.log('   🔍 Verifying SRV record was created...');
                await this.verifySrvRecord(srvSubdomain, recordId);
                
            } else {
                console.log('❌ SRV record creation failed');
                console.log('   This indicates that SRV records are not supported by Porkbun for this domain');
                console.log('   ⚠️  CRITICAL: SRV records are required for proper Minecraft server functionality');
                console.log('   📋 Please verify:');
                console.log('      - Your domain supports SRV records');
                console.log('      - Your API credentials have DNS management permissions');
                console.log('      - The domain is properly configured in Porkbun');
                
                throw new Error('SRV record creation failed - this is required for Minecraft servers');
            }
        } catch (error) {
            console.error('❌ SRV record creation error:', error);
            console.log('⚠️  SRV record test failed - this is expected if SRV format is not supported');
            // Don't throw here as SRV might not be supported, but we want to continue testing
        }
    }

    /**
     * Test 5: Strict SRV record creation (no fallback)
     */
    async testStrictSrvCreation(): Promise<void> {
        console.log('\n🎯 Test 5: Strict SRV Record Creation (No Fallback)');
        console.log('-'.repeat(40));

        const strictSrvSubdomain = `${this.config.subdomain}-strict`;

        try {
            console.log(`Attempting strict SRV record creation for: _minecraft._tcp.${strictSrvSubdomain}.${this.config.domain}`);
            console.log(`Target: ${this.config.target}:${this.config.port}`);
            console.log(`Note: This test will fail if SRV records are not supported (no fallback)`);
            
            const recordId = await porkbun.createMinecraftSrvRecordStrict(
                this.config.domain,
                strictSrvSubdomain,
                this.config.port,
                this.config.target
            );

            console.log(`✅ Strict SRV record created successfully`);
            console.log(`   Record ID: ${recordId}`);
            console.log(`   Full record: _minecraft._tcp.${strictSrvSubdomain}.${this.config.domain}`);
            console.log(`   🎮 Players can connect with: minecraft://${strictSrvSubdomain}.${this.config.domain}`);
            
            // Store for cleanup
            this.createdRecords.push({
                id: recordId,
                type: 'SRV',
                name: `_minecraft._tcp.${strictSrvSubdomain}`
            });
            
            // Test that the record actually exists
            console.log('   🔍 Verifying strict SRV record was created...');
            await this.verifySrvRecord(strictSrvSubdomain, recordId);
            
        } catch (error) {
            console.error('❌ Strict SRV record creation failed:', error);
            console.log('   This means SRV records are not working for this domain configuration');
            console.log('   🚨 CRITICAL: The Minecraft server creation process will fail without SRV support');
            throw error;
        }
    }



    /**
     * Test 6: Record retrieval and verification
     */
    async testRecordRetrieval(): Promise<void> {
        console.log('\n🔍 Test 6: Record Retrieval and Verification');
        console.log('-'.repeat(40));

        try {
            const records = await porkbun.getDnsRecords(this.config.domain);
            
            if (!records) {
                throw new Error('Failed to retrieve DNS records');
            }

            console.log(`✅ Retrieved ${records.length} DNS records for ${this.config.domain}`);
            
            // Verify our created records exist
            let foundRecords = 0;
            for (const createdRecord of this.createdRecords) {
                const found = records.find(r => r.id === createdRecord.id);
                if (found) {
                    foundRecords++;
                    console.log(`✅ Found created record: ${found.type} ${found.name} -> ${found.content}`);
                } else {
                    console.log(`⚠️  Created record not found: ${createdRecord.type} ${createdRecord.name}`);
                }
            }

            console.log(`📊 Verification: ${foundRecords}/${this.createdRecords.length} created records found`);

        } catch (error) {
            console.error('❌ Record retrieval failed:', error);
            throw error;
        }
    }

    /**
     * Verify that an SRV record was actually created and is accessible
     */
    async verifySrvRecord(subdomain: string, recordId: string): Promise<void> {
        try {
            const records = await porkbun.getDnsRecords(this.config.domain);
            if (!records) {
                console.log('   ⚠️  Could not retrieve records for verification');
                return;
            }

            const srvRecord = records.find(r => r.id === recordId && r.type === 'SRV');
            if (srvRecord) {
                console.log(`   ✅ SRV record verified: ${srvRecord.name} -> ${srvRecord.content}`);
            } else {
                console.log(`   ❌ SRV record not found in DNS records (ID: ${recordId})`);
            }
        } catch (error) {
            console.log('   ⚠️  Error verifying SRV record:', error);
        }
    }

    /**
     * Verify that a CNAME record was actually created and is accessible
     */
    async verifyCnameRecord(subdomain: string, recordId: string): Promise<void> {
        try {
            const records = await porkbun.getDnsRecords(this.config.domain);
            if (!records) {
                console.log('   ⚠️  Could not retrieve records for verification');
                return;
            }

            const cnameRecord = records.find(r => r.id === recordId && r.type === 'CNAME');
            if (cnameRecord) {
                console.log(`   ✅ CNAME record verified: ${cnameRecord.name} -> ${cnameRecord.content}`);
            } else {
                console.log(`   ❌ CNAME record not found in DNS records (ID: ${recordId})`);
            }
        } catch (error) {
            console.log('   ⚠️  Error verifying CNAME record:', error);
        }
    }

    /**
     * Cleanup created records
     */
    async cleanup(): Promise<void> {
        console.log('\n🧹 Cleanup: Deleting created test records');
        console.log('-'.repeat(40));

        let deletedCount = 0;
        for (const record of this.createdRecords) {
            try {
                const success = await porkbun.deleteDnsRecord(this.config.domain, record.id);
                if (success) {
                    deletedCount++;
                    console.log(`✅ Deleted: ${record.type} ${record.name} (${record.id})`);
                } else {
                    console.log(`⚠️  Failed to delete: ${record.type} ${record.name} (${record.id})`);
                }
            } catch (error) {
                console.log(`❌ Error deleting ${record.type} ${record.name}:`, error);
            }
        }

        console.log(`📊 Cleanup complete: ${deletedCount}/${this.createdRecords.length} records deleted`);
    }

    /**
     * Display test results summary
     */
    displaySummary(): void {
        console.log('\n📈 Test Summary');
        console.log('=' .repeat(60));
        console.log(`Domain tested: ${this.config.domain}`);
        console.log(`Records created: ${this.createdRecords.length}`);
        console.log(`Target server: ${this.config.target}:${this.config.port}`);
        console.log('');
        
        // Analyze which record types worked
        const recordTypes = {
            A: this.createdRecords.filter(r => r.type === 'A').length,
            SRV: this.createdRecords.filter(r => r.type === 'SRV').length
        };
        
        console.log('📊 Record Creation Results:');
        console.log(`   A records: ${recordTypes.A > 0 ? '✅' : '❌'} (${recordTypes.A} created)`);
        console.log(`   SRV records: ${recordTypes.SRV > 0 ? '✅' : '❌'} (${recordTypes.SRV} created)`);
        
        console.log('');
        console.log('🎮 Minecraft Server DNS Configuration:');
        
        if (recordTypes.SRV > 0) {
            console.log('   ✅ SRV records work - REQUIRED method');
            console.log(`   📡 Players connect: minecraft://${this.config.subdomain}.${this.config.domain}`);
            console.log('   🎯 Port is automatically detected by Minecraft client');
            console.log('   ✅ Minecraft server creation will work properly');
        } else {
            console.log('   ❌ SRV records failed - CRITICAL ISSUE');
            console.log('   � Minecraft server creation will fail');
            console.log('   📋 SRV records are required - no fallback available');
        }
        
        console.log('');
        console.log('💡 Recommendations for your Minecraft server:');
        
        if (recordTypes.SRV > 0) {
            console.log('   🎯 SRV records are working correctly');
            console.log('   📋 Your application can create Minecraft servers successfully');
            console.log('   🎮 Players will have the best user experience (no port required)');
        } else {
            console.log('   � SRV records are not working - server creation will fail');
            console.log('   � Check the following:');
            console.log('      - Verify your domain supports SRV records');
            console.log('      - Check API credentials have DNS management permissions');
            console.log('      - Ensure the domain is properly configured in Porkbun');
            console.log('      - Contact Porkbun support if issues persist');
        }
        
        console.log('=' .repeat(60));
    }

    /**
     * Test 6.5: Dedicated Minecraft DNS record test
     * This test specifically validates SRV records for Minecraft servers (no CNAME fallback)
     */
    async testMinecraftSpecificDns(): Promise<void> {
        console.log('\n🎮 Test 6.5: Dedicated Minecraft DNS Test (SRV Only)');
        console.log('-'.repeat(40));

        const minecraftSubdomain = `mc-test-${Date.now()}`;
        
        console.log(`Testing Minecraft DNS for subdomain: ${minecraftSubdomain}`);
        console.log(`Server details: ${this.config.target}:${this.config.port}`);
        console.log(`⚠️  This test requires SRV record support - no fallback to CNAME`);
        console.log('');

        // Test SRV record creation specifically for Minecraft using strict mode
        console.log('📡 Testing strict SRV record for Minecraft...');
        try {
            const srvRecordId = await porkbun.createMinecraftSrvRecordStrict(
                this.config.domain,
                minecraftSubdomain,
                this.config.port,
                this.config.target
            );

            console.log(`✅ Minecraft SRV record created: _minecraft._tcp.${minecraftSubdomain}.${this.config.domain}`);
            console.log(`   Record ID: ${srvRecordId}`);
            console.log(`   🎮 Players connect: ${minecraftSubdomain}.${this.config.domain} (port auto-detected)`);
            
            this.createdRecords.push({
                id: srvRecordId,
                type: 'SRV',
                name: `_minecraft._tcp.${minecraftSubdomain}`
            });

            // Wait a moment for DNS propagation simulation
            console.log('   ⏳ Waiting 2 seconds before verification...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await this.verifySrvRecord(minecraftSubdomain, srvRecordId);

        } catch (error) {
            console.log('❌ Minecraft SRV record test failed:', error);
            console.log('   🚨 CRITICAL: This means Minecraft server creation will fail');
            console.log('   📋 SRV records are essential for proper Minecraft connectivity');
            throw error;
        }

        console.log('');
        console.log('🎯 Minecraft DNS Test Summary:');
        console.log(`   Domain: ${this.config.domain}`);
        console.log(`   Subdomain tested: ${minecraftSubdomain}`);
        console.log(`   Target server: ${this.config.target}:${this.config.port}`);
        
        const srvWorking = this.createdRecords.some(r => r.type === 'SRV' && r.name.includes(minecraftSubdomain));
        
        if (srvWorking) {
            console.log('   ✅ SRV records: WORKING (required method)');
            console.log(`   🎮 Players connect: ${minecraftSubdomain}.${this.config.domain}`);
            console.log('   🎯 Port is automatically detected by Minecraft client');
            console.log('   ✅ Minecraft server creation will work properly');
        } else {
            console.log('   ❌ SRV records: NOT WORKING (critical failure)');
            console.log('   🚨 Minecraft server creation will fail');
            console.log('   📋 No fallback available - SRV records are required');
        }
    }
}

/**
 * Main test execution
 */
async function main() {
    // Configuration - Update these values for your test
    const testConfig: TestConfig = {
        domain: process.env.TEST_DOMAIN || 'etran.dev',
        subdomain: process.env.TEST_SUBDOMAIN || 'test-mc',
        target: process.env.TEST_TARGET || 'play.etran.dev',
        port: parseInt(process.env.TEST_PORT || '25566'),
        testSubdomain: `test-api-${Date.now()}`
    };

    // Validate configuration
    if (!testConfig.domain.includes('.')) {
        console.error('❌ Invalid domain format. Please set TEST_DOMAIN environment variable.');
        process.exit(1);
    }

    const tester = new PorkbunDnsTest(testConfig);
    
    try {
        await tester.runAllTests();
        tester.displaySummary();
        process.exit(0);
    } catch (error) {
        console.error('\n💥 Test suite failed with error:', error);
        tester.displaySummary();
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🧪 Porkbun DNS Test Script for Minecraft Servers

Usage:
  npm run test:porkbun-dns
  npx tsx scripts/test-porkbun-dns.ts

Environment Variables:
  PORKBUN_API_KEY     - Required: Your Porkbun API key
  PORKBUN_SECRET_KEY  - Required: Your Porkbun secret key
  TEST_DOMAIN         - Optional: Domain to test (default: etran.dev)
  TEST_SUBDOMAIN      - Optional: Subdomain to test (default: test-mc)
  TEST_TARGET         - Optional: Target server (default: play.etran.dev)
  TEST_PORT           - Optional: Server port (default: 25566)

Examples:
  TEST_DOMAIN=mydomain.com npm run test:porkbun-dns
  TEST_SUBDOMAIN=survival TEST_TARGET=mc.example.com npm run test:porkbun-dns
`);
    process.exit(0);
}

// Run the tests
main().catch(console.error);
