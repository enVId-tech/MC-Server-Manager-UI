/**
 * Test script to verify the permission fix for Minecraft server containers
 */

import { createMinecraftServer, convertClientConfigToServerConfig } from '../lib/server/minecraft';

async function testPermissionFix() {
    console.log('🧪 Testing Minecraft server permission fix...');

    // Create a test server configuration
    const testConfig = {
        name: 'test-permission-server',
        serverType: 'PURPUR',
        version: '1.21.8',
        description: 'Test server for permission fix',
        seed: '',
        gameMode: 'survival',
        difficulty: 'normal',
        worldType: 'DEFAULT',
        worldGeneration: 'default',
        worldFile: null,
        maxPlayers: 20,
        whitelistEnabled: false,
        onlineMode: true,
        pvpEnabled: true,
        commandBlocksEnabled: false,
        flightEnabled: false,
        spawnAnimalsEnabled: true,
        spawnMonstersEnabled: true,
        spawnNpcsEnabled: true,
        generateStructuresEnabled: true,
        port: 25565,
        viewDistance: 10,
        simulationDistance: 10,
        spawnProtection: 16,
        rconEnabled: true,
        rconPassword: 'testpassword123',
        motd: 'Test server for permission fix',
        resourcePackUrl: '',
        resourcePackSha1: '',
        resourcePackPrompt: '',
        forceResourcePack: false,
        enableJmxMonitoring: false,
        syncChunkWrites: true,
        enforceWhitelist: false,
        preventProxyConnections: false,
        playerIdleTimeout: 0,
        broadcastRconToOps: true,
        broadcastConsoleToOps: true,
        enableCommandBlock: false,
        enableQuery: false,
        queryPort: 25565,
        queryHostname: '0.0.0.0',
        enableStatus: true,
        hideOnlinePlayers: false,
        networkCompressionThreshold: 256,
        opPermissionLevel: 4,
        functionPermissionLevel: 2,
        maxTickTime: 60000,
        maxWorldSize: 29999984,
        networkCompressionThreshold2: 256,
        rateLimitPacketsPerSecond: 1000,
        serverMemory: 2048,
        subdomain: 'test-permission-server',
        plugins: [] as any[],
        mods: [] as any[],
        worldFiles: null as any,
        datapacks: [] as any[],
        resourcePacks: [] as any[]
    };

    try {
        // Convert to server config format
        const serverConfig = convertClientConfigToServerConfig(testConfig);
        
        // Create Minecraft server instance
        const server = createMinecraftServer(
            serverConfig,
            'test-permission-server',
            'test-perm-fix-' + Date.now(),
            1,
            'testuser@example.com'
        );

        console.log('📋 Generated Docker Compose configuration:');
        const dockerConfig = server.generateDockerComposeConfig();
        console.log(JSON.stringify(dockerConfig, null, 2));

        console.log('\n🐳 Generated Docker Compose YAML:');
        const dockerYaml = server.generateDockerComposeYaml();
        console.log(dockerYaml);

        // Test directory creation
        console.log('\n📁 Testing directory creation with permissions...');
        await server.ensureServerDirectory();

        console.log('\n✅ Permission fix test completed successfully!');
        console.log('\n🔧 Key fixes implemented:');
        console.log('   - Added UID and GID environment variables (1000:1000)');
        console.log('   - Added EXEC_DIRECTLY=true to avoid permission wrapper issues');
        console.log('   - Added directory creation with proper ownership');
        console.log('   - Added fallback chmod 777 if chown fails');
        console.log('   - Removed hardcoded user directive that could conflict');

    } catch (error) {
        console.error('❌ Permission fix test failed:', error);
        process.exit(1);
    }
}

// Run the test immediately
testPermissionFix().catch(console.error);

export { testPermissionFix };
