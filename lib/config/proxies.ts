import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

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
}

// --- Full Proxies Config ---
interface ProxiesConfig {
    proxies: ProxyDefinition[];
}

// --- Protected Paths (cannot be deleted by users) ---
export const PROTECTED_PATHS: string[] = [
    // Add protected paths here if needed in the future
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
