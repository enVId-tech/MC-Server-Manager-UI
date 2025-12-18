/**
 * RustyConnector Plugin Installer
 * Automatically installs RustyConnector plugin to newly created servers
 * to enable dynamic server registration with Velocity proxies via Redis
 */

import webdavService from '@/lib/server/webdav';
import { getRedisConfig, isRustyConnectorEnabled } from '@/lib/config/proxies';
import path from 'path';
import yaml from 'yaml';

// RustyConnector plugin download URLs (Paper/Spigot compatible)
const RUSTY_CONNECTOR_URLS = {
    // RC Paper is the Paper/Spigot compatible version
    paper: 'https://github.com/Aelysium-Group/rusty-connector/releases/latest/download/rc-paper.jar',
    // RC Velocity is for the proxy side
    velocity: 'https://github.com/Aelysium-Group/rusty-connector/releases/latest/download/rc-velocity.jar'
};

// Plugin JAR filename
const PLUGIN_FILENAME = 'RustyConnector.jar';

// Server types that support RustyConnector (Paper-based)
const SUPPORTED_SERVER_TYPES = ['PAPER', 'PURPUR', 'SPIGOT', 'BUKKIT'];

export interface RustyConnectorInstallResult {
    success: boolean;
    error?: string;
    details: string[];
    pluginPath?: string;
}

export interface ServerRustyConnectorConfig {
    serverId: string;
    serverName: string;
    family?: string;
    weight?: number;
    playerCap?: number;
    softCap?: number;
}

/**
 * Check if a server type supports RustyConnector
 */
export function supportsRustyConnector(serverType: string): boolean {
    return SUPPORTED_SERVER_TYPES.includes(serverType.toUpperCase());
}

/**
 * Install RustyConnector plugin to a server
 * 
 * @param serverPath - WebDAV path to the server (e.g., /minecraft-servers/user/uniqueId)
 * @param serverType - The type of server (PAPER, PURPUR, etc.)
 * @param config - Server configuration for RustyConnector
 */
export async function installRustyConnectorPlugin(
    serverPath: string,
    serverType: string,
    config: ServerRustyConnectorConfig
): Promise<RustyConnectorInstallResult> {
    const details: string[] = [];
    
    console.log(`[RustyConnector] Installing plugin for ${serverType} server at ${serverPath}`);
    console.log(`[RustyConnector] Config:`, JSON.stringify(config, null, 2));
    
    try {
        // Check if RustyConnector is enabled globally
        const rcEnabled = isRustyConnectorEnabled();
        console.log(`[RustyConnector] Global enabled check: ${rcEnabled}`);
        
        if (!rcEnabled) {
            console.log('[RustyConnector] Not enabled in configuration');
            return {
                success: false,
                error: 'RustyConnector is not enabled in configuration',
                details: ['RustyConnector must be enabled in proxies.yaml to use this feature']
            };
        }
        
        // Check if server type supports RustyConnector
        const supported = supportsRustyConnector(serverType);
        console.log(`[RustyConnector] Server type ${serverType} supported: ${supported}`);
        
        if (!supported) {
            return {
                success: false,
                error: `Server type ${serverType} does not support RustyConnector`,
                details: [`Supported types: ${SUPPORTED_SERVER_TYPES.join(', ')}`]
            };
        }
        
        details.push(`Installing RustyConnector plugin for ${serverType} server...`);
        
        // Ensure plugins directory exists
        const pluginsPath = `${serverPath}/plugins`;
        try {
            await webdavService.createDirectory(pluginsPath);
            details.push(`Ensured plugins directory exists: ${pluginsPath}`);
        } catch (e) {
            // Directory may already exist
        }
        
        // Download the RustyConnector plugin
        const pluginUrl = RUSTY_CONNECTOR_URLS.paper;
        details.push(`Downloading RustyConnector from: ${pluginUrl}`);
        
        const response = await fetch(pluginUrl);
        if (!response.ok) {
            throw new Error(`Failed to download RustyConnector: ${response.status} ${response.statusText}`);
        }
        
        const pluginBuffer = Buffer.from(await response.arrayBuffer());
        details.push(`Downloaded RustyConnector plugin (${Math.round(pluginBuffer.length / 1024)} KB)`);
        
        // Upload the plugin JAR
        const pluginPath = `${pluginsPath}/${PLUGIN_FILENAME}`;
        await webdavService.uploadFile(pluginPath, pluginBuffer);
        details.push(`Installed RustyConnector plugin to: ${pluginPath}`);
        
        // Create RustyConnector configuration directory
        const rcConfigDir = `${pluginsPath}/RustyConnector`;
        try {
            await webdavService.createDirectory(rcConfigDir);
            details.push(`Created RustyConnector config directory`);
        } catch (e) {
            // Directory may already exist
        }
        
        // Generate and upload RustyConnector configuration
        const rcConfig = generateServerRustyConnectorConfig(config);
        await webdavService.uploadFile(`${rcConfigDir}/config.yml`, rcConfig);
        details.push(`Created RustyConnector configuration for server`);
        
        return {
            success: true,
            details,
            pluginPath
        };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `Installation failed: ${error}`]
        };
    }
}

