import { readFileSync } from 'fs';
import path from 'path';

// Import the velocity service for testing
// Note: This would normally be imported from the actual service
interface VelocityServerConfig {
    serverId: string;
    serverName: string;
    address: string;
    port: number;
    motd?: string;
    restrictedToProxy?: boolean;
    playerInfoForwardingMode?: 'none' | 'legacy' | 'modern';
    forwardingSecret?: string;
}

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

class VelocityConfigTester {
    /**
     * Parse TOML value (improved implementation)
     */
    private parseTomlValue(value: string): string | number | boolean | string[] {
        const trimmed = value.trim();
        
        // Handle boolean values
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        
        // Handle quoted strings
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return trimmed.slice(1, -1);
        }
        
        // Handle single quoted strings
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
            return trimmed.slice(1, -1);
        }
        
        // Handle arrays
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            const arrayContent = trimmed.slice(1, -1).trim();
            if (!arrayContent) return [];
            
            return arrayContent
                .split(',')
                .map(item => item.trim())
                .map(item => {
                    // Remove quotes from array elements
                    if ((item.startsWith('"') && item.endsWith('"')) || 
                        (item.startsWith("'") && item.endsWith("'"))) {
                        return item.slice(1, -1);
                    }
                    return item;
                })
                .filter(item => item.length > 0);
        }
        
        // Handle numbers
        if (!isNaN(Number(trimmed)) && trimmed !== '') {
            return Number(trimmed);
        }
        
        // Return as string if nothing else matches
        return trimmed;
    }

    /**
     * Parse a server entry in the [servers] section
     */
    private parseServerEntry(config: VelocityConfig, key: string, value: string | number | boolean | string[]): void {
        if (key === 'try') {
            // Handle the try array
            if (Array.isArray(value)) {
                config.try = value;
            }
            return;
        }
        
        // Check if this is a server property (only for known property suffixes)
        const knownProperties = ['restricted', 'player-info-forwarding-mode', 'forwarding-secret'];
        
        for (const property of knownProperties) {
            if (key.endsWith('-' + property)) {
                // This is a server property
                const serverName = key.substring(0, key.length - property.length - 1);
                
                // Ensure server exists
                if (!config.servers[serverName]) {
                    config.servers[serverName] = { address: '' };
                }
                
                // Set the property
                switch (property) {
                    case 'restricted':
                        config.servers[serverName].restricted = value as boolean;
                        break;
                    case 'player-info-forwarding-mode':
                        config.servers[serverName]['player-info-forwarding-mode'] = value as 'none' | 'legacy' | 'modern';
                        break;
                    case 'forwarding-secret':
                        config.servers[serverName]['forwarding-secret'] = value as string;
                        break;
                }
                return;
            }
        }
        
        // This is a server address entry (including server names with hyphens)
        if (!config.servers[key]) {
            config.servers[key] = { address: '' };
        }
        config.servers[key].address = value as string;
    }

    /**
     * Parse a root-level configuration entry
     */
    private parseRootConfigEntry(config: VelocityConfig, key: string, value: string | number | boolean | string[]): void {
        switch (key) {
            case 'config-version':
                config['config-version'] = value as string;
                break;
            case 'bind':
                config.bind = value as string;
                break;
            case 'motd':
                config.motd = value as string;
                break;
            case 'show-max-players':
                config['show-max-players'] = value as number;
                break;
            case 'online-mode':
                config['online-mode'] = value as boolean;
                break;
            case 'force-key-authentication':
                config['force-key-authentication'] = value as boolean;
                break;
            case 'prevent-client-proxy-connections':
                config['prevent-client-proxy-connections'] = value as boolean;
                break;
            case 'player-info-forwarding-mode':
                config['player-info-forwarding-mode'] = value as 'none' | 'legacy' | 'modern';
                break;
            case 'forwarding-secret':
                config['forwarding-secret'] = value as string;
                break;
            case 'try':
                if (Array.isArray(value)) {
                    config.try = value;
                }
                break;
        }
    }

    /**
     * Get default Velocity configuration
     */
    private getDefaultVelocityConfig(): VelocityConfig {
        return {
            'config-version': '2.0',
            bind: '0.0.0.0:25577',
            motd: 'A Velocity Server',
            'show-max-players': 500,
            'online-mode': true,
            'force-key-authentication': true,
            'prevent-client-proxy-connections': false,
            'player-info-forwarding-mode': 'modern',
            'forwarding-secret': process.env.VELOCITY_FORWARDING_SECRET || '',
            servers: {},
            'try': [],
            'forced-hosts': {}
        };
    }

    /**
     * Parse Velocity TOML configuration (improved implementation)
     */
    parseVelocityConfig(content: string): VelocityConfig {
        // Start with default configuration
        const config = this.getDefaultVelocityConfig();
        
        // Parse the content line by line
        const lines = content.split('\n');
        let currentSection = '';
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            
            // Handle section headers
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                currentSection = trimmed.slice(1, -1);
                continue;
            }
            
            // Handle key-value pairs
            if (trimmed.includes('=')) {
                const equalIndex = trimmed.indexOf('=');
                const key = trimmed.substring(0, equalIndex).trim();
                const value = trimmed.substring(equalIndex + 1).trim();
                const cleanValue = this.parseTomlValue(value);
                
                if (currentSection === 'servers') {
                    this.parseServerEntry(config, key, cleanValue);
                } else if (currentSection === 'forced-hosts') {
                    // Handle forced hosts
                    if (Array.isArray(cleanValue)) {
                        config['forced-hosts'][key.replace(/"/g, '')] = cleanValue;
                    }
                } else {
                    // Handle root level properties
                    this.parseRootConfigEntry(config, key, cleanValue);
                }
            }
        }
        
        return config;
    }

    /**
     * Test the TOML parser with sample content
     */
    testParser() {
        const sampleToml = `# Velocity Configuration
# Generated by MinecraftServerCreator

config-version = "2.7"
bind = "0.0.0.0:25565"
motd = "<b><i><color:#001aff><color:#4ffffc>Erick's Velocity Server Network</color></color></i></b>"
show-max-players = 69
online-mode = true
force-key-authentication = true
prevent-client-proxy-connections = false
player-info-forwarding-mode = "modern"
forwarding-secret = "kU7mFTOFrWGv"

[servers]
mclobby = "192.168.1.100:25565"
erick-survival = "192.168.1.101:25565"
creative-sandbox = "192.168.1.102:25565"
gun-city = "192.168.1.103:25565"
fe2-server = "192.168.1.104:25565"
bedwars = "192.168.1.105:25565"
jaden-server = "192.168.1.106:25565"
brandon-server = "192.168.1.107:25565"
try = ""
main1 = "mc-cf1e2b01-fae5-4791-8856-b99ed624be75:25565"
main1-restricted = true
main1-player-info-forwarding-mode = "legacy"
main1-forwarding-secret = "kU7mFTOFrWGv"

try = ["main1"]`;

        console.log('Testing TOML parser...');
        console.log('==================');
        
        const parsed = this.parseVelocityConfig(sampleToml);
        
        console.log('Parsed configuration:');
        console.log('Config version:', parsed['config-version']);
        console.log('MOTD:', parsed.motd);
        console.log('Show max players:', parsed['show-max-players']);
        console.log('');
        
        console.log('Servers:');
        Object.entries(parsed.servers).forEach(([name, config]) => {
            console.log(`  ${name}:`);
            console.log(`    address: "${config.address}"`);
            if (config.restricted) console.log(`    restricted: ${config.restricted}`);
            if (config['player-info-forwarding-mode']) console.log(`    forwarding-mode: ${config['player-info-forwarding-mode']}`);
            if (config['forwarding-secret']) console.log(`    forwarding-secret: ${config['forwarding-secret']}`);
            console.log('');
        });
        
        console.log('Try list:', parsed.try);
        
        // Test adding a new server
        console.log('\n--- Testing server addition ---');
        parsed.servers['new-test-server'] = {
            address: 'mc-newtestid:25565',
            restricted: false,
            'player-info-forwarding-mode': 'modern'
        };
        
        if (!parsed.try.includes('new-test-server')) {
            parsed.try.push('new-test-server');
        }
        
        console.log('After adding new server:');
        console.log('Servers:', Object.keys(parsed.servers));
        console.log('Try list:', parsed.try);
    }
}

// Run the test
const tester = new VelocityConfigTester();
tester.testParser();
