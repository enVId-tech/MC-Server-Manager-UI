/**
 * Multi-Proxy Management System
 * 
 * This module provides unified management for multiple proxy types:
 * - Velocity (modern, high-performance)
 * - BungeeCord (legacy compatibility)
 * - Waterfall (improved BungeeCord fork)
 */

import { VelocityServerConfig } from './velocity';
import portainer from './portainer';
import { getDefinedProxies, reloadProxies, ProxyDefinition } from '@/lib/config/proxies';
import webdavService from './webdav';
import velocityService from './velocity';
import path from 'path';
import Server from '@/lib/objects/Server';
import { createMinecraftServer, ClientServerConfig, MinecraftServerConfig } from '@/lib/server/minecraft';

export type ProxyType = 'velocity' | 'bungeecord' | 'waterfall';

export interface ProxyInstanceConfig {
    id: string;
    name: string;
    type: ProxyType;
    host: string;
    port: number;
    enabled: boolean;
    priority: number; // Higher priority proxies are preferred
    configPath: string;
    networkName?: string;
    description?: string;
    tags: string[];
    capabilities: ProxyCapability[];
    maxServers?: number;
    currentServers?: number;
    lastHealthCheck?: Date;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

export interface ProxyCapability {
    name: string;
    supported: boolean;
    version?: string;
    notes?: string;
}

export interface ServerProxyConfig extends VelocityServerConfig {
    targetProxies: string[]; // Array of proxy IDs to deploy to
    loadBalancingStrategy?: 'round-robin' | 'priority' | 'least-connections' | 'custom';
    fallbackProxies?: string[]; // Fallback proxies if primary fails
    proxySpecificConfig?: {
        [proxyId: string]: Partial<VelocityServerConfig>;
    };
}

export interface MultiProxyDeploymentResult {
    success: boolean;
    results: {
        [proxyId: string]: {
            success: boolean;
            error?: string;
            details: string[];
        };
    };
    overallDetails: string[];
    primaryProxy?: string;
    fallbackProxies: string[];
}

/**
 * Multi-Proxy Management Service
 * Provides unified interface for managing multiple proxy types
 */
export class ProxyManager {
    private proxies: Map<string, ProxyInstanceConfig> = new Map();
    private defaultLoadBalancingStrategy: string = 'priority';
    private syncInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.initializeDefaultProxies();
        this.startPeriodicSync();
    }

    /**
     * Start periodic synchronization (every 10 minutes)
     */
    private startPeriodicSync(): void {
        // Initial sync on startup
        this.performSync().catch(error => {
            console.error('Initial proxy sync failed:', error);
        });

        // Set up 10-minute interval
        this.syncInterval = setInterval(() => {
            this.performSync().catch(error => {
                console.error('Periodic proxy sync failed:', error);
            });
        }, 10 * 60 * 1000); // 10 minutes
    }

    /**
     * Perform synchronization of proxies
     */
    private async performSync(): Promise<void> {
        try {
            console.log('[Proxy Manager] Starting periodic sync...');

            // Reload proxies from YAML
            const proxies = reloadProxies();

            // Get environment ID
            const environmentId = await portainer.getFirstEnvironmentId();
            if (!environmentId) {
                console.warn('[Proxy Manager] No Portainer environment found');
                return;
            }

            // Ensure proxies exist
            const details = await this.ensureProxies(environmentId);
            console.log('[Proxy Manager] Sync completed:', details.join(', '));
        } catch (error) {
            console.error('[Proxy Manager] Sync error:', error);
        }
    }

    /**
     * Stop periodic synchronization
     */
    public stopPeriodicSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * Initialize default proxy configurations from defined proxies
     */
    private initializeDefaultProxies(): void {
        // Register proxies from definition file
        const definedProxies = getDefinedProxies();
        for (const def of definedProxies) {
            this.registerProxyFromDefinition(def);
        }
    }

    /**
     * Register a new proxy instance
     */
    registerProxy(config: ProxyInstanceConfig): void {
        this.proxies.set(config.id, config);
    }

