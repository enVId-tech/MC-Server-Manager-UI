/**
 * Test script for proxy synchronization
 * 
 * This script tests the automatic proxy management system:
 * - Loading proxies from YAML configuration
 * - Creating Portainer stacks for defined proxies
 * - Removing orphaned proxies not in configuration
 */

import proxyManager from '@/lib/server/proxy-manager';
import { getDefinedProxies } from '@/lib/config/proxies';

async function testProxySync() {
    console.log('=== Testing Proxy Synchronization ===\n');
    
    // 1. Load proxies from YAML
    console.log('1. Loading proxies from proxies.yaml...');
    const proxies = getDefinedProxies();
    console.log(`   Found ${proxies.length} proxies:`);
    proxies.forEach(p => {
        console.log(`   - ${p.name} (${p.type}) on port ${p.port}`);
    });
    console.log();
    
    // 2. Get environment ID (default from env or 1)
    const environmentId = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1;
    console.log(`2. Using Portainer environment ID: ${environmentId}\n`);
    
    // 3. Ensure proxies exist
    console.log('3. Ensuring all proxies exist...');
    const details = await proxyManager.ensureProxies(environmentId);
    details.forEach(detail => console.log(`   ${detail}`));
    console.log();
    
    // 4. Show registered proxies
    console.log('4. Currently registered proxies:');
    const registered = proxyManager.getAllProxies();
    registered.forEach(p => {
        console.log(`   - ${p.name} (${p.type}) - ${p.healthStatus}`);
    });
    console.log();
    
    console.log('=== Test Complete ===');
}

testProxySync().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
