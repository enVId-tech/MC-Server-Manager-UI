import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

export interface ProxyDefinition {
    id: string;
    name: string;
    host: string; // Container name
    port: number; // External port
    configPath: string; // Path to velocity.toml relative to server base path (absolute path in container)
    networkName: string;
    memory: string; // e.g. "512M"
    type: 'velocity' | 'bungeecord' | 'waterfall';
}

interface ProxiesConfig {
    proxies: ProxyDefinition[];
}

let cachedProxies: ProxyDefinition[] | null = null;
let lastModified: number = 0;

/**
 * Load proxies from YAML configuration file
 */
function loadProxiesFromYaml(): ProxyDefinition[] {
    try {
        const yamlPath = path.join(process.cwd(), 'lib', 'config', 'proxies.yaml');
        const stats = fs.statSync(yamlPath);
        
        // Check if file has been modified
        if (cachedProxies && stats.mtimeMs === lastModified) {
            return cachedProxies;
        }
        
        const fileContents = fs.readFileSync(yamlPath, 'utf8');
        const config = yaml.parse(fileContents) as ProxiesConfig;
        
        cachedProxies = config.proxies || [];
        lastModified = stats.mtimeMs;
        
        return cachedProxies;
    } catch (error) {
        console.error('Failed to load proxies.yaml:', error);
        return [];
    }
}

/**
 * Get all defined proxies
 */
export function getDefinedProxies(): ProxyDefinition[] {
    return loadProxiesFromYaml();
}

// For backward compatibility
export const definedProxies: ProxyDefinition[] = getDefinedProxies();

/**
 * Reload proxies from YAML file (clears cache)
 */
export function reloadProxies(): ProxyDefinition[] {
    cachedProxies = null;
    lastModified = 0;
    return loadProxiesFromYaml();
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