    /**
     * Unregister a proxy instance
     */
    unregisterProxy(proxyId: string): boolean {
        return this.proxies.delete(proxyId);
    }

    /**
     * Get all registered proxies
     */
    getAllProxies(): ProxyInstanceConfig[] {
        return Array.from(this.proxies.values());
    }

    /**
     * Get enabled proxies sorted by priority
     */
    getEnabledProxies(): ProxyInstanceConfig[] {
        return Array.from(this.proxies.values())
            .filter(proxy => proxy.enabled)
            .sort((a, b) => b.priority - a.priority);
    }

    /**
     * Get proxies by type
     */
    getProxiesByType(type: ProxyType): ProxyInstanceConfig[] {
        return Array.from(this.proxies.values())
            .filter(proxy => proxy.type === type);
    }

    /**
     * Get proxy by ID
     */
    getProxy(id: string): ProxyInstanceConfig | undefined {
        return this.proxies.get(id);
    }

    /**
     * Get the best proxy for a server deployment
     */
    getBestProxyForServer(
        serverConfig: ServerProxyConfig,
        requirements?: string[]
    ): ProxyInstanceConfig | undefined {
        const enabledProxies = this.getEnabledProxies();

        if (serverConfig.targetProxies?.length > 0) {
            // Use specified target proxies
            for (const proxyId of serverConfig.targetProxies) {
                const proxy = this.proxies.get(proxyId);
                if (proxy?.enabled) {
                    return proxy;
                }
            }
        }

        // Filter by requirements
        let candidates = enabledProxies;
        if (requirements && requirements.length > 0) {
            candidates = enabledProxies.filter(proxy =>
                requirements.every(req =>
                    proxy.capabilities.some(cap => cap.name === req && cap.supported)
                )
            );
        }

        // Return highest priority proxy
        return candidates[0];
    }

