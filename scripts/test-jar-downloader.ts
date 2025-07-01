/**
 * Test script for MinecraftServerJarService
 * Run with: npx tsx scripts/test-jar-downloader.ts
 */

import { MinecraftServerJarService } from '../lib/server/serverJarDownloader.js';

async function testJarDownloader() {
    console.log('🧪 Testing Minecraft Server JAR Downloader...\n');
    
    const testCases = [
        { serverType: 'paper', version: 'latest' },
        { serverType: 'purpur', version: 'latest' },
        { serverType: 'vanilla', version: 'latest' },
        { serverType: 'fabric', version: '1.20.1' },
        { serverType: 'spigot', version: 'latest' }
    ];
    
    for (const testCase of testCases) {
        try {
            console.log(`📦 Testing ${testCase.serverType} ${testCase.version}...`);
            
            const jarInfo = await MinecraftServerJarService.getServerJarInfo(
                testCase.serverType,
                testCase.version
            );
            
            console.log(`✅ ${testCase.serverType}: ${jarInfo.downloadUrl}`);
            console.log(`   File: ${jarInfo.fileName}`);
            console.log('');
            
        } catch (error) {
            console.error(`❌ ${testCase.serverType}: ${error instanceof Error ? error.message : String(error)}`);
            console.log('');
        }
    }
    
    console.log('🧪 JAR downloader test completed!');
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testJarDownloader().catch(console.error);
}

export { testJarDownloader };
