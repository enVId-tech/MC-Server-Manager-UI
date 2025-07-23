import { readFileSync } from 'fs';

// Test the removeServerFromVelocityConfig functionality
interface VelocityBackendServer {
    address: string;
    restricted?: boolean;
    'player-info-forwarding-mode'?: 'none' | 'legacy' | 'modern';
    'forwarding-secret'?: string;
}

interface VelocityConfig {
    'config-version': string;
    bind: string;
    motd: string;
    'show-max-players': number;
    'online-mode': boolean;
    'force-key-authentication': boolean;
    'prevent-client-proxy-connections': boolean;
    'player-info-forwarding-mode': 'none' | 'legacy' | 'modern';
    'forwarding-secret': string;
    servers: Record<string, VelocityBackendServer>;
    'try': string[];
    'forced-hosts': Record<string, string[]>;
}

class VelocityRemovalTester {
    testRemoveServer() {
        console.log('Testing Velocity server removal...');
        console.log('=====================================');
        
        // Simulate the current Velocity configuration
        const velocityConfig: VelocityConfig = {
            'config-version': '2.7',
            bind: '0.0.0.0:25565',
            motd: "Erick's Velocity Server Network",
            'show-max-players': 69,
            'online-mode': true,
            'force-key-authentication': true,
            'prevent-client-proxy-connections': false,
            'player-info-forwarding-mode': 'modern',
            'forwarding-secret': 'kU7mFTOFrWGv',
            servers: {
                'mclobby': { address: '192.168.1.100:25565' },
                'erick-survival': { address: '192.168.1.101:25565' },
                'creative-sandbox': { address: '192.168.1.102:25565' },
                'gun-city': { address: '192.168.1.103:25565' },
                'fe2-server': { address: '192.168.1.104:25565' },
                'bedwars': { address: '192.168.1.105:25565' },
                'jaden-server': { address: '192.168.1.106:25565' },
                'brandon-server': { address: '192.168.1.107:25565' },
                'main1': { 
                    address: 'mc-fafd9f51-9f2b-4b6e-a64d-98a97e7a31f4:25565',
                    restricted: true,
                    'player-info-forwarding-mode': 'legacy',
                    'forwarding-secret': 'kU7mFTOFrWGv'
                }
            },
            'try': ['main1', 'mclobby', 'erick-survival'],
            'forced-hosts': {
                'play.example.com': ['main1', 'mclobby'],
                'survival.example.com': ['erick-survival']
            }
        };
        
        console.log('BEFORE removal:');
        console.log('Servers:', Object.keys(velocityConfig.servers));
        console.log('Try list:', velocityConfig.try);
        console.log('Forced hosts:', velocityConfig['forced-hosts']);
        console.log('');
        
        // Test removing a server by name
        console.log('--- Removing "erick-survival" ---');
        this.removeServerFromConfig(velocityConfig, 'erick-survival');
        
        console.log('AFTER removing erick-survival:');
        console.log('Servers:', Object.keys(velocityConfig.servers));
        console.log('Try list:', velocityConfig.try);
        console.log('Forced hosts:', velocityConfig['forced-hosts']);
        console.log('');
        
        // Test removing a server by serverId (UUID)
        console.log('--- Removing by serverId "fafd9f51-9f2b-4b6e-a64d-98a97e7a31f4" ---');
        this.removeServerFromConfigByServerId(velocityConfig, 'fafd9f51-9f2b-4b6e-a64d-98a97e7a31f4');
        
        console.log('AFTER removing by serverId:');
        console.log('Servers:', Object.keys(velocityConfig.servers));
        console.log('Try list:', velocityConfig.try);
        console.log('Forced hosts:', velocityConfig['forced-hosts']);
        console.log('');
        
        console.log('✅ Velocity server removal test completed!');
    }
    
    removeServerFromConfig(config: VelocityConfig, serverName: string) {
        // Remove from servers
        if (config.servers[serverName]) {
            delete config.servers[serverName];
            console.log(`Removed server: ${serverName}`);
        }
        
        // Remove from try list
        const tryIndex = config.try.indexOf(serverName);
        if (tryIndex > -1) {
            config.try.splice(tryIndex, 1);
            console.log(`Removed from try list: ${serverName}`);
        }
        
        // Remove from forced hosts
        for (const [host, servers] of Object.entries(config['forced-hosts'])) {
            const serverIndex = servers.indexOf(serverName);
            if (serverIndex > -1) {
                servers.splice(serverIndex, 1);
                console.log(`Removed from forced host ${host}: ${serverName}`);
                
                // Remove empty forced host entries
                if (servers.length === 0) {
                    delete config['forced-hosts'][host];
                    console.log(`Removed empty forced host: ${host}`);
                }
            }
        }
    }
    
    removeServerFromConfigByServerId(config: VelocityConfig, serverId: string) {
        let removedServerName = '';
        
        // Find and remove server by serverId in address
        for (const [name, serverConfig] of Object.entries(config.servers)) {
            if (serverConfig.address.includes(serverId)) {
                delete config.servers[name];
                removedServerName = name;
                console.log(`Found and removed server by serverId: ${name}`);
                break;
            }
        }
        
        if (removedServerName) {
            // Remove from try list
            const tryIndex = config.try.indexOf(removedServerName);
            if (tryIndex > -1) {
                config.try.splice(tryIndex, 1);
                console.log(`Removed from try list: ${removedServerName}`);
            }
            
            // Remove from forced hosts
            for (const [host, servers] of Object.entries(config['forced-hosts'])) {
                const serverIndex = servers.indexOf(removedServerName);
                if (serverIndex > -1) {
                    servers.splice(serverIndex, 1);
                    console.log(`Removed from forced host ${host}: ${removedServerName}`);
                    
                    // Remove empty forced host entries
                    if (servers.length === 0) {
                        delete config['forced-hosts'][host];
                        console.log(`Removed empty forced host: ${host}`);
                    }
                }
            }
        }
    }
}

// Run the test
const tester = new VelocityRemovalTester();
tester.testRemoveServer();
