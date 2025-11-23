/**
 * Multi-Proxy Management System
 * 
 * This module provides unified management for multiple proxy types:
 * - Velocity (modern, high-performance)
 * - BungeeCord (legacy compatibility)
 * - Waterfall (improved BungeeCord fork)
 * - RustyConnector (dynamic server management)
 */

import { VelocityServerConfig } from './velocity';
import { RustyConnectorServerConfig } from './rusty-connector';

export type ProxyType = 'velocity' | 'bungeecord' | 'waterfall' | 'rusty-connector';

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

    constructor() {
        this.initializeDefaultProxies();
    }

    /**
     * Initialize default proxy configurations from environment
     */
    private initializeDefaultProxies(): void {
        // Velocity proxy (existing)
        if (process.env.VELOCITY_ENABLED !== 'false') {
            this.registerProxy({
                id: 'velocity-main',
                name: 'Main Velocity Proxy',
                type: 'velocity',
                host: process.env.VELOCITY_HOST || 'velocity',
                port: parseInt(process.env.VELOCITY_PORT || '25565'),
                enabled: true,
                priority: 100,
                configPath: process.env.VELOCITY_CONFIG_PATH || '/velocity/velocity.toml',
                networkName: process.env.VELOCITY_NETWORK_NAME || 'velocity-network',
                description: 'Main Velocity proxy server for modern Minecraft versions',
                tags: ['modern', 'high-performance', 'primary'],
                capabilities: [
                    { name: 'modern-forwarding', supported: true },
                    { name: 'legacy-forwarding', supported: true },
                    { name: 'plugin-support', supported: true },
                    { name: 'forced-hosts', supported: true },
                    { name: 'dynamic-reload', supported: true }
                ],
                healthStatus: 'unknown'
            });
        }

        // BungeeCord proxy (new)
        if (process.env.BUNGEECORD_ENABLED === 'true') {
            this.registerProxy({
                id: 'bungeecord-main',
                name: 'Main BungeeCord Proxy',
                type: 'bungeecord',
                host: process.env.BUNGEECORD_HOST || 'bungeecord',
                port: parseInt(process.env.BUNGEECORD_PORT || '25566'),
                enabled: true,
                priority: 80,
                configPath: process.env.BUNGEECORD_CONFIG_PATH || '/bungeecord/config.yml',
                networkName: process.env.BUNGEECORD_NETWORK_NAME || 'bungeecord-network',
                description: 'Legacy BungeeCord proxy for compatibility',
                tags: ['legacy', 'compatible', 'backup'],
                capabilities: [
                    { name: 'modern-forwarding', supported: false },
                    { name: 'legacy-forwarding', supported: true },
                    { name: 'plugin-support', supported: true },
                    { name: 'forced-hosts', supported: true },
                    { name: 'dynamic-reload', supported: false }
                ],
                healthStatus: 'unknown'
            });
        }

        // Waterfall proxy (new)
        if (process.env.WATERFALL_ENABLED === 'true') {
            this.registerProxy({
                id: 'waterfall-main',
                name: 'Main Waterfall Proxy',
                type: 'waterfall',
                host: process.env.WATERFALL_HOST || 'waterfall',
                port: parseInt(process.env.WATERFALL_PORT || '25567'),
                enabled: true,
                priority: 90,
                configPath: process.env.WATERFALL_CONFIG_PATH || '/waterfall/config.yml',
                networkName: process.env.WATERFALL_NETWORK_NAME || 'waterfall-network',
                description: 'Improved BungeeCord fork with better performance',
                tags: ['improved-legacy', 'performance', 'secondary'],
                capabilities: [
                    { name: 'modern-forwarding', supported: true },
                    { name: 'legacy-forwarding', supported: true },
                    { name: 'plugin-support', supported: true },
                    { name: 'forced-hosts', supported: true },
                    { name: 'dynamic-reload', supported: true }
                ],
                healthStatus: 'unknown'
            });
        }

        // RustyConnector integration
        if (process.env.RUSTY_CONNECTOR_ENABLED === 'true') {
            this.registerProxy({
                id: 'rusty-connector',
                name: 'RustyConnector Dynamic Management',
                type: 'rusty-connector',
                host: process.env.VELOCITY_HOST || 'velocity',
                port: parseInt(process.env.VELOCITY_PORT || '25565'),
                enabled: true,
                priority: 110,
                configPath: '/velocity/plugins/RustyConnector/config.yml',
                networkName: 'rusty-connector-network',
                description: 'Dynamic server management with RustyConnector',
                tags: ['dynamic', 'advanced', 'auto-scaling'],
                capabilities: [
                    { name: 'modern-forwarding', supported: true },
                    { name: 'legacy-forwarding', supported: true },
                    { name: 'plugin-support', supported: true },
                    { name: 'forced-hosts', supported: true },
                    { name: 'dynamic-reload', supported: true },
                    { name: 'auto-scaling', supported: true },
                    { name: 'load-balancing', supported: true },
                    { name: 'server-families', supported: true }
                ],
                healthStatus: 'unknown'
            });
        }
    }

    /**
     * Register a new proxy instance
     */
    registerProxy(config: ProxyInstanceConfig): void {
        this.proxies.set(config.id, config);
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
                // Auto-select proxies based on strategy
                const primary = this.getBestProxyForServer(serverConfig);
                if (primary) {
                    targetProxies = [primary];
                }
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
                
                case 'rusty-connector':
                    return await this.deployToRustyConnector(proxy, serverConfig);
                
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
     * Deploy to RustyConnector (existing implementation)
     */
    private async deployToRustyConnector(
        proxy: ProxyInstanceConfig,
        serverConfig: ServerProxyConfig
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        // Import and use RustyConnector integration
        const { rustyConnectorIntegration } = await import('./rusty-connector-integration');
        
        // Convert to RustyConnector format
        const rustyConfig: RustyConnectorServerConfig = {
            ...serverConfig,
            families: ['default'],
            playerCap: 100,
            restricted: false
        };

        return await rustyConnectorIntegration.deployServerWithRustyConnector(
            rustyConfig,
            'PAPER' // Default server type, this should be determined dynamically
        );
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
}

// Export singleton instance
export const proxyManager = new ProxyManager();
export default proxyManager;
