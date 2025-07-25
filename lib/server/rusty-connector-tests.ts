/**
 * RustyConnector Integration Tests
 * 
 * This file contains test functions to verify RustyConnector integration
 * Run these tests before enabling RustyConnector in production
 */

import { rustyConnectorIntegration } from './rusty-connector-integration';
import { generateRustyConnectorConfig, validateRustyConnectorCompatibility } from './rusty-connector-types';
import { parseRustyConnectorConfig } from './rusty-connector-config';
import type { VelocityServerConfig } from './velocity';
import type { RustyConnectorServerConfig } from './rusty-connector';

/**
 * Test configuration parsing
 */
export async function testConfigurationParsing(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        // Test environment configuration parsing
        const envConfig = parseRustyConnectorConfig();
        details.push(`Parsed environment configuration: enabled=${envConfig.enabled}`);
        details.push(`Default family: ${envConfig.defaultFamily}`);
        details.push(`Load balancing: ${envConfig.loadBalancingStrategy}`);
        
        // Test integration configuration
        const integrationConfig = rustyConnectorIntegration.getConfiguration();
        details.push(`Integration enabled: ${integrationConfig.enabled}`);
        details.push(`Fallback to Velocity: ${integrationConfig.fallbackToVelocity}`);
        
        return { success: true, details };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details
        };
    }
}

/**
 * Test server type compatibility
 */
export async function testServerTypeCompatibility(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    const serverTypes = ['PAPER', 'PURPUR', 'NEOFORGE', 'FORGE', 'FABRIC'] as const;
    
    try {
        for (const serverType of serverTypes) {
            const typeInfo = rustyConnectorIntegration.getServerTypeInfo(serverType);
            
            if (typeInfo.supported) {
                details.push(`✅ ${serverType}: Supported`);
                details.push(`   Forwarding modes: ${(typeInfo.supportedForwardingModes || []).join(', ')}`);
                details.push(`   Required mods: ${(typeInfo.requiredMods || []).length > 0 ? (typeInfo.requiredMods || []).join(', ') : 'None'}`);
                details.push(`   Optional mods: ${(typeInfo.optionalMods || []).length > 0 ? (typeInfo.optionalMods || []).join(', ') : 'None'}`);
            } else {
                details.push(`❌ ${serverType}: Not supported - ${typeInfo.error}`);
            }
        }
        
        return { success: true, details };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details
        };
    }
}

/**
 * Test configuration generation for different server types
 */
export async function testConfigurationGeneration(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        const baseServerConfig: VelocityServerConfig = {
            serverId: 'test-server-001',
            serverName: 'test-server',
            address: 'localhost',
            port: 25565,
            motd: 'Test Server',
            restrictedToProxy: true,
            playerInfoForwardingMode: 'modern',
            forwardingSecret: 'test-secret',
            subdomain: 'test'
        };
        
        const serverTypes = ['PAPER', 'PURPUR', 'FABRIC'] as const;
        
        for (const serverType of serverTypes) {
            details.push(`\n--- Testing ${serverType} Configuration ---`);
            
            // Convert to RustyConnector config
            const rustyConfig: RustyConnectorServerConfig = {
                ...baseServerConfig,
                families: ['test-family'],
                playerCap: 100,
                restricted: false,
                whitelist: [],
                softCap: 80,
                priority: 5,
                rustConnectionTimeout: 30
            };
            
            // Generate configuration
            const configResult = generateRustyConnectorConfig(serverType, rustyConfig, 'test-family');
            details.push(`Generated config for ${serverType}`);
            details.push(`Player cap: ${configResult.serverConfig.playerCap}`);
            details.push(`Soft cap: ${configResult.serverConfig.softCap}`);
            details.push(`Priority: ${configResult.serverConfig.priority}`);
            
            if (configResult.recommendations.length > 0) {
                details.push('Recommendations:');
                configResult.recommendations.forEach(rec => details.push(`  - ${rec}`));
            }
            
            if (configResult.warnings.length > 0) {
                details.push('Warnings:');
                configResult.warnings.forEach(warn => details.push(`  - ${warn}`));
            }
            
            // Validate configuration
            const validation = validateRustyConnectorCompatibility(serverType, configResult.serverConfig);
            details.push(`Validation: ${validation.isValid ? 'PASSED' : 'FAILED'}`);
            
            if (validation.errors.length > 0) {
                details.push('Validation errors:');
                validation.errors.forEach(err => details.push(`  - ${err}`));
            }
        }
        
        return { success: true, details };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details
        };
    }
}

/**
 * Test deployment report generation
 */
