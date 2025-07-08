#!/usr/bin/env npx tsx

import dotenv from 'dotenv';
dotenv.config();

import porkbun from '../lib/server/porkbun';

async function main() {
    try {
        const domain = 'etran.dev';
        const subdomain = 'test-main1';
        
        console.log('🗑️  Testing SRV record deletion for test-main1');
        console.log('Domain:', domain);
        console.log('Subdomain:', subdomain);
        console.log('='.repeat(60));

        console.log('Attempting to delete SRV record...');
        const success = await porkbun.deleteMinecraftSrvRecord(domain, subdomain);
        
        if (success) {
            console.log('✅ SRV record deleted successfully!');
            
            // Wait a moment, then verify it was deleted
            console.log('\n⏳ Waiting 2 seconds before verification...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            console.log('\n🔍 Verifying the SRV record was deleted...');
            const records = await porkbun.getDnsRecords(domain);
            if (records) {
                const remainingSrvRecords = records.filter(r => 
                    r.type === 'SRV' && r.name === `_minecraft._tcp.${subdomain}.${domain}`
                );
                
                if (remainingSrvRecords.length === 0) {
                    console.log('✅ Verification PASSED: SRV record successfully deleted');
                } else {
                    console.log('❌ Verification FAILED: SRV record still exists');
                    remainingSrvRecords.forEach(record => {
                        console.log(`   Remaining record: ${record.id} - ${record.name} -> ${record.content}`);
                    });
                }
            }
            
        } else {
            console.log('❌ Failed to delete SRV record');
        }

    } catch (error) {
        console.error('❌ Error testing SRV record deletion:', error);
    }
}

main().catch(console.error);
