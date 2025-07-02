import { PortainerApiClient } from './portainer';

/**
 * Test script for Portainer API functionality
 * Make sure to set your environment variables before running this test:
 * - PORTAINER_URL
 * - PORTAINER_API_KEY or PORTAINER_USERNAME + PORTAINER_PASSWORD
 */

async function testPortainerConnection() {
    console.log('🧪 Testing Portainer API Connection...');
    
    // Create Portainer client
    const portainer = new PortainerApiClient(
        process.env.PORTAINER_URL || 'https://your-portainer-instance.com:9443',
        process.env.PORTAINER_API_KEY ? 
            process.env.PORTAINER_API_KEY : 
            {
                username: process.env.PORTAINER_USERNAME || 'admin',
                password: process.env.PORTAINER_PASSWORD || 'password'
            }
    );

    try {
        // Test 1: Connection test
        console.log('\n📡 Test 1: Testing connection...');
        const connected = await portainer.testConnection();
        if (connected) {
            console.log('✅ Connection successful!');
        } else {
            console.log('❌ Connection failed!');
            return;
        }

        // Test 2: Get environments
        console.log('\n🌍 Test 2: Getting environments...');
        const environments = await portainer.getEnvironments();
        console.log(`✅ Found ${environments.length} environments:`);
        environments.forEach(env => {
            console.log(`   - ${env.Name} (ID: ${env.Id})`);
        });

        if (environments.length === 0) {
            console.log('❌ No environments found. Cannot continue tests.');
            return;
        }

        // Test 3: Get stacks
        const environmentId = environments[0].Id;
        console.log(`\n📚 Test 3: Getting stacks for environment ${environmentId}...`);
        const stacks = await portainer.getStacks();
        console.log(`✅ Found ${stacks.length} stacks:`);
        stacks.forEach(stack => {
            console.log(`   - ${stack.Name} (ID: ${stack.Id})`);
        });

        // Test 4: Get containers
        console.log(`\n🐳 Test 4: Getting containers for environment ${environmentId}...`);
        const containers = await portainer.getContainers(environmentId);
        console.log(`✅ Found ${containers.length} containers:`);
        containers.slice(0, 5).forEach(container => {
            console.log(`   - ${container.Names.join(', ')} (${container.State})`);
        });

        // Test 5: Get used ports
        console.log(`\n🚪 Test 5: Getting used ports for environment ${environmentId}...`);
        const usedPorts = await portainer.getUsedPorts(environmentId);
        console.log(`✅ Found ${usedPorts.length} used ports:`, usedPorts.slice(0, 10));

        console.log('\n🎉 All tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

async function testStackCreation() {
    console.log('\n🏗️ Testing Stack Creation...');
    
    const portainer = new PortainerApiClient(
        process.env.PORTAINER_URL || 'https://your-portainer-instance.com:9443',
        process.env.PORTAINER_API_KEY ? 
            process.env.PORTAINER_API_KEY : 
            {
                username: process.env.PORTAINER_USERNAME || 'admin',
                password: process.env.PORTAINER_PASSWORD || 'password'
            }
    );

    // Sample Minecraft server Docker Compose
    const testStackData = {
        Name: 'test-minecraft-server',
        ComposeFile: `version: '3.8'
services:
  minecraft:
    image: itzg/minecraft-server:latest
    ports:
      - "25565:25565"
    environment:
      EULA: "TRUE"
      TYPE: "PAPER"
      MEMORY: "2G"
      DIFFICULTY: "easy"
      MOTD: "Test Minecraft Server"
    volumes:
      - minecraft_data:/data
    restart: unless-stopped

volumes:
  minecraft_data:
`,
        Env: []
    };

    try {
        const environments = await portainer.getEnvironments();
        if (environments.length === 0) {
            console.log('❌ No environments found for stack creation test.');
            return;
        }

        const environmentId = environments[0].Id;
        console.log(`📦 Creating test stack on environment ${environmentId}...`);

        // Create stack with rollback protection
        const result = await portainer.createStackWithRollback(testStackData, environmentId);
        console.log('✅ Test stack created successfully:', result);

        // Clean up - delete the test stack
        if (result.Id && !result.containerCreated) {
            console.log('🧹 Cleaning up test stack...');
            await portainer.deleteStack(result.Id as number, environmentId);
            console.log('✅ Test stack cleaned up');
        } else if (result.Id && result.containerCreated) {
            console.log('🧹 Cleaning up test container...');
            await portainer.cleanupExistingContainer(result.Name as string, environmentId);
            console.log('✅ Test container cleaned up');
        }

        console.log('🎉 Stack creation test completed successfully!');

    } catch (error) {
        console.error('❌ Stack creation test failed:', error);
    }
}

// Main test function
async function runTests() {
    console.log('🚀 Starting Portainer API Tests...');
    console.log('='.repeat(50));
    
    await testPortainerConnection();
    await testStackCreation();
    
    console.log('\n' + '='.repeat(50));
    console.log('🏁 All tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

export { testPortainerConnection, testStackCreation, runTests };
