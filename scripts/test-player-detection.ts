import portainer from '@/lib/server/portainer';
import dbConnect from '@/lib/db/dbConnect';
import Server from '@/lib/objects/Server';

/**
 * Test script to debug player count detection
 * This script will help identify why player counts aren't being detected correctly
 */

async function testPlayerCountDetection() {
    try {
        console.log('🔧 Starting player count detection test...');
        
        await dbConnect();
        
        // Get all servers from database
        const servers = await Server.find({}).limit(5); // Test first 5 servers
        
        if (servers.length === 0) {
            console.log('❌ No servers found in database');
            return;
        }
        
        console.log(`📊 Found ${servers.length} servers to test`);
        
        // Get Portainer environments
        const environments = await portainer.getEnvironments();
        if (environments.length === 0) {
            console.log('❌ No Portainer environments found');
            return;
        }
        
        const environmentId = environments[0].Id;
        console.log(`🔗 Using environment ID: ${environmentId}`);
        
        // Test each server
        for (const server of servers) {
            console.log(`\n🎮 Testing server: ${server.serverName} (${server.uniqueId})`);
            
            const containerIdentifier = `mc-${server.uniqueId}`;
            console.log(`🐳 Looking for container: ${containerIdentifier}`);
            
            // Check if container exists
            const container = await portainer.getContainerByIdentifier(containerIdentifier, environmentId);
            if (!container) {
                console.log(`❌ Container not found: ${containerIdentifier}`);
                continue;
            }
            
            console.log(`✅ Container found: ${container.Id} (${container.Status})`);
            
            // Get container logs for debugging
            console.log(`📝 Getting container logs...`);
            const logs = await portainer.getContainerLogs(container.Id, environmentId, 50);
            console.log(`📄 Log sample (last 200 chars): ...${logs.slice(-200)}`);
            
            // Test player count detection
            console.log(`👥 Testing player count detection...`);
            const playerInfo = await portainer.getMinecraftServerPlayerCount(container.Id, environmentId);
            
            console.log(`📊 Player count result:`, {
                playersOnline: playerInfo.playersOnline,
                maxPlayers: playerInfo.maxPlayers,
                playerList: playerInfo.playerList || 'not provided',
                error: playerInfo.error || 'none'
            });
            
            // Check if logs contain any player-related messages
            const joinMatches = logs.match(/(\w+) joined the game/g) || [];
            const leaveMatches = logs.match(/(\w+) left the game/g) || [];
            const chatMatches = logs.match(/<(\w+)>/g) || [];
            
            console.log(`📈 Log analysis:`, {
                joinMessages: joinMatches.length,
                leaveMessages: leaveMatches.length,
                chatMessages: chatMatches.length,
                recentJoins: joinMatches.slice(-3),
                recentChat: chatMatches.slice(-3)
            });
        }
        
        console.log('\n✅ Player count detection test completed');
        
    } catch (error) {
        console.error('❌ Error during player count test:', error);
    }
}

// Run the test
testPlayerCountDetection()
    .then(() => {
        console.log('🎉 Test completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Test failed:', error);
        process.exit(1);
    });
