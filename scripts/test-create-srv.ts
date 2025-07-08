#!/usr/bin/env npx tsx

import dotenv from 'dotenv';
dotenv.config();

import porkbun from '../lib/server/porkbun';

async function main() {
    try {
        const domain = 'etran.dev';
        const subdomain = 'main1';
        const port = 25565;
        const target = `${subdomain}.${domain}`; // Should be main1.etran.dev
        
        console.log('🎮 Testing SRV record creation for main1');
        console.log('Domain:', domain);
        console.log('Subdomain:', subdomain);
        console.log('Target:', target);
        console.log('Port:', port);
        console.log('='.repeat(60));

        console.log('Creating SRV record...');
        const recordId = await porkbun.createMinecraftSrvRecord(domain, subdomain, port, target);
        
        if (recordId) {
            console.log('✅ SRV record created successfully!');
            console.log('Record ID:', recordId);
            
            // Wait a moment, then verify it was created correctly
            console.log('\n⏳ Waiting 2 seconds before verification...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log('\n🔍 Verifying the new SRV record...');
            const records = await porkbun.getDnsRecords(domain);
            if (records) {
                const srvRecord = records.find(r => r.id === recordId);
                if (srvRecord) {
                    console.log('\n📋 New SRV Record Details:');
                    console.log('   Name:', srvRecord.name);
                    console.log('   Type:', srvRecord.type);
                    console.log('   Content:', srvRecord.content);
                    console.log('   TTL:', srvRecord.ttl);
                    
                    // Check if the content is correct
                    const expectedContent = `0 ${port} ${target}.`;
                    if (srvRecord.content === expectedContent) {
                        console.log('\n✅ Content is CORRECT!');
                        console.log(`   Expected: ${expectedContent}`);
                        console.log(`   Actual:   ${srvRecord.content}`);
                    } else {
                        console.log('\n❌ Content is INCORRECT!');
                        console.log(`   Expected: ${expectedContent}`);
                        console.log(`   Actual:   ${srvRecord.content}`);
                    }
                }
            }
            
        } else {
            console.log('❌ Failed to create SRV record');
        }

    } catch (error) {
        console.error('❌ Error testing SRV record creation:', error);
    }
}

main().catch(console.error);