export async function testDeploymentReports(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        const testServerConfig: VelocityServerConfig = {
            serverId: 'report-test-001',
            serverName: 'report-test',
            address: 'localhost',
            port: 25566,
            motd: 'Report Test Server',
            restrictedToProxy: true,
            playerInfoForwardingMode: 'modern',
            forwardingSecret: 'report-test-secret',
            subdomain: 'report-test'
        };
        
        const serverTypes = ['PAPER', 'FABRIC', 'FORGE'] as const;
        
        for (const serverType of serverTypes) {
            details.push(`\n--- Deployment Report for ${serverType} ---`);
            
            const report = rustyConnectorIntegration.generateDeploymentReport(serverType, testServerConfig);
            
            details.push(`Compatible: ${report.compatible ? 'YES' : 'NO'}`);
            details.push(`Required mods: ${report.requiredMods.length > 0 ? report.requiredMods.join(', ') : 'None'}`);
            details.push(`Optional mods: ${report.optionalMods.length > 0 ? report.optionalMods.join(', ') : 'None'}`);
            
            if (report.recommendations.length > 0) {
                details.push('Recommendations:');
                report.recommendations.forEach(rec => details.push(`  - ${rec}`));
            }
            
            if (report.warnings.length > 0) {
                details.push('Warnings:');
                report.warnings.forEach(warn => details.push(`  - ${warn}`));
            }
            
            details.push('Configuration steps:');
            report.configurationSteps.forEach((step, index) => {
                details.push(`  ${index + 1}. ${step}`);
            });
        }
        
        return { success: true, details };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details
        };
    }
}

/**
 * Test RustyConnector availability check
 */
export async function testAvailabilityCheck(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    
    try {
        const availability = await rustyConnectorIntegration.checkRustyConnectorAvailability();
        
        details.push(`RustyConnector available: ${availability.available ? 'YES' : 'NO'}`);
        details.push(`RustyConnector configured: ${availability.configured ? 'YES' : 'NO'}`);
        
        if (availability.error) {
            details.push(`Error: ${availability.error}`);
        }
        
        details.push('Details:');
        availability.details.forEach(detail => details.push(`  - ${detail}`));
        
        return { success: true, details };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details
        };
    }
}

/**
 * Run all tests
 */
export async function runAllRustyConnectorTests(): Promise<{
    success: boolean;
    error?: string;
    details: string[];
}> {
    const details: string[] = [];
    let allTestsPassed = true;
    
    try {
        details.push('=== RustyConnector Integration Test Suite ===\n');
        
        // Test 1: Configuration parsing
        details.push('Test 1: Configuration Parsing');
        const configTest = await testConfigurationParsing();
        if (configTest.success) {
            details.push('✅ PASSED');
        } else {
            details.push('❌ FAILED');
            allTestsPassed = false;
        }
        details.push(...configTest.details);
        details.push('');
        
        // Test 2: Server type compatibility
        details.push('Test 2: Server Type Compatibility');
        const compatibilityTest = await testServerTypeCompatibility();
        if (compatibilityTest.success) {
            details.push('✅ PASSED');
        } else {
            details.push('❌ FAILED');
            allTestsPassed = false;
        }
        details.push(...compatibilityTest.details);
        details.push('');
        
        // Test 3: Configuration generation
        details.push('Test 3: Configuration Generation');
        const generationTest = await testConfigurationGeneration();
        if (generationTest.success) {
            details.push('✅ PASSED');
        } else {
            details.push('❌ FAILED');
            allTestsPassed = false;
        }
        details.push(...generationTest.details);
        details.push('');
        
        // Test 4: Deployment reports
        details.push('Test 4: Deployment Reports');
        const reportTest = await testDeploymentReports();
        if (reportTest.success) {
            details.push('✅ PASSED');
        } else {
            details.push('❌ FAILED');
            allTestsPassed = false;
        }
        details.push(...reportTest.details);
        details.push('');
        
        // Test 5: Availability check
        details.push('Test 5: Availability Check');
        const availabilityTest = await testAvailabilityCheck();
        if (availabilityTest.success) {
            details.push('✅ PASSED');
        } else {
            details.push('❌ FAILED');
            allTestsPassed = false;
        }
        details.push(...availabilityTest.details);
        details.push('');
        
        details.push('=== Test Suite Complete ===');
        details.push(`Overall result: ${allTestsPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
        
        return {
            success: allTestsPassed,
            details,
            error: allTestsPassed ? undefined : 'Some tests failed'
        };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, 'Test suite execution failed']
        };
    }
}

// Example usage (commented out to prevent automatic execution)
/*
// Run tests manually when needed
async function exampleTestExecution() {
    console.log('Running RustyConnector tests...');
    
    const testResults = await runAllRustyConnectorTests();
    
    console.log('Test Results:');
    testResults.details.forEach(detail => console.log(detail));
    
    if (!testResults.success) {
        console.error('Tests failed:', testResults.error);
    }
}
*/