    /**
     * Deploy server to multiple proxies
     */
    async deployServerToProxies(
        serverConfig: ServerProxyConfig,
        userEmail: string,
        uniqueId: string
    ): Promise<MultiProxyDeploymentResult> {
        const results: MultiProxyDeploymentResult['results'] = {};
        const overallDetails: string[] = [];
        let primaryProxy: string | undefined;
        const fallbackProxies: string[] = [];

        try {
            // Determine target proxies
            let targetProxies: ProxyInstanceConfig[] = [];

            if (serverConfig.targetProxies?.length > 0) {
                targetProxies = serverConfig.targetProxies
                    .map(id => this.proxies.get(id))
                    .filter(proxy => proxy?.enabled) as ProxyInstanceConfig[];
            } else {
                // Default: Deploy to ALL enabled proxies (High Availability)
                targetProxies = Array.from(this.proxies.values())
                    .filter(proxy => proxy.enabled && proxy.type === 'velocity') // Focus on Velocity for now
                    .sort((a, b) => b.priority - a.priority);
            }

            if (targetProxies.length === 0) {
                return {
                    success: false,
                    results: {},
                    overallDetails: ['No suitable proxies found for deployment'],
                    fallbackProxies: []
                };
            }

            overallDetails.push(`Deploying to ${targetProxies.length} proxy(ies)`);

            // Deploy to each proxy
            for (const proxy of targetProxies) {
                overallDetails.push(`Deploying to ${proxy.name} (${proxy.type})...`);

                try {
                    const proxySpecificConfig = {
                        ...serverConfig,
                        ...(serverConfig.proxySpecificConfig?.[proxy.id] || {})
                    };

                    const result = await this.deployToSingleProxy(
                        proxy,
                        proxySpecificConfig,
                        userEmail,
                        uniqueId
                    );

                    results[proxy.id] = result;

                    if (result.success) {
                        if (!primaryProxy) {
                            primaryProxy = proxy.id;
                        } else {
                            fallbackProxies.push(proxy.id);
                        }
                        overallDetails.push(`✓ Successfully deployed to ${proxy.name}`);
                    } else {
                        overallDetails.push(`✗ Failed to deploy to ${proxy.name}: ${result.error}`);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    results[proxy.id] = {
                        success: false,
                        error: errorMessage,
                        details: [`Deployment failed: ${errorMessage}`]
                    };
                    overallDetails.push(`✗ Failed to deploy to ${proxy.name}: ${errorMessage}`);
                }
            }

            const successfulDeployments = Object.values(results).filter(r => r.success).length;
            const success = successfulDeployments > 0;

            return {
                success,
                results,
                overallDetails,
                primaryProxy,
                fallbackProxies
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                results,
                overallDetails: [...overallDetails, `Overall deployment failed: ${errorMessage}`],
                fallbackProxies: []
            };
        }
    }

    /**
     * Deploy to a single proxy instance
     */
    private async deployToSingleProxy(
        proxy: ProxyInstanceConfig,
        serverConfig: ServerProxyConfig,
        userEmail: string,
        uniqueId: string
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        try {
            switch (proxy.type) {
                case 'velocity':
                    return await this.deployToVelocity(proxy, serverConfig, userEmail, uniqueId);

                case 'bungeecord':
                    return await this.deployToBungeeCord(proxy, serverConfig, userEmail, uniqueId);

                case 'waterfall':
                    return await this.deployToWaterfall(proxy, serverConfig, userEmail, uniqueId);

                default:
                    return {
                        success: false,
                        error: `Unsupported proxy type: ${proxy.type}`,
                        details: [`Proxy type ${proxy.type} is not supported`]
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: [`Failed to deploy to ${proxy.type}: ${error}`]
            };
        }
    }

    /**
     * Deploy to Velocity proxy (existing implementation)
     */
    private async deployToVelocity(
        proxy: ProxyInstanceConfig,
        serverConfig: ServerProxyConfig,
        userEmail: string,
        uniqueId: string
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        // Import and use existing Velocity service
        const { default: velocityService } = await import('./velocity');
        const result = await velocityService.configureServerForVelocity(
            serverConfig,
            userEmail,
            uniqueId,
            proxy.configPath,
            proxy.networkName
        );

        // Trigger reload if supported
        if (result.success && proxy.capabilities.some(c => c.name === 'dynamic-reload' && c.supported)) {
            try {
                const { default: portainer } = await import('./portainer');
                // Find container by name (host) to get ID for reload
                const containers = await portainer.findContainers(undefined, { image: 'velocity' });
                const container = containers.find(c => c.Names.some(n => n.includes(proxy.host)));

                if (container) {
                    await velocityService.reloadVelocity(container.Id);
                    result.details?.push(`Triggered reload for Velocity container ${container.Id}`);
                }
            } catch (e) {
                console.warn(`Failed to reload proxy ${proxy.id}:`, e);
            }
        }

        return {
            ...result,
            details: result.details ?? []
        };
    }

    /**
     * Deploy to BungeeCord proxy (new implementation)
     */
    private async deployToBungeeCord(
        proxy: ProxyInstanceConfig,
        serverConfig: ServerProxyConfig,
        userEmail: string,
        uniqueId: string
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        // Import and use BungeeCord service
        const { default: bungeeCordService } = await import('./bungeecord.ts');
        const result = await bungeeCordService.configureServerForBungeeCord(serverConfig, userEmail, uniqueId);
        return {
            ...result,
            details: result.details ?? []
        };
    }

    /**
     * Deploy to Waterfall proxy (new implementation)
     */
    private async deployToWaterfall(
        proxy: ProxyInstanceConfig,
        serverConfig: ServerProxyConfig,
        userEmail: string,
        uniqueId: string
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        // Import and use Waterfall service
        const { default: waterfallService } = await import('./waterfall.ts');
        const result = await waterfallService.configureServerForWaterfall(serverConfig, userEmail, uniqueId);
        return {
            ...result,
            details: result.details ?? []
        };
    }



    /**
     * Health check for all proxies
     */
    async performHealthChecks(): Promise<{
        overall: 'healthy' | 'degraded' | 'unhealthy';
        proxies: { [id: string]: { status: string; details: string[] } };
    }> {
        const results: { [id: string]: { status: string; details: string[] } } = {};
        let healthyCount = 0;
        let totalCount = 0;

        for (const proxy of this.proxies.values()) {
            if (!proxy.enabled) continue;

            totalCount++;
            const healthResult = await this.checkProxyHealth(proxy);
            results[proxy.id] = healthResult;

            if (healthResult.status === 'healthy') {
                healthyCount++;
            }

            // Update proxy status
            proxy.healthStatus = healthResult.status as 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
            proxy.lastHealthCheck = new Date();
        }

        let overall: 'healthy' | 'degraded' | 'unhealthy';
        if (healthyCount === totalCount) {
            overall = 'healthy';
        } else if (healthyCount > 0) {
            overall = 'degraded';
        } else {
            overall = 'unhealthy';
        }

        return { overall, proxies: results };
    }

    /**
     * Check health of a single proxy
     */
    private async checkProxyHealth(proxy: ProxyInstanceConfig): Promise<{
        status: string;
        details: string[];
    }> {
        const details: string[] = [];

        try {
            // Basic connectivity check
            // This would be implemented with actual health check logic
            details.push(`Checking connectivity to ${proxy.host}:${proxy.port}`);

            // For now, simulate health check
            const isHealthy = true; // This would be actual health check result

            if (isHealthy) {
                details.push('Proxy is responding normally');
                return { status: 'healthy', details };
            } else {
                details.push('Proxy is not responding');
                return { status: 'unhealthy', details };
            }
        } catch (error) {
            details.push(`Health check failed: ${error}`);
            return { status: 'unhealthy', details };
        }
    }

    /**
     * Get proxy statistics
     */
    getProxyStatistics(): {
        totalProxies: number;
        enabledProxies: number;
        proxyTypes: { [type: string]: number };
        healthStatus: { [status: string]: number };
    } {
        const proxies = Array.from(this.proxies.values());
        const enabled = proxies.filter(p => p.enabled);

        const proxyTypes: { [type: string]: number } = {};
        const healthStatus: { [status: string]: number } = {};

        for (const proxy of proxies) {
            proxyTypes[proxy.type] = (proxyTypes[proxy.type] || 0) + 1;
            healthStatus[proxy.healthStatus] = (healthStatus[proxy.healthStatus] || 0) + 1;
        }

        return {
            totalProxies: proxies.length,
            enabledProxies: enabled.length,
            proxyTypes,
            healthStatus
        };
    }

    /**
     * Update proxy configuration
     */
    updateProxy(id: string, updates: Partial<ProxyInstanceConfig>): boolean {
        const proxy = this.proxies.get(id);
        if (!proxy) return false;

        Object.assign(proxy, updates);
        this.proxies.set(id, proxy);
        return true;
    }

    /**
     * Remove proxy
     */
    removeProxy(id: string): boolean {
        return this.proxies.delete(id);
    }

    /**
     * Scan for Velocity proxies in Portainer and register them
     */
    async scanAndRegisterProxies(environmentId: number = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1): Promise<MultiProxyDeploymentResult> {
        const details: string[] = [];
        const results: MultiProxyDeploymentResult['results'] = {};

        try {
            // First, ensure defined proxies exist
            details.push('Ensuring defined proxies exist...');
            const ensureDetails = await this.ensureProxies(environmentId);
            details.push(...ensureDetails);

            details.push(`Scanning for Velocity proxies in environment ${environmentId}...`);

            // Find containers with 'velocity' in their image name
            const velocityContainers = await portainer.findContainers(environmentId, { image: 'velocity' });

            details.push(`Found ${velocityContainers.length} potential Velocity containers.`);

            for (const container of velocityContainers) {
                const containerId = container.Id;
                const containerName = container.Names[0].replace(/^\//, ''); // Remove leading slash

                // Skip if already registered (optional, but good to avoid overwriting custom configs)
                // For now, we'll update existing ones or create new ones

                // Determine config path and network
                // We assume standard paths or try to inspect container (future improvement)
                const configPath = `/velocity-${containerName}/velocity.toml`; // Convention-based path
                const networkName = Object.keys(container.NetworkSettings?.Networks || {})[0] || 'velocity-network';

                // Register or update proxy
                const proxyId = `velocity-${containerName}`;

                this.registerProxy({
                    id: proxyId,
                    name: `Velocity (${containerName})`,
                    type: 'velocity',
                    host: containerName, // Use container name as host in Docker network
                    port: 25565, // Default port, might need inspection
                    enabled: true,
                    priority: 50,
                    configPath: configPath,
                    networkName: networkName,
                    description: `Auto-discovered Velocity proxy: ${containerName}`,
                    tags: ['auto-discovered', 'velocity'],
                    capabilities: [
                        { name: 'modern-forwarding', supported: true },
                        { name: 'dynamic-reload', supported: true }
                    ],
                    healthStatus: 'healthy' // Assume healthy if running
                });

                results[proxyId] = {
                    success: true,
                    details: [`Registered proxy ${proxyId} from container ${containerName}`]
                };
            }

            return {
                success: true,
                results,
                overallDetails: details,
                fallbackProxies: []
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                results: {},
                overallDetails: [...details, `Scan failed: ${errorMessage}`],
                fallbackProxies: []
            };
        }
    }

    /**
     * Ensure all defined proxies exist and are running
     */
    async ensureProxies(environmentId: number = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1): Promise<string[]> {
        const details: string[] = [];

        // Reload proxies from YAML to get latest configuration
        const definedProxies = getDefinedProxies();

        // First, remove any orphaned proxies
        details.push('Checking for orphaned proxies...');
        await this.removeOrphanedProxies(environmentId, details);

        // Then ensure all defined proxies exist
        for (const def of definedProxies) {
            try {
                await this.ensureProxyExists(def, environmentId, details);
            } catch (error) {
                details.push(`Failed to ensure proxy ${def.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        // Sync servers after ensuring proxies
        try {
            const syncDetails = await this.syncServers(environmentId);
            details.push(...syncDetails);
        } catch (error) {
            details.push(`Failed to sync servers: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return details;
    }    /**
     * Synchronize servers between Database and Portainer
     */
    async syncServers(environmentId: number): Promise<string[]> {
        const details: string[] = [];
        details.push('Starting server synchronization...');

        try {
            // 1. Get all containers
            const containers = await portainer.getContainers(environmentId);
            const serverContainers = containers.filter(c =>
                c.Names.some(n => n.match(/^\/?(mc-|minecraft-)/))
            );

            // 2. Get all DB servers
            const dbServers = await Server.find({});
            const dbServerIds = new Set(dbServers.map(s => s.uniqueId));

            // 3. Handle Orphans (Container exists, DB missing)
            for (const container of serverContainers) {
                // Extract ID from name (e.g., /mc-123abc -> 123abc)
                const name = container.Names[0].replace(/^\//, '');
                const idMatch = name.match(/^(?:mc-|minecraft-)(.+)$/);
                if (idMatch) {
                    const serverId = idMatch[1];
                    if (!dbServerIds.has(serverId)) {
                        // Feature removed: Do not stop orphaned containers automatically
                        // This was causing issues where valid servers were being stopped
                        details.push(`Found potential orphaned server container: ${name} (${serverId}). Taking no action.`);
                    }
                }
            }

            // 4. Handle Missing (DB exists, Container missing)
            for (const server of dbServers) {
                const containerName = `mc-${server.uniqueId}`;
                const exists = serverContainers.some(c => c.Names.some(n => n.includes(containerName)));

                if (!exists) {
                    details.push(`Server ${server.serverName} (${server.uniqueId}) missing in Portainer. Recreating...`);

                    try {
                        // Construct config from DB
                        // We assume server.serverConfig matches ClientServerConfig structure roughly
                        // We might need to map fields if they differ significantly
                        const config = server.serverConfig as unknown as MinecraftServerConfig;

                        // Create server instance
                        const minecraftServer = createMinecraftServer(
                            config,
                            server.serverName,
                            server.uniqueId,
                            environmentId,
                            server.email || 'default-user'
                        );

                        // Deploy
                        await minecraftServer.deployToPortainer();
                        details.push(`Successfully recreated server ${server.serverName}`);
                    } catch (e) {
                        details.push(`Failed to recreate server ${server.serverName}: ${e}`);
                    }
                }
            }

        } catch (error) {
            details.push(`Server synchronization failed: ${error}`);
        }

        return details;
    }

    /**
     * Remove orphaned proxy containers that are no longer in the definition file
     */
    private async removeOrphanedProxies(environmentId: number, details: string[]): Promise<void> {
        try {
            // Get current defined proxies from YAML
            const definedProxies = getDefinedProxies();

            // Get all stacks
            const stacks = await portainer.getStacks();
            const definedProxyIds = new Set(definedProxies.map((p: ProxyDefinition) => p.id));

            for (const stack of stacks) {
                // Check if this is a proxy stack (matches pattern: velocity, velocity-2, etc.)
                const isProxyStack = definedProxies.some((p: ProxyDefinition) => p.name === stack.Name);

                if (isProxyStack) {
                    // Check if this proxy is still defined
                    const matchingDef = definedProxies.find((p: ProxyDefinition) => p.name === stack.Name);

                    if (!matchingDef) {
                        details.push(`Found orphaned proxy stack: ${stack.Name}. Removing...`);

                        try {
                            // Stop and remove the stack
                            await portainer.stopStack(stack.Id, environmentId);
                            details.push(`✓ Removed orphaned proxy: ${stack.Name}`);
                        } catch (error) {
                            details.push(`✗ Failed to remove orphaned proxy ${stack.Name}: ${error}`);
                        }
                    }
                }
            }
        } catch (error) {
            details.push(`Warning: Failed to check for orphaned proxies: ${error}`);
        }
    }

    /**
     * Ensure a single proxy exists
     */
    private async ensureProxyExists(def: ProxyDefinition, environmentId: number, details: string[]): Promise<void> {
        // 1. Check if container exists
        const container = await portainer.getContainerByIdentifier(def.host, environmentId);

        if (container) {
            details.push(`Proxy ${def.name} already exists.`);
            // Register it
            this.registerProxyFromDefinition(def);
            return;
        }

        details.push(`Proxy ${def.name} not found. Creating...`);

        if (!def.configPath) {
            throw new Error(`Proxy ${def.name} requires a configPath`);
        }

        // 2. Ensure configuration exists using absolute server path
        const { getProxyAbsolutePath, getProxyContainerPath } = await import('@/lib/config/proxies');
        const absoluteConfigPath = getProxyAbsolutePath(def.configPath);
        const containerMountPath = getProxyContainerPath(def.configPath);
        const configDir = path.dirname(absoluteConfigPath);

        // Create directory using WebDAV (directory in the actual server filesystem)
        const webdavConfigDir = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft/velocity-test'}/${def.configPath.split('/')[0]}`;
        try {
            await webdavService.createDirectory(webdavConfigDir);
            details.push(`Created config directory: ${configDir}`);
        } catch (e) {
            // Ignore if exists
        }

        // Check if config file exists using WebDAV, if not create default
        const webdavConfigPath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft/velocity-test'}/${def.configPath}`;
        try {
            await webdavService.getFileContents(webdavConfigPath);
            details.push(`Config file already exists: ${def.configPath}`);
        } catch {
            details.push(`Creating default configuration for ${def.name}...`);

            // Get base config object
            const velocityConfig = velocityService.getDefaultVelocityConfig();

            // Check for other existing proxies to mirror
            const definedProxies = getDefinedProxies();
            const otherProxies = definedProxies.filter((p: ProxyDefinition) => p.id !== def.id);
            let mirrored = false;

            for (const other of otherProxies) {
                try {
                    // Try to read config from other proxy using WebDAV
                    const otherWebdavPath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft/velocity-test'}/${other.configPath}`;
                    const otherConfig = await velocityService.readVelocityConfig(otherWebdavPath);

                    if (otherConfig && otherConfig.servers && Object.keys(otherConfig.servers).length > 0) {
                        velocityConfig.servers = { ...otherConfig.servers };
                        velocityConfig['forced-hosts'] = { ...otherConfig['forced-hosts'] };
                        velocityConfig['try'] = [...otherConfig['try']];
                        details.push(`Mirrored configuration from ${other.name}`);
                        mirrored = true;
                        break;
                    }
                } catch (e) {
                    // Ignore and try next
                }
            }

            if (!mirrored) {
                // First instance logic: Populate from DB
                details.push(`First proxy instance. Populating from database...`);
                try {
                    const allServers = await Server.find({});
                    for (const server of allServers) {
                        if (server.uniqueId && server.serverName) {
                            const serverAddress = `mc-${server.uniqueId}:25565`;
                            velocityConfig.servers[server.serverName] = { address: serverAddress };

                            // Add to try list for connection attempts
                            if (!velocityConfig['try'].includes(server.serverName)) {
                                velocityConfig['try'].push(server.serverName);
                            }

                            // Add forced host if subdomain exists
                            if (server.subdomainName) {
                                const domain = process.env.ROOT_DOMAIN || 'example.com';
                                const host = `${server.subdomainName}.${domain}`;
                                if (!velocityConfig['forced-hosts']) velocityConfig['forced-hosts'] = {};
                                velocityConfig['forced-hosts'][host] = [server.serverName];
                            }
                        }
                    }
                    details.push(`Populated ${allServers.length} servers from database.`);
                } catch (dbError) {
                    details.push(`Warning: Failed to populate from DB: ${dbError}`);
                }
            }

            const configContent = velocityService.generateVelocityConfig(velocityConfig);
            await webdavService.uploadFile(webdavConfigPath, configContent);
            details.push(`Created default config: ${def.configPath}`);

            // Also create forwarding.secret
            const webdavSecretPath = `${webdavConfigDir}/forwarding.secret`;
            const secret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            await webdavService.uploadFile(webdavSecretPath, secret);
            details.push(`Created forwarding.secret`);
        }

        // 3. Create Stack/Container using absolute host path
        const stackName = def.name;
        const hostConfigDir = path.dirname(absoluteConfigPath);
        const stackContent = `version: '3'
services:
  ${def.host}:
    image: envidtech/velocity:latest
    container_name: ${def.host}
    restart: on-failure:5
    ports:
      - "${def.port}:25565"
    volumes:
      - ${hostConfigDir}:${containerMountPath}
    networks:
      - ${def.networkName}
    environment:
      - VELOCITY_MEMORY=${def.memory}

networks:
  ${def.networkName}:
    external: true
`;

        // Deploy stack
        details.push(`Deploying stack for ${def.name}...`);
        await portainer.createStack(
            {
                Name: stackName,
                ComposeFile: stackContent,
                Env: []
            },
            environmentId
        );

        details.push(`Proxy ${def.name} deployed successfully.`);
        
        this.registerProxyFromDefinition(def);
    }

    private registerProxyFromDefinition(def: ProxyDefinition) {
        this.registerProxy({
            id: def.id,
            name: def.name,
            type: def.type,
            host: def.host,
            port: def.port,
            enabled: true,
            priority: 100,
            configPath: def.configPath || '',
            networkName: def.networkName,
            description: `Managed Proxy: ${def.name}`,
            tags: ['managed', def.type],
            capabilities: [
                { name: 'modern-forwarding', supported: true },
                { name: 'dynamic-reload', supported: true }
            ],
            healthStatus: 'healthy'
        });
    }
}

// Export singleton instance
export const proxyManager = new ProxyManager();
export default proxyManager;
