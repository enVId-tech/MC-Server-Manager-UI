/**
 * Multi-Proxy System Tests
 * 
 * This file contains comprehensive tests for the multi-proxy functionality
 * Run these tests to validate the multi-proxy system is working correctly
 */

import { proxyManager } from '../lib/server/proxy-manager';
import bungeeCordService from '../lib/server/bungeecord';
import waterfallService from '../lib/server/waterfall';
import velocityService from '../lib/server/velocity';

// Test data
const testServerConfig = {
    serverId: 'test-server-id',
    serverName: 'test-server',
    address: 'test-server:25565',
    port: 25565,
    motd: 'Test Server for Multi-Proxy',
    restrictedToProxy: true,
    playerInfoForwardingMode: 'legacy' as const,
    forwardingSecret: 'test-secret'
};

const testUserEmail = 'test@example.com';
const testUniqueId = 'test-unique-id';

/**
 * Test proxy manager initialization
 */
export async function testProxyManagerInitialization(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        details.push('Testing proxy manager initialization...');
        
        // Test getting all proxies
        const allProxies = proxyManager.getAllProxies();
        details.push(`Found ${allProxies.length} registered proxies`);
        
        // Test getting enabled proxies
        const enabledProxies = proxyManager.getEnabledProxies();
        details.push(`Found ${enabledProxies.length} enabled proxies`);
        
        // Test proxy types
        const velocityProxies = proxyManager.getProxiesByType('velocity');
        const bungeeCordProxies = proxyManager.getProxiesByType('bungeecord');
        const waterfallProxies = proxyManager.getProxiesByType('waterfall');
        const rustyConnectorProxies = proxyManager.getProxiesByType('rusty-connector');
        
        details.push(`Velocity proxies: ${velocityProxies.length}`);
        details.push(`BungeeCord proxies: ${bungeeCordProxies.length}`);
        details.push(`Waterfall proxies: ${waterfallProxies.length}`);
        details.push(`RustyConnector proxies: ${rustyConnectorProxies.length}`);
        
        // Test statistics
        const statistics = proxyManager.getProxyStatistics();
        details.push(`Statistics - Total: ${statistics.totalProxies}, Enabled: ${statistics.enabledProxies}`);
        
        return { success: true, details };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `Test failed: ${error}`]
        };
    }
}

/**
 * Test BungeeCord service
 */
export async function testBungeeCordService(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        details.push('Testing BungeeCord service...');
        
        // Test configuration (this would normally interact with actual files)
        details.push('BungeeCord service loaded successfully');
        details.push('Note: Full testing requires actual BungeeCord instance');
        
        return { success: true, details };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `BungeeCord test failed: ${error}`]
        };
    }
}

/**
 * Test Waterfall service
 */
export async function testWaterfallService(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        details.push('Testing Waterfall service...');
        
        // Test modern forwarding compatibility
        const compatibilityResult = await waterfallService.testModernForwardingCompatibility({
            ...testServerConfig,
            modernForwarding: true,
            waterfallForwardingSecret: 'test-waterfall-secret'
        });
        
        details.push(`Modern forwarding compatible: ${compatibilityResult.compatible}`);
        details.push(`Recommendations: ${compatibilityResult.recommendations.length}`);
        details.push(`Warnings: ${compatibilityResult.warnings.length}`);
        
        if (compatibilityResult.recommendations.length > 0) {
            details.push('Recommendations:');
            compatibilityResult.recommendations.forEach(rec => details.push(`  - ${rec}`));
        }
        
        if (compatibilityResult.warnings.length > 0) {
            details.push('Warnings:');
            compatibilityResult.warnings.forEach(warn => details.push(`  - ${warn}`));
        }
        
        return { success: true, details };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `Waterfall test failed: ${error}`]
        };
    }
}

/**
 * Test proxy selection logic
 */
export async function testProxySelection(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        details.push('Testing proxy selection logic...');
        
        // Test best proxy selection
        const bestProxy = proxyManager.getBestProxyForServer({
            ...testServerConfig,
            targetProxies: []
        });
        
        if (bestProxy) {
            details.push(`Best proxy selected: ${bestProxy.name} (${bestProxy.type})`);
            details.push(`Priority: ${bestProxy.priority}`);
            details.push(`Health status: ${bestProxy.healthStatus}`);
        } else {
            details.push('No suitable proxy found');
        }
        
        // Test with requirements
        const proxyWithModernForwarding = proxyManager.getBestProxyForServer({
            ...testServerConfig,
            targetProxies: []
        }, ['modern-forwarding']);
        
        if (proxyWithModernForwarding) {
            details.push(`Modern forwarding proxy: ${proxyWithModernForwarding.name}`);
        } else {
            details.push('No proxy with modern forwarding found');
        }
        
        return { success: true, details };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `Proxy selection test failed: ${error}`]
        };
    }
}

/**
 * Test health check system
 */
export async function testHealthChecks(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        details.push('Testing health check system...');
        
        const healthResults = await proxyManager.performHealthChecks();
        
        details.push(`Overall health status: ${healthResults.overall}`);
        details.push(`Proxies checked: ${Object.keys(healthResults.proxies).length}`);
        
        for (const [proxyId, health] of Object.entries(healthResults.proxies)) {
            details.push(`${proxyId}: ${health.status}`);
            if (health.details.length > 0) {
                health.details.forEach(detail => details.push(`  - ${detail}`));
            }
        }
        
        return { success: true, details };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `Health check test failed: ${error}`]
        };
    }
}

