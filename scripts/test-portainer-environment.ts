#!/usr/bin/env npx tsx

import dotenv from 'dotenv';

// Suppress dotenv verbose output
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
console.log = () => {}; // Temporarily suppress console.log
console.info = () => {}; // Temporarily suppress console.info

dotenv.config({ debug: false });

// Restore console methods
console.log = originalConsoleLog;
console.info = originalConsoleInfo;

import portainer from '../lib/server/portainer';

async function testPortainerEnvironmentId() {
    console.log('🧪 Testing Portainer Environment ID Auto-Detection');
    console.log('='.repeat(60));

    try {
        console.log('🔌 Testing Portainer connection...');
        const connectionTest = await portainer.testConnection();
        console.log(`📡 Connection successful: ${connectionTest}`);
        
        if (!connectionTest) {
            console.error('❌ Failed to connect to Portainer. Check your PORTAINER_URL and credentials.');
            return;
        }

        console.log('🌍 Fetching available environments...');
        const environments = await portainer.getEnvironments();
        console.log(`📋 Found ${environments.length} environment(s):`);
        
        environments.forEach((env: any, index: number) => {
            console.log(`   ${index + 1}. ${env.Name} (ID: ${env.Id})`);
        });

        if (environments.length === 0) {
            console.warn('⚠️  No environments found. This might cause issues with container operations.');
            return;
        }

        console.log('🔍 Testing container fetching with auto-detected environment...');
        const firstEnvironmentId = await portainer.getFirstEnvironmentId();
        console.log(`🎯 First environment ID: ${firstEnvironmentId}`);

        if (firstEnvironmentId) {
            console.log('📦 Fetching containers using auto-detected environment...');
            const containers = await portainer.getContainers();
            console.log(`✅ Successfully fetched ${containers.length} container(s)`);
            
            if (containers.length > 0) {
                console.log('📋 First few containers:');
                containers.slice(0, 3).forEach((container: any, index: number) => {
                    const name = container.Names && container.Names.length > 0 
                        ? container.Names[0].replace(/^\//, '') 
                        : 'Unknown';
                    console.log(`   ${index + 1}. ${name} (${container.State}) - ${container.Id.substring(0, 12)}`);
                });
                
                if (containers.length > 3) {
                    console.log(`   ... and ${containers.length - 3} more containers`);
                }
            }

            // Test searching for a specific container
            console.log('🔍 Testing container search by identifier...');
            const testContainerName = 'mc-34616c25-7629-4040-8290-d9ecbaa2b274';
            console.log(`   Searching for container: ${testContainerName}`);
            
            const foundContainer = await portainer.getContainerByIdentifier(testContainerName);
            if (foundContainer) {
                console.log(`✅ Found container: ${foundContainer.Names[0]} (${foundContainer.State})`);
            } else {
                console.log(`ℹ️  Container '${testContainerName}' not found (this is expected if the server doesn't exist)`);
            }
        }

        console.log('');
        console.log('✅ Portainer environment ID auto-detection test completed!');
        console.log('💡 The system should now automatically detect and use the first available environment.');

    } catch (error) {
        console.error('❌ Error during Portainer test:', error);
        console.log('🔧 Troubleshooting Tips:');
        console.log('1. Check if Portainer is running and accessible');
        console.log('2. Verify PORTAINER_URL is correct');
        console.log('3. Check if PORTAINER_API_KEY is valid');
        console.log('4. Ensure network connectivity to Portainer instance');
    }
}

// Run the test
testPortainerEnvironmentId().catch(console.error);
