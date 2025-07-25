import { RustyConnectorServerConfig } from './rusty-connector';

/**
 * Server type specific configurations for RustyConnector integration
 */

export interface ServerTypeConfig {
    type: string;
    requiresProxy: boolean;
    supportedForwardingModes: ('none' | 'legacy' | 'modern')[];
    defaultProperties: Record<string, string | number | boolean>;
    requiredMods?: string[];
    optionalMods?: string[];
    configurationFiles: string[];
    specialInstructions?: string[];
}

export const RUSTY_CONNECTOR_SERVER_TYPES: Record<string, ServerTypeConfig> = {
    PAPER: {
        type: 'PAPER',
        requiresProxy: true,
        supportedForwardingModes: ['legacy', 'modern'],
        defaultProperties: {
            'online-mode': false,
            'prevent-proxy-connections': false,
            'velocity-support': true,
            'bungeecord': false, // Disabled when velocity-support is enabled
            'enforce-secure-profile': false
        },
        configurationFiles: [
            'server.properties',
            'config/paper-global.yml',
            'config/paper-world-defaults.yml'
        ],
        specialInstructions: [
            'Paper has native Velocity support through velocity-support property',
            'Modern forwarding is recommended for Paper 1.13+',
            'Legacy forwarding available for older versions or compatibility'
        ]
    },
    
    PURPUR: {
        type: 'PURPUR',
        requiresProxy: true,
        supportedForwardingModes: ['legacy', 'modern'],
        defaultProperties: {
            'online-mode': false,
            'prevent-proxy-connections': false,
            'velocity-support': true,
            'bungeecord': false,
            'enforce-secure-profile': false
        },
        configurationFiles: [
            'server.properties',
            'config/paper-global.yml',
            'config/paper-world-defaults.yml',
            'config/purpur.yml'
        ],
        specialInstructions: [
            'Purpur inherits Paper\'s Velocity support',
            'Additional Purpur-specific configurations available',
            'Fully compatible with Paper proxy configurations'
        ]
    },
    
    NEOFORGE: {
        type: 'NEOFORGE',
        requiresProxy: true,
        supportedForwardingModes: ['legacy'],
        defaultProperties: {
            'online-mode': false,
            'prevent-proxy-connections': false,
            'bungeecord': true // NeoForge typically uses legacy forwarding
        },
        requiredMods: ['NeoForgeProxy', 'BungeeForward'],
        optionalMods: ['VelocityForward'],
        configurationFiles: [
            'server.properties',
            'config/neoforge-server.toml',
            'config/bungeecord.cfg'
        ],
        specialInstructions: [
            'NeoForge requires proxy support mods for proper forwarding',
            'BungeeForward mod recommended for BungeeCord/Velocity compatibility',
            'Ensure proxy mods are installed on both client and server'
        ]
    },
    
    FORGE: {
        type: 'FORGE',
        requiresProxy: true,
        supportedForwardingModes: ['legacy'],
        defaultProperties: {
            'online-mode': false,
            'prevent-proxy-connections': false,
            'bungeecord': true
        },
        requiredMods: ['ForgeProxy', 'BungeeForward'],
        optionalMods: ['VelocityForward'],
        configurationFiles: [
            'server.properties',
            'config/forge.cfg',
            'config/bungeecord.cfg'
        ],
        specialInstructions: [
            'Forge requires proxy support mods for IP forwarding',
            'BungeeForward mod provides compatibility with BungeeCord/Velocity',
            'Modern forwarding not typically supported without additional mods'
        ]
    },
    
    FABRIC: {
        type: 'FABRIC',
        requiresProxy: true,
        supportedForwardingModes: ['legacy', 'modern'],
        defaultProperties: {
            'online-mode': false,
            'prevent-proxy-connections': false
        },
        requiredMods: ['FabricProxy-Lite'],
        optionalMods: ['VelocityForward', 'CrossStitch'],
        configurationFiles: [
            'server.properties',
            'config/fabricproxy-lite.toml',
            'config/velocity-forward.json'
        ],
        specialInstructions: [
            'FabricProxy-Lite is the recommended proxy support mod for Fabric',
            'Modern forwarding available with VelocityForward mod',
            'CrossStitch can help with mod compatibility across proxy'
        ]
    }
};

