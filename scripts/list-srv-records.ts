#!/usr/bin/env npx tsx

import dotenv from 'dotenv';
dotenv.config();

import porkbun from '../lib/server/porkbun';

async function main() {
    try {
        const domain = 'etran.dev';
        console.log('🔍 Listing all SRV records for domain:', domain);
        console.log('='.repeat(60));

        const records = await porkbun.getDnsRecords(domain);
        if (!records) {
            console.error('❌ Failed to retrieve DNS records');
            return;
        }

        // Filter for SRV records
        const srvRecords = records.filter(record => record.type === 'SRV');
        
        console.log(`Found ${srvRecords.length} SRV record(s):`);
        console.log('');

        if (srvRecords.length === 0) {
            console.log('🚫 No SRV records found');
        } else {
            srvRecords.forEach((record, index) => {
                console.log(`${index + 1}. Record ID: ${record.id}`);
                console.log(`   Name: ${record.name}`);
                console.log(`   Type: ${record.type}`);
                console.log(`   Content: ${record.content}`);
                console.log(`   TTL: ${record.ttl}`);
                console.log(`   Priority: ${record.prio}`);
                console.log('');
            });
        }

        // Also look for minecraft-related records (any type)
        const minecraftRecords = records.filter(record => 
            record.name.includes('minecraft') || 
            record.name.includes('_tcp') ||
            record.name.includes('main1')
        );

        if (minecraftRecords.length > 0) {
            console.log('🎮 Minecraft-related records found:');
            console.log('='.repeat(40));
            minecraftRecords.forEach((record, index) => {
                console.log(`${index + 1}. ${record.type}: ${record.name} -> ${record.content}`);
            });
        } else {
            console.log('🚫 No minecraft-related records found');
        }

    } catch (error) {
        console.error('❌ Error listing SRV records:', error);
    }
}

main().catch(console.error);