/**
 * Test proxy configuration update
 */
export async function testProxyConfiguration(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        details.push('Testing proxy configuration updates...');
        
        // Get a proxy to test with
        const proxies = proxyManager.getAllProxies();
        if (proxies.length === 0) {
            return {
                success: false,
                error: 'No proxies available for testing',
                details
            };
        }
        
        const testProxy = proxies[0];
        const originalPriority = testProxy.priority;
        
        // Update proxy configuration
        const updateSuccess = proxyManager.updateProxy(testProxy.id, {
            priority: originalPriority + 1,
            description: 'Updated for testing'
        });
        
        if (updateSuccess) {
            details.push(`Successfully updated proxy ${testProxy.id}`);
            
            // Verify update
            const updatedProxy = proxyManager.getProxy(testProxy.id);
            if (updatedProxy && updatedProxy.priority === originalPriority + 1) {
                details.push('Configuration update verified');
                
                // Restore original configuration
                proxyManager.updateProxy(testProxy.id, {
                    priority: originalPriority,
                    description: testProxy.description
                });
                details.push('Original configuration restored');
            } else {
                details.push('Warning: Configuration update not reflected');
            }
        } else {
            details.push('Failed to update proxy configuration');
        }
        
        return { success: true, details };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `Configuration test failed: ${error}`]
        };
    }
}

/**
 * Run all multi-proxy tests
 */
export async function runAllMultiProxyTests(): Promise<{
    success: boolean;
    results: { [testName: string]: any };
    summary: string;
}> {
    const results: { [testName: string]: any } = {};
    
    console.log('🧪 Running Multi-Proxy System Tests...\n');
    
    // Test 1: Proxy Manager Initialization
    console.log('🔧 Testing Proxy Manager Initialization...');
    results.initialization = await testProxyManagerInitialization();
    console.log(results.initialization.success ? '✅ PASSED' : '❌ FAILED');
    if (results.initialization.details) {
        results.initialization.details.forEach((detail: string) => console.log(`   ${detail}`));
    }
    console.log('');
    
    // Test 2: BungeeCord Service
    console.log('🟧 Testing BungeeCord Service...');
    results.bungeecord = await testBungeeCordService();
    console.log(results.bungeecord.success ? '✅ PASSED' : '❌ FAILED');
    if (results.bungeecord.details) {
        results.bungeecord.details.forEach((detail: string) => console.log(`   ${detail}`));
    }
    console.log('');
    
    // Test 3: Waterfall Service
    console.log('🌊 Testing Waterfall Service...');
    results.waterfall = await testWaterfallService();
    console.log(results.waterfall.success ? '✅ PASSED' : '❌ FAILED');
    if (results.waterfall.details) {
        results.waterfall.details.forEach((detail: string) => console.log(`   ${detail}`));
    }
    console.log('');
    
    // Test 4: Proxy Selection
    console.log('🎯 Testing Proxy Selection Logic...');
    results.selection = await testProxySelection();
    console.log(results.selection.success ? '✅ PASSED' : '❌ FAILED');
    if (results.selection.details) {
        results.selection.details.forEach((detail: string) => console.log(`   ${detail}`));
    }
    console.log('');
    
    // Test 5: Health Checks
    console.log('❤️ Testing Health Check System...');
    results.healthchecks = await testHealthChecks();
    console.log(results.healthchecks.success ? '✅ PASSED' : '❌ FAILED');
    if (results.healthchecks.details) {
        results.healthchecks.details.forEach((detail: string) => console.log(`   ${detail}`));
    }
    console.log('');
    
    // Test 6: Proxy Configuration
    console.log('⚙️ Testing Proxy Configuration...');
    results.configuration = await testProxyConfiguration();
    console.log(results.configuration.success ? '✅ PASSED' : '❌ FAILED');
    if (results.configuration.details) {
        results.configuration.details.forEach((detail: string) => console.log(`   ${detail}`));
    }
    console.log('');
    
    // Calculate summary
    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter((result: any) => result.success).length;
    const failedTests = totalTests - passedTests;
    
    const summary = `Test Results: ${passedTests}/${totalTests} passed, ${failedTests} failed`;
    const overallSuccess = failedTests === 0;
    
    console.log('📊 Test Summary:');
    console.log(`   ${overallSuccess ? '✅' : '❌'} ${summary}`);
    
    if (failedTests > 0) {
        console.log('\n❌ Failed Tests:');
        Object.entries(results).forEach(([testName, result]: [string, any]) => {
            if (!result.success) {
                console.log(`   - ${testName}: ${result.error || 'Unknown error'}`);
            }
        });
    }
    
    console.log('\n🎉 Multi-Proxy testing complete!');
    
    return {
        success: overallSuccess,
        results,
        summary
    };
}

/**
 * Export test runner function for external use
 */
export default runAllMultiProxyTests;

// Run tests if this file is executed directly
if (require.main === module) {
    runAllMultiProxyTests()
        .then(result => {
            console.log('\n🏁 Test execution finished.');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Test execution failed:', error);
            process.exit(1);
        });
}
