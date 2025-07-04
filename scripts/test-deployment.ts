/**
 * Test actual Minecraft server deployment
 * Run with: npx tsx scripts/test-deployment.ts
 */

// Load environment variables FIRST - before ANY imports
import { config } from 'dotenv';
config({ path: '.env.local' });

// Debug: Print loaded environment variables
console.log('🔍 Environment variables loaded:');
console.log(`   PORTAINER_URL: ${process.env.PORTAINER_URL || 'NOT SET'}`);
console.log(`   PORTAINER_API_KEY: ${process.env.PORTAINER_API_KEY ? '***REDACTED***' : 'NOT SET'}`);

// Import necessary modules AFTER environment is loaded
import { MinecraftServer } from '../lib/server/minecraft.js';

async function testMinecraftDeployment() {
    console.log('🎮 Testing Minecraft Server Deployment...\n');

    try {
        // Create a test Minecraft server instance
        console.log('1. Creating test Minecraft server...');

        const serverConfig = {
            EULA: true,
            VERSION: '1.21.6',
            TYPE: 'PAPER' as const,
            MEMORY: '1024M',
            MOTD: 'Test Deployment Server',
            SERVER_NAME: 'test-deployment-server',
            GAMEMODE: 'survival' as const,
            DIFFICULTY: 'normal' as const,
            MAX_PLAYERS: 20,
            PVP: true,
            ONLINE_MODE: true,
            SERVER_PORT: 25567,
            VIEW_DISTANCE: 10,
            SIMULATION_DISTANCE: 10
        };

        const serverName = 'test-deployment-' + Date.now();
        const uniqueId = Math.random().toString(36).substring(2, 15);
        const environmentId = 3; // Environment ID from our test

        const testServer = new MinecraftServer(
            serverConfig,
            serverName,
            uniqueId,
            environmentId
        );

        console.log('✅ Test server created successfully');
        console.log(`   - Name: ${serverName}`);
        console.log(`   - Config Version: ${serverConfig.VERSION}`);
        console.log(`   - Config Type: ${serverConfig.TYPE}`);
        console.log(`   - Config Port: ${serverConfig.SERVER_PORT}`);

        // Test deployment to Portainer
        console.log('\n2. Deploying to Portainer...');
        const deploymentResult = await testServer.deployToPortainer();

        if (deploymentResult.success) {
            console.log('🎉 Deployment successful!');
            console.log(`   - Method: ${deploymentResult.deploymentMethod || 'unknown'}`);
            if (deploymentResult.stackId) {
                console.log(`   - Stack ID: ${deploymentResult.stackId}`);
            }
            if (deploymentResult.containerId) {
                console.log(`   - Container ID: ${deploymentResult.containerId}`);
            }
            console.log(`   - Name: ${deploymentResult.stackName}`);
        } else {
            console.error('❌ Deployment failed');
        }

    } catch (error) {
        console.error('❌ Test deployment failed:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

// Run the test
console.log('Starting Minecraft deployment test...');
testMinecraftDeployment()
    .then(() => {
        console.log('\n🎉 Test completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Test failed with unhandled error:', error);
        process.exit(1);
    });
