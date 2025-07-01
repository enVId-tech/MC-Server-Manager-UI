/**
 * Simple test script to debug Portainer deployment
 * Run with: npx tsx scripts/test-portainer.ts
 */

// Load environment variables FIRST
import { config } from 'dotenv';
config({ path: '.env.local' });

// Import the PortainerApiClient class directly
import { PortainerApiClient } from '../lib/server/portainer';

async function testPortainerDeployment() {
    console.log('🧪 Testing Portainer Deployment...\n');
    
    try {
        // Check environment variables first
        console.log('0. Checking environment variables...');
        console.log(`PORTAINER_URL: ${process.env.PORTAINER_URL}`);
        console.log(`PORTAINER_API_KEY: ${process.env.PORTAINER_API_KEY ? 'Set' : 'Not set'}\n`);
        
        if (!process.env.PORTAINER_URL || !process.env.PORTAINER_API_KEY) {
            console.error('❌ Missing required environment variables');
            return;
        }
        
        // Create a new Portainer instance with the loaded environment variables
        const portainer = new PortainerApiClient(
            process.env.PORTAINER_URL,
            process.env.PORTAINER_API_KEY
        );
        
        // Test 1: Connection
        console.log('1. Testing connection...');
        const connected = await portainer.testConnection();
        if (!connected) {
            console.error('❌ Failed to connect to Portainer');
            return;
        }
        console.log('✅ Connected to Portainer successfully\n');
        
        // Test 2: Get environments
        console.log('2. Getting environments...');
        const environments = await portainer.getEnvironments();
        console.log(`✅ Found ${environments.length} environments:`);
        environments.forEach(env => {
            console.log(`   - ${env.Name} (ID: ${env.Id})`);
        });
        console.log('');
        
        if (environments.length === 0) {
            console.error('❌ No environments found');
            return;
        }
        
        const testEnvironment = environments[0];
        console.log(`Using environment: ${testEnvironment.Name} (ID: ${testEnvironment.Id})\n`);
        
        // Test 3: Create a simple test stack
        console.log('3. Creating test stack...');
        const testStackName = `test-minecraft-${Date.now()}`;
        const testStackData = {
            Name: testStackName,
            ComposeFile: `version: '3.8'
services:
  minecraft:
    image: itzg/minecraft-server:latest
    container_name: ${testStackName}
    environment:
      EULA: "TRUE"
      TYPE: "PAPER"
      VERSION: "LATEST"
      MEMORY: "2G"
    ports:
      - "25566:25565"
    volumes:
      - minecraft-data:/data
    restart: unless-stopped

volumes:
  minecraft-data: {}
`,
            Env: [],
            FromAppTemplate: false
        };
        
        console.log('Stack data being sent:');
        console.log('Name:', testStackData.Name);
        console.log('Compose content preview:', testStackData.ComposeFile.substring(0, 200) + '...');
        
        const stackResult = await portainer.createStack(testStackData, testEnvironment.Id);
        console.log('✅ Stack created successfully!');
        console.log('Stack result:', JSON.stringify(stackResult, null, 2));
        
        // Test 4: Verify the stack was created
        console.log('\n4. Verifying stack creation...');
        const stackExists = await portainer.verifyStackCreation(testStackName, 10000);
        
        if (stackExists) {
            console.log('✅ Stack verification successful');
            
            // Get stack details
            const stackDetails = await portainer.getStackByName(testStackName);
            if (stackDetails) {
                console.log('📊 Stack details:');
                console.log(`   - ID: ${stackDetails.Id}`);
                console.log(`   - Name: ${stackDetails.Name}`);
                console.log(`   - Endpoint ID: ${stackDetails.EndpointId}`);
            }
        } else {
            console.log('⚠️ Stack verification failed - stack may not have been created properly');
        }
        
        // Test 5: List all stacks to see our created stack
        console.log('\n5. Listing all stacks...');
        const stacks = await portainer.getStacks();
        console.log(`Found ${stacks.length} stacks total:`);
        stacks.forEach(stack => {
            const isOurStack = stack.Name === testStackName ? '👈 OUR STACK' : '';
            console.log(`   - ${stack.Name} (ID: ${stack.Id}) ${isOurStack}`);
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

// Run the test
console.log('Starting Portainer test...');
testPortainerDeployment()
    .then(() => {
        console.log('\n🎉 Test completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Test failed with unhandled error:', error);
        process.exit(1);
    });

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testPortainerDeployment().catch(console.error);
}

export { testPortainerDeployment };