/**
 * Generate RustyConnector configuration for a specific server type
 */
export function generateRustyConnectorConfig(
    serverType: keyof typeof RUSTY_CONNECTOR_SERVER_TYPES,
    serverConfig: RustyConnectorServerConfig,
    familyName: string = 'default'
): {
    serverConfig: RustyConnectorServerConfig;
    typeConfig: ServerTypeConfig;
    recommendations: string[];
    warnings: string[];
} {
    const typeConfig = RUSTY_CONNECTOR_SERVER_TYPES[serverType];
    const recommendations: string[] = [];
    const warnings: string[] = [];
    
    if (!typeConfig) {
        warnings.push(`Unknown server type: ${serverType}`);
        return {
            serverConfig,
            typeConfig: RUSTY_CONNECTOR_SERVER_TYPES.PAPER, // Fallback
            recommendations,
            warnings
        };
    }
    
    // Validate forwarding mode
    if (serverConfig.playerInfoForwardingMode && 
        !typeConfig.supportedForwardingModes.includes(serverConfig.playerInfoForwardingMode)) {
        warnings.push(
            `Forwarding mode '${serverConfig.playerInfoForwardingMode}' not supported by ${serverType}. ` +
            `Supported modes: ${typeConfig.supportedForwardingModes.join(', ')}`
        );
        // Use the first supported mode as fallback
        serverConfig.playerInfoForwardingMode = typeConfig.supportedForwardingModes[0];
        recommendations.push(`Switched to ${serverConfig.playerInfoForwardingMode} forwarding mode`);
    }
    
    // Set default family
    if (!serverConfig.families || serverConfig.families.length === 0) {
        serverConfig.families = [familyName];
    }
    
    // Add type-specific recommendations
    if (typeConfig.requiredMods && typeConfig.requiredMods.length > 0) {
        recommendations.push(
            `Required mods for ${serverType}: ${typeConfig.requiredMods.join(', ')}`
        );
    }
    
    if (typeConfig.optionalMods && typeConfig.optionalMods.length > 0) {
        recommendations.push(
            `Optional mods for enhanced functionality: ${typeConfig.optionalMods.join(', ')}`
        );
    }
    
    // Add special instructions
    if (typeConfig.specialInstructions) {
        recommendations.push(...typeConfig.specialInstructions);
    }
    
    // Set reasonable defaults based on server type
    if (!serverConfig.playerCap) {
        serverConfig.playerCap = getDefaultPlayerCap(serverType);
    }
    
    if (!serverConfig.softCap) {
        serverConfig.softCap = Math.floor(serverConfig.playerCap * 0.8);
    }
    
    if (!serverConfig.priority) {
        serverConfig.priority = getDefaultPriority(serverType);
    }
    
    return {
        serverConfig,
        typeConfig,
        recommendations,
        warnings
    };
}

/**
 * Get default player capacity based on server type
 */
function getDefaultPlayerCap(serverType: string): number {
    switch (serverType) {
        case 'PAPER':
        case 'PURPUR':
            return 100; // Paper-based servers are optimized for higher player counts
        case 'FABRIC':
            return 50; // Fabric can handle moderate player counts well
        case 'FORGE':
        case 'NEOFORGE':
            return 30; // Forge tends to be more resource-intensive
        default:
            return 20; // Conservative default
    }
}

/**
 * Get default priority based on server type
 */
function getDefaultPriority(serverType: string): number {
    switch (serverType) {
        case 'PAPER':
        case 'PURPUR':
            return 10; // High priority for optimized servers
        case 'FABRIC':
            return 8; // Good priority for lightweight modded
        case 'NEOFORGE':
            return 6; // Medium priority for modern Forge
        case 'FORGE':
            return 5; // Lower priority for resource-intensive servers
        default:
            return 5;
    }
}

/**
 * Generate mod installation instructions for a server type
 */
