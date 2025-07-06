import portainer from './lib/server/portainer.js';

async function testPortainerContainers() {
    try {
        console.log('🔍 Testing Portainer connection...');
        
        // Test getting environments
        const environments = await portainer.getEnvironments();
        console.log('✅ Environments:', environments.map(e => `${e.Id}: ${e.Name}`));
        
        // Test getting containers
        const envId = environments[0]?.Id;
        if (envId) {
            console.log(`🔍 Getting containers for environment ${envId}...`);
            const containers = await portainer.getContainers(envId, true);
            console.log('📋 Available containers:');
            containers.forEach(c => {
                console.log(`  - ${c.Id.substring(0, 12)}... (${c.Names?.[0]?.replace(/^\//, '') || 'unnamed'}) - State: ${c.State}`);
            });
            
            // Test searching for a specific container
            const testContainer = await portainer.getContainerByIdentifier('main1');
            console.log('🔍 Test search for "main1":', testContainer ? `Found: ${testContainer.Names?.[0]}` : 'Not found');
            
            const testContainer2 = await portainer.getContainerByIdentifier('68699764c0a686ac25ff2829');
            console.log('🔍 Test search for "68699764c0a686ac25ff2829":', testContainer2 ? `Found: ${testContainer2.Names?.[0]}` : 'Not found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testPortainerContainers();
