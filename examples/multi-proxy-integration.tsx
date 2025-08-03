/**
 * Multi-Proxy Integration Example
 * 
 * This file demonstrates how to integrate the multi-proxy system
 * into your application components and workflows.
 */

import React, { useState, useEffect } from 'react';
import { MultiProxyManager } from '@/app/_components/ProxyManager/ProxyManager';

// Example: Server Dashboard with Multi-Proxy Support
export const ServerDashboardWithMultiProxy: React.FC<{ serverId: string }> = ({ serverId }) => {
    const [deploymentResult, setDeploymentResult] = useState<any>(null);
    const [proxyStats, setProxyStats] = useState<any>(null);

    useEffect(() => {
        loadProxyStatistics();
    }, []);

    const loadProxyStatistics = async () => {
        try {
            const response = await fetch('/api/server/multi-proxy?action=proxy-statistics');
            const data = await response.json();
            if (data.success) {
                setProxyStats(data.statistics);
            }
        } catch (error) {
            console.error('Failed to load proxy statistics:', error);
        }
    };

    const handleProxyDeployment = (result: any) => {
        setDeploymentResult(result);
        console.log('Deployment completed:', result);
        
        // Show success message
        if (result.success) {
            alert(`Successfully deployed to ${Object.keys(result.results).length} proxies!`);
        }
    };

    return (
        <div className="server-dashboard">
            <h1>Server Management Dashboard</h1>
            
            {/* Proxy Statistics */}
            {proxyStats && (
                <div className="proxy-stats-summary">
                    <h3>Proxy Network Status</h3>
                    <p>Active Proxies: {proxyStats.enabledProxies}/{proxyStats.totalProxies}</p>
                    <div className="proxy-types">
                        {Object.entries(proxyStats.proxyTypes).map(([type, count]) => (
                            <span key={type} className="proxy-type-badge">
                                {type}: {count as number}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Multi-Proxy Manager */}
            <MultiProxyManager 
                serverId={serverId}
                onProxyDeployment={handleProxyDeployment}
            />

            {/* Deployment Results */}
            {deploymentResult && (
                <div className="deployment-results">
                    <h3>Last Deployment Results</h3>
                    <pre>{JSON.stringify(deploymentResult, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

// Example: Programmatic Multi-Proxy Deployment
export class MultiProxyDeployer {
    /**
     * Deploy a server to the best available proxies
     */
    static async deployToBestProxies(serverId: string, options?: {
        preferredTypes?: string[];
        minProxies?: number;
        maxProxies?: number;
    }): Promise<{ success: boolean; details: any }> {
        try {
            // Get available proxies
            const proxiesResponse = await fetch('/api/server/multi-proxy?action=list-proxies&enabled=true');
            const proxiesData = await proxiesResponse.json();
            
            if (!proxiesData.success) {
                throw new Error('Failed to get available proxies');
            }

            const availableProxies = proxiesData.proxies;
            
            // Filter by preferred types if specified
            let targetProxies = availableProxies;
            if (options?.preferredTypes) {
                targetProxies = availableProxies.filter((proxy: any) => 
                    options.preferredTypes!.includes(proxy.type)
                );
            }

            // Sort by priority and health
            targetProxies.sort((a: any, b: any) => {
                if (a.healthStatus === 'healthy' && b.healthStatus !== 'healthy') return -1;
                if (b.healthStatus === 'healthy' && a.healthStatus !== 'healthy') return 1;
                return b.priority - a.priority;
            });

            // Limit proxy count
            const minProxies = options?.minProxies || 1;
            const maxProxies = options?.maxProxies || 3;
            const selectedProxies = targetProxies
                .slice(0, maxProxies)
                .map((proxy: any) => proxy.id);

            if (selectedProxies.length < minProxies) {
                throw new Error(`Not enough suitable proxies found (need ${minProxies}, found ${selectedProxies.length})`);
            }

            // Deploy to selected proxies
            const deployResponse = await fetch('/api/server/multi-proxy?action=deploy-multi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serverId,
                    targetProxies: selectedProxies,
                    loadBalancingStrategy: 'priority'
                })
            });

            const deployData = await deployResponse.json();
            return deployData;

        } catch (error) {
            return {
                success: false,
                details: { error: error instanceof Error ? error.message : 'Unknown error' }
            };
        }
    }

    /**
     * Deploy with specific proxy configuration
     */
    static async deployWithConfig(serverId: string, config: {
        targetProxies: string[];
        loadBalancingStrategy?: string;
        fallbackProxies?: string[];
        proxySpecificConfig?: Record<string, any>;
    }): Promise<{ success: boolean; details: any }> {
        try {
            const response = await fetch('/api/server/multi-proxy?action=deploy-multi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serverId,
                    ...config
                })
            });

            return await response.json();
        } catch (error) {
            return {
                success: false,
                details: { error: error instanceof Error ? error.message : 'Unknown error' }
            };
        }
    }

    /**
     * Test server compatibility with proxy types
     */
    static async testCompatibility(serverId: string, proxyTypes: string[]): Promise<{
        success: boolean;
        compatibility: Record<string, any>;
    }> {
        try {
            const response = await fetch('/api/server/multi-proxy?action=test-compatibility', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serverId,
                    proxyTypes
                })
            });

            return await response.json();
        } catch (error) {
            return {
                success: false,
                compatibility: {}
            };
        }
    }
}

// Example: Proxy Health Monitor Hook
export const useProxyHealth = (refreshInterval: number = 60000) => {
    const [healthData, setHealthData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    const refreshHealth = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/server/multi-proxy?action=health-check');
            const data = await response.json();
            if (data.success) {
                setHealthData(data.health);
            }
        } catch (error) {
            console.error('Failed to refresh proxy health:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshHealth();
        const interval = setInterval(refreshHealth, refreshInterval);
        return () => clearInterval(interval);
    }, [refreshInterval]);

    return { healthData, isLoading, refreshHealth };
};

// Example: Server Creation with Multi-Proxy
export const createServerWithMultiProxy = async (serverData: any, proxyConfig?: {
    autoSelectProxies?: boolean;
    preferredProxyTypes?: string[];
    deploymentStrategy?: string;
}) => {
    try {
        // First, create the server using existing API
        const createResponse = await fetch('/api/server/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serverData)
        });

        const createResult = await createResponse.json();
        if (!createResult.success) {
            throw new Error('Failed to create server');
        }

        const serverId = createResult.server.uniqueId;

        // Then deploy to proxies if configured
        if (proxyConfig?.autoSelectProxies) {
            const deployResult = await MultiProxyDeployer.deployToBestProxies(serverId, {
                preferredTypes: proxyConfig.preferredProxyTypes,
                minProxies: 1,
                maxProxies: 2
            });

            return {
                success: true,
                server: createResult.server,
                proxyDeployment: deployResult
            };
        }

        return {
            success: true,
            server: createResult.server,
            proxyDeployment: null
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

// Example: Proxy Migration Utility
export class ProxyMigrationHelper {
    /**
     * Migrate server from one proxy to another
     */
    static async migrateServer(
        serverId: string, 
        fromProxyId: string, 
        toProxyId: string
    ): Promise<{ success: boolean; details: string[] }> {
        const details: string[] = [];
        
        try {
            details.push(`Starting migration from ${fromProxyId} to ${toProxyId}`);

            // Deploy to new proxy
            const deployResult = await MultiProxyDeployer.deployWithConfig(serverId, {
                targetProxies: [toProxyId]
            });

            if (!deployResult.success) {
                throw new Error(`Failed to deploy to new proxy: ${deployResult.details?.error}`);
            }

            details.push(`Successfully deployed to ${toProxyId}`);

            // Test new proxy
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for deployment
            details.push('Waiting for new proxy deployment to stabilize...');

            // Here you would implement logic to remove from old proxy
            // This depends on the specific proxy type and configuration
            details.push(`Migration from ${fromProxyId} to ${toProxyId} completed`);

            return { success: true, details };

        } catch (error) {
            details.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false, details };
        }
    }

    /**
     * Bulk migrate servers between proxies
     */
    static async bulkMigrate(
        migrations: Array<{ serverId: string; fromProxyId: string; toProxyId: string }>,
        options?: {
            batchSize?: number;
            delayBetweenBatches?: number;
        }
    ): Promise<{ success: boolean; results: any[] }> {
        const batchSize = options?.batchSize || 5;
        const delay = options?.delayBetweenBatches || 10000;
        const results: any[] = [];

        for (let i = 0; i < migrations.length; i += batchSize) {
            const batch = migrations.slice(i, i + batchSize);
            
            const batchPromises = batch.map(migration =>
                this.migrateServer(migration.serverId, migration.fromProxyId, migration.toProxyId)
            );

            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);

            // Delay between batches
            if (i + batchSize < migrations.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const success = successCount === migrations.length;

        return { success, results };
    }
}

// Example usage in a React component
export const ExampleUsage: React.FC = () => {
    const { healthData, isLoading, refreshHealth } = useProxyHealth(30000);
    const [serverId] = useState('example-server-id');

    const handleQuickDeploy = async () => {
        const result = await MultiProxyDeployer.deployToBestProxies(serverId, {
            preferredTypes: ['velocity', 'waterfall'],
            minProxies: 1,
            maxProxies: 2
        });

        if (result.success) {
            alert('Deployment successful!');
        } else {
            alert(`Deployment failed: ${result.details?.error}`);
        }
    };

    const handleCompatibilityTest = async () => {
        const result = await MultiProxyDeployer.testCompatibility(serverId, [
            'velocity', 'bungeecord', 'waterfall', 'rusty-connector'
        ]);

        console.log('Compatibility results:', result.compatibility);
    };

    return (
        <div className="multi-proxy-example">
            <h2>Multi-Proxy Integration Example</h2>
            
            {/* Health Status */}
            <div className="health-status">
                <h3>Network Health {isLoading && '(Refreshing...)'}</h3>
                {healthData && (
                    <div>
                        <p>Overall Status: <strong>{healthData.overall}</strong></p>
                        <button onClick={refreshHealth}>Refresh Health</button>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="quick-actions">
                <button onClick={handleQuickDeploy}>
                    Quick Deploy to Best Proxies
                </button>
                <button onClick={handleCompatibilityTest}>
                    Test Compatibility
                </button>
            </div>

            {/* Full Multi-Proxy Manager */}
            <MultiProxyManager 
                serverId={serverId}
                onProxyDeployment={(result) => console.log('Deployment result:', result)}
            />
        </div>
    );
};

export default ExampleUsage;
