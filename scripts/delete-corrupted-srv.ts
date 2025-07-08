#!/usr/bin/env npx tsx

import dotenv from 'dotenv';
dotenv.config();

import porkbun from '../lib/server/porkbun';

async function main() {
    try {
        const domain = 'etran.dev';
        const recordId = '481712956'; // The corrupted main1 SRV record
        
        console.log('🗑️  Deleting corrupted SRV record for main1');
        console.log('Record ID:', recordId);
        console.log('Domain:', domain);
        console.log('='.repeat(60));

        const success = await porkbun.deleteDnsRecord(domain, recordId);
        
        if (success) {
            console.log('✅ Successfully deleted the corrupted SRV record');
            console.log('The SRV record with target "main1.etran.dev.etran.dev." has been removed');
        } else {
            console.log('❌ Failed to delete the corrupted SRV record');
        }

    } catch (error) {
        console.error('❌ Error deleting corrupted SRV record:', error);
    }
}

main().catch(console.error);
