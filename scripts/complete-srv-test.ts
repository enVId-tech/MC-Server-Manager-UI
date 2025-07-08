#!/usr/bin/env npx tsx

import dotenv from 'dotenv';
dotenv.config();

import porkbun from '../lib/server/porkbun';

async function main() {
    try {
        const domain = 'etran.dev';
        const subdomain = 'test-main1';  // Different name to avoid conflicts
        const port = 25565;
        const target = `${subdomain}.${domain}`;
        
        console.log('🔄 Complete SRV Record Test (Create -> Verify -> Delete -> Verify)');
        console.log('Domain:', domain);
        console.log('Subdomain:', subdomain);
        console.log('Target:', target);
        console.log('Port:', port);
        console.log('='.repeat(70));

        // Step 1: Create SRV record
        console.log('\n📝 Step 1: Creating SRV record...');
        const recordId = await porkbun.createMinecraftSrvRecord(domain, subdomain, port, target);
        
        if (!recordId) {
            console.log('❌ Failed to create SRV record');
            return;
        }
        
        console.log('✅ SRV record created with ID:', recordId);

        // Step 2: Verify creation
        console.log('\n🔍 Step 2: Verifying SRV record creation...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        let records = await porkbun.getDnsRecords(domain);
        let srvRecord = records?.find(r => r.id === recordId);
        
        if (srvRecord) {
            console.log('✅ Record found:');
            console.log('   Name:', srvRecord.name);
            console.log('   Content:', srvRecord.content);
            
            const expectedContent = `0 ${port} ${target}.`;
            if (srvRecord.content === expectedContent) {
                console.log('✅ Content is correct!');
            } else {
                console.log('❌ Content is incorrect!');
                console.log('   Expected:', expectedContent);
                console.log('   Actual:  ', srvRecord.content);
            }
        } else {
            console.log('❌ Created record not found');
            return;
        }

        // Step 3: Delete SRV record
        console.log('\n🗑️  Step 3: Deleting SRV record...');
        const deleteSuccess = await porkbun.deleteMinecraftSrvRecord(domain, subdomain);
        
        if (deleteSuccess) {
            console.log('✅ SRV record deleted successfully');
        } else {
            console.log('❌ Failed to delete SRV record');
            return;
        }

        // Step 4: Verify deletion
        console.log('\n🔍 Step 4: Verifying SRV record deletion...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        records = await porkbun.getDnsRecords(domain);
        const remainingRecord = records?.find(r => r.id === recordId);
        
        if (!remainingRecord) {
            console.log('✅ Record successfully deleted');
        } else {
            console.log('❌ Record still exists after deletion');
            console.log('   Remaining record:', remainingRecord.name, '->', remainingRecord.content);
        }

        console.log('\n🎉 Complete test finished successfully!');
        console.log('✅ SRV record creation and deletion are working correctly');

    } catch (error) {
        console.error('❌ Error during complete test:', error);
    }
}

main().catch(console.error);