export function generateModInstallationInstructions(
    serverType: keyof typeof RUSTY_CONNECTOR_SERVER_TYPES
): {
    requiredMods: Array<{ name: string; downloadUrl: string; instructions: string }>;
    optionalMods: Array<{ name: string; downloadUrl: string; instructions: string }>;
} {
    const typeConfig = RUSTY_CONNECTOR_SERVER_TYPES[serverType];
    
    const modDatabase = {
        'FabricProxy-Lite': {
            downloadUrl: 'https://modrinth.com/mod/fabricproxy-lite',
            instructions: 'Download and place in server mods folder. Configure in config/fabricproxy-lite.toml'
        },
        'VelocityForward': {
            downloadUrl: 'https://github.com/PaperMC/VelocityForward',
            instructions: 'Provides modern IP forwarding for Fabric servers'
        },
        'CrossStitch': {
            downloadUrl: 'https://modrinth.com/mod/crossstitch',
            instructions: 'Helps with mod compatibility across proxy connections'
        },
        'BungeeForward': {
            downloadUrl: 'https://www.spigotmc.org/resources/bungeeforward.90535/',
            instructions: 'Enables IP forwarding for Forge servers through BungeeCord/Velocity'
        },
        'ForgeProxy': {
            downloadUrl: 'https://github.com/MinecraftForge/ForgeProxy',
            instructions: 'Official Forge proxy support mod'
        },
        'NeoForgeProxy': {
            downloadUrl: 'https://github.com/neoforged/NeoForgeProxy',
            instructions: 'Official NeoForge proxy support mod'
        }
    };
    
    const requiredMods = (typeConfig.requiredMods || []).map(modName => ({
        name: modName,
        downloadUrl: modDatabase[modName as keyof typeof modDatabase]?.downloadUrl || '#',
        instructions: modDatabase[modName as keyof typeof modDatabase]?.instructions || 'Install in mods folder'
    }));
    
    const optionalMods = (typeConfig.optionalMods || []).map(modName => ({
        name: modName,
        downloadUrl: modDatabase[modName as keyof typeof modDatabase]?.downloadUrl || '#',
        instructions: modDatabase[modName as keyof typeof modDatabase]?.instructions || 'Install in mods folder'
    }));
    
    return { requiredMods, optionalMods };
}

/**
 * Validate server configuration for RustyConnector compatibility
 */
export function validateRustyConnectorCompatibility(
    serverType: keyof typeof RUSTY_CONNECTOR_SERVER_TYPES,
    serverConfig: RustyConnectorServerConfig
): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    const typeConfig = RUSTY_CONNECTOR_SERVER_TYPES[serverType];
    
    if (!typeConfig) {
        errors.push(`Unsupported server type: ${serverType}`);
        return { isValid: false, errors, warnings, suggestions };
    }
    
    // Check forwarding mode compatibility
    if (serverConfig.playerInfoForwardingMode && 
        !typeConfig.supportedForwardingModes.includes(serverConfig.playerInfoForwardingMode)) {
        errors.push(
            `Forwarding mode '${serverConfig.playerInfoForwardingMode}' is not supported by ${serverType}`
        );
    }
    
    // Check for required configurations
    if (typeConfig.requiresProxy && (!serverConfig.address || !serverConfig.port)) {
        errors.push('Server address and port are required for proxy setup');
    }
    
    // Validate player capacity settings
    if (serverConfig.playerCap && serverConfig.playerCap < 1) {
        errors.push('Player capacity must be at least 1');
    }
    
    if (serverConfig.softCap && serverConfig.playerCap && serverConfig.softCap > serverConfig.playerCap) {
        warnings.push('Soft cap should not exceed player capacity');
        suggestions.push(`Consider setting soft cap to ${Math.floor(serverConfig.playerCap * 0.8)}`);
    }
    
    // Check family configuration
    if (!serverConfig.families || serverConfig.families.length === 0) {
        warnings.push('No server families specified, will use default family');
        suggestions.push('Consider organizing servers into logical families for better load balancing');
    }
    
    // Type-specific validations
    switch (serverType) {
        case 'FORGE':
        case 'NEOFORGE':
            if (serverConfig.playerInfoForwardingMode === 'modern') {
                warnings.push(`${serverType} typically uses legacy forwarding mode`);
                suggestions.push('Consider switching to legacy forwarding for better compatibility');
            }
            break;
            
        case 'PAPER':
        case 'PURPUR':
            if (serverConfig.playerInfoForwardingMode === 'legacy') {
                suggestions.push('Consider using modern forwarding for better security and performance');
            }
            break;
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions
    };
}
