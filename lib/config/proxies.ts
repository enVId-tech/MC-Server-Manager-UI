import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

// --- Redis Configuration ---
export interface RedisConfig {
    image: string;
    networkName: string;
    port: number;
    internalHost: string;
    passwordSecret: string;
    memory: string;
    config?: {
        maxmemory?: string;
        'maxmemory-policy'?: string;
        appendonly?: string;
    };
}

// --- RustyConnector Dynamic Configuration ---
export interface RustyConnectorDynamicConfig {
    plugin: 'RustyConnector';
    connectionDetails: {
        host: string;
        port: number;
        passwordRef: string;
    };
}

// --- Proxy Definition ---
export interface ProxyDefinition {
    id: string;
    name: string;
    host: string; // Container name
    port: number; // External port
    configPath?: string; // Legacy: Path to velocity.toml (optional)
    networkName: string;
    memory: string; // e.g. "512M"
    type: 'velocity' | 'bungeecord' | 'waterfall';
    dynamic?: RustyConnectorDynamicConfig;
}

// --- Dependencies Configuration ---
export interface DependenciesConfig {
    redis?: RedisConfig;
}

// --- Full Proxies Config ---
interface ProxiesConfig {
    dependencies?: DependenciesConfig;
    proxies: ProxyDefinition[];
}

// --- Protected Paths (cannot be deleted by users) ---
export const PROTECTED_PATHS = [
    // RustyConnector plugin and config files
    '/plugins/RustyConnector',
    '/plugins/RustyConnector.jar',
    '/plugins/rustyconnector',
    '/plugins/rustyconnector.jar',
    // RustyConnector configuration directories
    '/plugins/RustyConnector/config.yml',
    '/plugins/RustyConnector/families',
    '/plugins/RustyConnector/servers',
    '/plugins/RustyConnector/lang',
    // Any file/folder starting with rustyconnector (case-insensitive)
];

/**
 * Check if a path is protected from deletion
 */
export function isProtectedPath(filePath: string): boolean {
    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
    
    for (const protectedPath of PROTECTED_PATHS) {
        const normalizedProtected = protectedPath.toLowerCase();
        
        // Exact match or starts with protected path
        if (normalizedPath === normalizedProtected || 
            normalizedPath.startsWith(normalizedProtected + '/') ||
            normalizedPath.endsWith(normalizedProtected)) {
            return true;
        }
    }
    
    // Check for rustyconnector anywhere in path
    if (normalizedPath.includes('rustyconnector')) {
        return true;
    }
    
    return false;
}

let cachedConfig: ProxiesConfig | null = null;
let lastModified: number = 0;

/**
 * Load full configuration from YAML file
 */
function loadConfigFromYaml(): ProxiesConfig {
    try {
        const yamlPath = path.join(process.cwd(), 'lib', 'config', 'proxies.yaml');
        const stats = fs.statSync(yamlPath);
        
        // Check if file has been modified
        if (cachedConfig && stats.mtimeMs === lastModified) {
            return cachedConfig;
        }
        
        const fileContents = fs.readFileSync(yamlPath, 'utf8');
        const config = yaml.parse(fileContents) as ProxiesConfig;
        
        cachedConfig = config;
        lastModified = stats.mtimeMs;
        
        return cachedConfig;
    } catch (error) {
        console.error('Failed to load proxies.yaml:', error);
        return { proxies: [] };
    }
}

/**
 * Get all defined proxies
 */
export function getDefinedProxies(): ProxyDefinition[] {
    return loadConfigFromYaml().proxies || [];
}

/**
 * Get Redis configuration
 */
export function getRedisConfig(): RedisConfig | undefined {
    return loadConfigFromYaml().dependencies?.redis;
}

/**
 * Get all dependencies configuration
 */
export function getDependencies(): DependenciesConfig | undefined {
    return loadConfigFromYaml().dependencies;
}

/**
 * Check if RustyConnector is enabled for any proxy
 */
export function isRustyConnectorEnabled(): boolean {
    const proxies = getDefinedProxies();
    return proxies.some(p => p.dynamic?.plugin === 'RustyConnector');
}

// For backward compatibility
export const definedProxies: ProxyDefinition[] = getDefinedProxies();

/**
 * Reload proxies from YAML file (clears cache)
 */
export function reloadProxies(): ProxyDefinition[] {
    cachedConfig = null;
    lastModified = 0;
    return loadConfigFromYaml().proxies || [];
}

/**
 * Get the absolute path for a proxy config on the host system
 */
export function getProxyAbsolutePath(relativePath: string): string {
    const basePath = process.env.MINECRAFT_PATH || '/mnt/nvme/minecraft/velocity-test';
    return `${basePath}/${relativePath}`.replace(/\/+/g, '/');
}

/**
 * Get the container mount path for a proxy config directory
 */
export function getProxyContainerPath(relativePath: string): string {
    // Extract directory from relative path (e.g., "velocity/velocity.toml" -> "velocity")
    const dir = relativePath.split('/')[0];
    return `/${dir}`;
}

/**
 * Generate Redis password from environment or create a secure one
 */
export function getRedisPassword(): string {
    // Try to get from environment
    if (process.env.REDIS_PASSWORD) {
        return process.env.REDIS_PASSWORD;
    }
    
    // Generate a secure password if not set
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 32; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}
