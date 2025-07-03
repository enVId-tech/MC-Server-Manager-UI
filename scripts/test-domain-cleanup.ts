#!/usr/bin/env tsx
/**
 * Test duplicate domain cleanup
 */

import dotenv from 'dotenv';
import porkbun from '../lib/server/porkbun';

dotenv.config();

async function testDomainCleanup() {
    console.log('🧪 Testing Domain Cleanup Logic');
    console.log('=' .repeat(40));

    try {
        console.log('Testing with subdomain that already contains domain suffix...');
        console.log('Input: subdomain="main1.etran.dev", domain="etran.dev"');
        
        // This should trigger the cleanup logic
        const recordId = await porkbun.createMinecraftSrvRecordStrict('etran.dev', 'main1.etran.dev', 25566, 'play.etran.dev');
        
        console.log('✅ SRV record created successfully!');
        console.log('Record ID:', recordId);
        
        // Clean up
        console.log('🧹 Cleaning up test record...');
        await porkbun.deleteDnsRecord('etran.dev', recordId);
        console.log('✅ Cleanup complete');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testDomainCleanup().catch(console.error);
