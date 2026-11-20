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
export interface ProxiesConfig {
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
 * Absolute path of the proxies definition file. PROXIES_CONFIG_PATH lets a container keep it on a mounted volume.
 */
export function getProxiesConfigPath(): string {
    const configured = process.env.PROXIES_CONFIG_PATH?.trim();
    return configured ? path.resolve(configured) : path.join(process.cwd(), 'lib', 'config', 'proxies.yaml');
}

/**
 * Read the proxies file for editing. A missing or empty file is treated as "no proxies yet".
 */
export function readProxiesFile(): ProxiesConfig {
    let contents: string;
    try {
        contents = fs.readFileSync(getProxiesConfigPath(), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { proxies: [] };
        }
        throw error;
    }
    const parsed = yaml.parse(contents) as Partial<ProxiesConfig> | null;
    return { ...parsed, proxies: Array.isArray(parsed?.proxies) ? parsed.proxies : [] };
}

/**
 * Persist the proxies file (creating its folder if needed) and drop the cache.
 */
export function writeProxiesFile(config: ProxiesConfig): void {
    const filePath = getProxiesConfigPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, yaml.stringify(config, { indent: 2 }), 'utf8');
    cachedConfig = null;
    lastModified = 0;
}

/**
 * Load full configuration from YAML file
 */
function loadConfigFromYaml(): ProxiesConfig {
    try {
        const yamlPath = getProxiesConfigPath();
        const stats = fs.statSync(yamlPath);
        
        // Check if file has been modified
        if (cachedConfig && stats.mtimeMs === lastModified) {
            return cachedConfig;
        }
        
        const fileContents = fs.readFileSync(yamlPath, 'utf8');
        const parsed = yaml.parse(fileContents) as Partial<ProxiesConfig> | null;
        const config: ProxiesConfig = { ...parsed, proxies: Array.isArray(parsed?.proxies) ? parsed.proxies : [] };

        cachedConfig = config;
        lastModified = stats.mtimeMs;
        
        return cachedConfig;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error('Failed to load proxies.yaml:', error);
        }
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
    const basePath = process.env.FOLDER_PATH || process.env.MINECRAFT_PATH || '/mnt/nvme/minecraft/velocity-test';
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