/**
 * Generate RustyConnector configuration for a Paper/Spigot server
 * This config tells the server how to connect to Redis and register itself
 */
function generateServerRustyConnectorConfig(config: ServerRustyConnectorConfig): string {
    const redisConfig = getRedisConfig();
    
    if (!redisConfig) {
        throw new Error('Redis configuration not found in proxies.yaml');
    }
    
    const rcConfig = {
        // Server identification
        server: {
            id: config.serverId,
            name: config.serverName,
            family: config.family || 'default',
            weight: config.weight || 1,
            'player-cap': config.playerCap || 100,
            'soft-cap': config.softCap || Math.floor((config.playerCap || 100) * 0.8)
        },
        
        // Redis connection settings
        redis: {
            host: redisConfig.internalHost,
            port: redisConfig.port,
            // Password is read from file/env for security
            'password-file': redisConfig.passwordSecret
        },
        
        // Connection settings
        connection: {
            'timeout': 30,
            'heartbeat-interval': 5,
            'registration-retry': 3
        },
        
        // Feature toggles
        features: {
            'auto-register': true,
            'unregister-on-shutdown': true,
            'player-sync': true
        }
    };
    
    return yaml.stringify(rcConfig, {
        indent: 2,
        lineWidth: 0
    });
}

/**
 * Remove RustyConnector plugin from a server (admin only)
 * This should generally NOT be called - plugin is required for connectivity
 */
export async function removeRustyConnectorPlugin(
    serverPath: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const pluginPath = `${serverPath}/plugins/${PLUGIN_FILENAME}`;
        const configPath = `${serverPath}/plugins/RustyConnector`;
        
        // Check if plugin exists
        if (await webdavService.exists(pluginPath)) {
            await webdavService.deleteFile(pluginPath);
        }
        
        // Note: We don't delete the config directory as it contains user data
        // and is protected by isProtectedPath anyway
        
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Check if RustyConnector is installed on a server
 */
export async function isRustyConnectorInstalled(serverPath: string): Promise<boolean> {
    const pluginPath = `${serverPath}/plugins/${PLUGIN_FILENAME}`;
    return await webdavService.exists(pluginPath);
}

/**
 * Update RustyConnector configuration for a server
 * Useful when server settings change
 */
export async function updateRustyConnectorConfig(
    serverPath: string,
    config: ServerRustyConnectorConfig
): Promise<RustyConnectorInstallResult> {
    const details: string[] = [];
    
    try {
        const rcConfigPath = `${serverPath}/plugins/RustyConnector/config.yml`;
        
        // Check if config exists
        if (!await webdavService.exists(rcConfigPath)) {
            return {
                success: false,
                error: 'RustyConnector config not found. Is the plugin installed?',
                details: []
            };
        }
        
        // Generate and upload updated configuration
        const rcConfig = generateServerRustyConnectorConfig(config);
        await webdavService.uploadFile(rcConfigPath, rcConfig);
        details.push(`Updated RustyConnector configuration`);
        
        return {
            success: true,
            details
        };
        
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `Update failed: ${error}`]
        };
    }
}

/**
 * Install RustyConnector Velocity plugin to a proxy
 * This enables the proxy to use Redis for dynamic server registration
 * 
 * @param proxyPath - WebDAV path to the proxy data (e.g., /minecraft/proxies/velocity-1)
 * @param proxyId - The unique ID of the proxy
 */
export async function installRustyConnectorVelocityPlugin(
    proxyPath: string,
    proxyId: string
): Promise<RustyConnectorInstallResult> {
    const details: string[] = [];
    
    try {
        console.log(`[RustyConnector Velocity] ========================================`);
        console.log(`[RustyConnector Velocity] Installing plugin for proxy: ${proxyId}`);
        console.log(`[RustyConnector Velocity] Proxy path: ${proxyPath}`);
        console.log(`[RustyConnector Velocity] ========================================`);
        
        // Check if RustyConnector is enabled globally
        const rcEnabled = isRustyConnectorEnabled();
        console.log(`[RustyConnector Velocity] RustyConnector enabled: ${rcEnabled}`);
        if (!rcEnabled) {
            console.log(`[RustyConnector Velocity] ❌ RustyConnector is NOT enabled - aborting`);
            return {
                success: false,
                error: 'RustyConnector is not enabled in configuration',
                details: ['RustyConnector must be enabled in proxies.yaml to use this feature']
            };
        }
        
        details.push(`Installing RustyConnector Velocity plugin for proxy ${proxyId}...`);
        
        // Ensure plugins directory exists
        const pluginsPath = `${proxyPath}/plugins`;
        console.log(`[RustyConnector Velocity] Creating plugins directory: ${pluginsPath}`);
        try {
            await webdavService.createDirectory(pluginsPath);
            details.push(`Ensured plugins directory exists: ${pluginsPath}`);
            console.log(`[RustyConnector Velocity] ✓ Plugins directory created/verified`);
        } catch (e) {
            // Directory may already exist
            console.log(`[RustyConnector Velocity] Plugins directory may already exist: ${e}`);
        }
        
        // Check if plugin already installed
        const pluginPath = `${pluginsPath}/${PLUGIN_FILENAME}`;
        console.log(`[RustyConnector Velocity] Checking if plugin exists: ${pluginPath}`);
        const pluginExists = await webdavService.exists(pluginPath);
        console.log(`[RustyConnector Velocity] Plugin exists: ${pluginExists}`);
        if (pluginExists) {
            details.push('RustyConnector Velocity plugin already installed');
            console.log(`[RustyConnector Velocity] ✓ Plugin already installed, skipping download`);
            return {
                success: true,
                details,
                pluginPath
            };
        }
        
        // Download the RustyConnector Velocity plugin
        const pluginUrl = RUSTY_CONNECTOR_URLS.velocity;
        console.log(`[RustyConnector Velocity] Downloading from: ${pluginUrl}`);
        details.push(`Downloading RustyConnector Velocity from: ${pluginUrl}`);
        
        const response = await fetch(pluginUrl);
        console.log(`[RustyConnector Velocity] Download response: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            console.log(`[RustyConnector Velocity] ❌ Download failed!`);
            throw new Error(`Failed to download RustyConnector Velocity: ${response.status} ${response.statusText}`);
        }
        
        const pluginBuffer = Buffer.from(await response.arrayBuffer());
        console.log(`[RustyConnector Velocity] Downloaded ${Math.round(pluginBuffer.length / 1024)} KB`);
        details.push(`Downloaded RustyConnector Velocity plugin (${Math.round(pluginBuffer.length / 1024)} KB)`);
        
        // Upload the plugin JAR
        console.log(`[RustyConnector Velocity] Uploading plugin to: ${pluginPath}`);
        await webdavService.uploadFile(pluginPath, pluginBuffer);
        console.log(`[RustyConnector Velocity] ✓ Plugin uploaded successfully`);
        details.push(`Installed RustyConnector Velocity plugin to: ${pluginPath}`);
        
        // Create RustyConnector configuration directory
        const rcConfigDir = `${pluginsPath}/rustyconnector`;
        console.log(`[RustyConnector Velocity] Creating config directory: ${rcConfigDir}`);
        try {
            await webdavService.createDirectory(rcConfigDir);
            details.push(`Created RustyConnector config directory`);
            console.log(`[RustyConnector Velocity] ✓ Config directory created`);
        } catch (e) {
            // Directory may already exist
            console.log(`[RustyConnector Velocity] Config directory may already exist: ${e}`);
        }
        
        // Generate and upload RustyConnector Velocity configuration
        const redisConfig = getRedisConfig();
        console.log(`[RustyConnector Velocity] Redis config exists: ${!!redisConfig}`);
        if (!redisConfig) {
            console.log(`[RustyConnector Velocity] ❌ No Redis configuration found!`);
            throw new Error('Redis configuration not found');
        }
        
        const rcConfig = generateVelocityRustyConnectorConfig(proxyId, redisConfig);
        const configPath = `${rcConfigDir}/config.yml`;
        console.log(`[RustyConnector Velocity] Uploading config to: ${configPath}`);
        await webdavService.uploadFile(configPath, rcConfig);
        console.log(`[RustyConnector Velocity] ✓ Config uploaded successfully`);
        details.push(`Created RustyConnector Velocity configuration`);
        
        console.log(`[RustyConnector Velocity] ========================================`);
        console.log(`[RustyConnector Velocity] ✓ INSTALLATION COMPLETE for ${proxyId}`);
        console.log(`[RustyConnector Velocity] ========================================`);
        
        return {
            success: true,
            details,
            pluginPath
        };
        
    } catch (error) {
        console.log(`[RustyConnector Velocity] ❌ INSTALLATION FAILED: ${error}`);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            details: [...details, `Installation failed: ${error}`]
        };
    }
}

/**
 * Generate RustyConnector configuration for Velocity proxy
 */
function generateVelocityRustyConnectorConfig(
    proxyId: string,
    redisConfig: ReturnType<typeof getRedisConfig>
): string {
    if (!redisConfig) {
        throw new Error('Redis configuration required');
    }
    
    const rcConfig = {
        // Proxy identification
        proxy: {
            id: proxyId,
            name: proxyId,
            'whitelist-enabled': false,
            'whitelist-permission': 'rustyconnector.whitelist.bypass'
        },
        
        // Redis connection settings
        redis: {
            host: redisConfig.internalHost,
            port: redisConfig.port,
            // Password is read from file for security
            'password-file': redisConfig.passwordSecret
        },
        
        // Connection settings
        connection: {
            'timeout': 30,
            'heartbeat-interval': 5
        },
        
        // Server families configuration
        families: {
            'default': {
                'display-name': 'Default',
                'load-balancer': 'LEAST_CONNECTION',
                'weighted': false,
                'persistence': false
            }
        },
        
        // Feature toggles
        features: {
            'auto-register': true,
            'kick-on-disconnect': false
        }
    };
    
    return yaml.stringify(rcConfig, {
        indent: 2,
        lineWidth: 0
    });
}

/**
 * Check if RustyConnector is installed on a Velocity proxy
 */
export async function isRustyConnectorVelocityInstalled(proxyPath: string): Promise<boolean> {
    const pluginPath = `${proxyPath}/plugins/${PLUGIN_FILENAME}`;
    return await webdavService.exists(pluginPath);
}

export default {
    supportsRustyConnector,
    installRustyConnectorPlugin,
    installRustyConnectorVelocityPlugin,
    removeRustyConnectorPlugin,
    isRustyConnectorInstalled,
    isRustyConnectorVelocityInstalled,
    updateRustyConnectorConfig
};
