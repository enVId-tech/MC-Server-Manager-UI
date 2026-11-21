import portainer from './portainer';
import Server from '@/lib/objects/Server';
import dbConnect from '@/lib/db/dbConnect';
import { getContainerName } from '@/lib/server/containerNames';
import { getPlayers, getUsage } from '@/lib/server/liveStats';

interface ResourceStats {
    containerId: string;
    cpuUsagePercent: number;
    memoryUsageMB: number;
    memoryLimitMB: number;
    memoryUsagePercent: number;
    playersOnline: number;
    maxPlayers: number;
    networkRxMB: number;
    networkTxMB: number;
}

interface ScalingRules {
    memoryPerPlayer: number; // MB per player
    baseMemory: number; // Base memory in MB
    maxMemory: number; // Maximum memory limit in MB
    minMemory: number; // Minimum memory limit in MB
    cpuPerPlayer: number; // CPU quota per player (microseconds)
    baseCpu: number; // Base CPU quota
    scalingThreshold: number; // Resource usage percentage threshold for scaling
}

/** The memory of a server as it is stored: 2048, "2048", "2G" or "2048M" */
export function parseMemoryMB(value: unknown): number {
    if (typeof value === 'number') return value > 0 ? value : 0;
    const match = /^(\d+(?:\.\d+)?)\s*([GMK]?)/i.exec(String(value ?? '').trim());
    if (!match) return 0;
    const amount = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    return Math.round(unit === 'G' ? amount * 1024 : unit === 'K' ? amount / 1024 : amount);
}

export class ResourceMonitor {
    private static instance: ResourceMonitor;
    private scalingRules: ScalingRules = {
        memoryPerPlayer: 150, // 150MB per player
        baseMemory: 1024, // 1GB base
        maxMemory: 8192, // 8GB max
        minMemory: 512, // 512MB min
        cpuPerPlayer: 5000, // 5ms per 100ms period per player
        baseCpu: 50000, // 50ms per 100ms period base
        scalingThreshold: 80 // Scale when usage exceeds 80%
    };

    private constructor() {}

    public static getInstance(): ResourceMonitor {
        if (!ResourceMonitor.instance) {
            ResourceMonitor.instance = new ResourceMonitor();
        }
        return ResourceMonitor.instance;
    }

    /**
     * Get real-time resource statistics for a container
     */
    async getResourceStats(containerId: string, environmentId: number, configuredMemoryMB = 0): Promise<ResourceStats | null> {
        try {
            // The limit that was set on the container; without one Docker reports the memory of the machine
            let limitBytes = 0;
            try {
                limitBytes = (await portainer.getContainerDetails(containerId, environmentId)).HostConfig?.Memory || 0;
            } catch { /* the stats still tell something */ }
            if (limitBytes <= 0 && configuredMemoryMB > 0) limitBytes = configuredMemoryMB * 1024 * 1024;

            const [usage, players] = await Promise.all([
                getUsage(containerId, environmentId, limitBytes),
                getPlayers(containerId, environmentId),
            ]);
            if (!usage) return null;

            return {
                containerId,
                cpuUsagePercent: usage.cpuPercent,
                memoryUsageMB: usage.memoryMB,
                memoryLimitMB: usage.memoryLimitMB,
                memoryUsagePercent: usage.memoryPercent,
                playersOnline: players.online,
                maxPlayers: players.max ?? 0,
                networkRxMB: usage.networkRxMB,
                networkTxMB: usage.networkTxMB,
            };
        } catch (error) {
            console.error(`❌ Failed to get resource stats for container ${containerId}:`, error);
            return null;
        }
    }

    /**
     * Calculate optimal resource allocation based on player count
     */
    calculateOptimalResources(playersOnline: number, maxPlayers: number): { memory: number; cpuQuota: number } {
        // Calculate memory based on current players + buffer for max players
        const playerBasedMemory = (playersOnline * this.scalingRules.memoryPerPlayer) + 
                                  ((maxPlayers - playersOnline) * this.scalingRules.memoryPerPlayer * 0.5);
        
        const optimalMemory = Math.min(
            Math.max(this.scalingRules.baseMemory + playerBasedMemory, this.scalingRules.minMemory),
            this.scalingRules.maxMemory
        );

        // Calculate CPU quota based on current players
        const optimalCpu = Math.max(
            this.scalingRules.baseCpu + (playersOnline * this.scalingRules.cpuPerPlayer),
            this.scalingRules.baseCpu
        );

        return {
            memory: Math.round(optimalMemory * 1024 * 1024), // Convert to bytes
            cpuQuota: Math.round(optimalCpu)
        };
    }

    /**
     * Check if resources need scaling and apply if necessary
     */
    async checkAndScaleResources(serverId: string): Promise<{
        scaled: boolean;
        oldResources?: { memory: number; cpuQuota: number };
        newResources?: { memory: number; cpuQuota: number };
        reason?: string;
        error?: string;
    }> {
        try {
            await dbConnect();

            // Find server
            const server = await Server.findOne({ uniqueId: serverId });
            if (!server) {
                return { scaled: false, error: 'Server not found' };
            }

            // Get Portainer environment
            const environmentId = await portainer.getValidEnvironmentId(server.environmentId ?? null);
            const containerIdentifier = getContainerName(server);

            // Get container
            const container = await portainer.getContainerByIdentifier(containerIdentifier, environmentId);
            if (!container) {
                return { scaled: false, error: 'Container not found' };
            }

            // Get current resource stats
            const stats = await this.getResourceStats(container.Id, environmentId);
            if (!stats) {
                return { scaled: false, error: 'Failed to get resource stats' };
            }

            // Get current container details for resource limits
            const containerDetails = await portainer.getContainerDetails(container.Id, environmentId);
            const currentMemory = containerDetails.HostConfig?.Memory || 0;
            const currentCpuQuota = containerDetails.HostConfig?.CpuQuota || 0;

            // Check if scaling is needed
            const shouldScale = stats.memoryUsagePercent > this.scalingRules.scalingThreshold ||
                                stats.cpuUsagePercent > this.scalingRules.scalingThreshold ||
                                stats.playersOnline > (stats.memoryLimitMB / this.scalingRules.memoryPerPlayer);

            if (!shouldScale) {
                return { scaled: false, reason: 'No scaling needed' };
            }

            // Calculate optimal resources
            const optimalResources = this.calculateOptimalResources(stats.playersOnline, stats.maxPlayers);

            // Only scale if there's a significant difference (> 10%)
            const memoryDifference = Math.abs(optimalResources.memory - currentMemory) / currentMemory;
            const cpuDifference = currentCpuQuota > 0 ? Math.abs(optimalResources.cpuQuota - currentCpuQuota) / currentCpuQuota : 1;

            if (memoryDifference < 0.1 && cpuDifference < 0.1) {
                return { scaled: false, reason: 'Resource difference too small' };
            }

            // Apply resource scaling
            await portainer.updateContainerResources(container.Id, environmentId, {
                memory: optimalResources.memory,
                cpuQuota: optimalResources.cpuQuota,
                cpuPeriod: 100000 // 100ms period
            });

            // Update server record with new resource allocation
            await Server.updateOne(
                { uniqueId: serverId },
                { 
                    $set: { 
                        'serverConfig.serverMemory': Math.round(optimalResources.memory / 1024 / 1024),
                        lastResourceUpdate: new Date()
                    }
                }
            );

            console.log(`✅ Resources scaled for server ${serverId}: Memory ${Math.round(currentMemory / 1024 / 1024)}MB -> ${Math.round(optimalResources.memory / 1024 / 1024)}MB, CPU ${currentCpuQuota} -> ${optimalResources.cpuQuota}`);

            return {
                scaled: true,
                oldResources: {
                    memory: currentMemory,
                    cpuQuota: currentCpuQuota
                },
                newResources: optimalResources,
                reason: `Scaling due to ${stats.memoryUsagePercent > this.scalingRules.scalingThreshold ? 'memory' : 'CPU'} usage > ${this.scalingRules.scalingThreshold}%`
            };

        } catch (error) {
            console.error(`❌ Failed to scale resources for server ${serverId}:`, error);
            return { 
                scaled: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            };
        }
    }

    /**
     * Monitor all servers and apply scaling where needed
     */
    async monitorAllServers(): Promise<{
        serversChecked: number;
        serversScaled: number;
        results: Array<{ serverId: string; result: { scaled: boolean; reason?: string; error?: string } }>;
    }> {
        try {
            await dbConnect();

            // Get all online servers
            const servers = await Server.find({ 
                isOnline: true,
                kind: { $ne: 'proxy' }
            }).select('uniqueId serverName').limit(50); // Limit to prevent overload

            const results = [];
            let serversScaled = 0;

            for (const server of servers) {
                const result = await this.checkAndScaleResources(server.uniqueId);
                results.push({
                    serverId: server.uniqueId,
                    result
                });

                if (result.scaled) {
                    serversScaled++;
                }

                // Add delay between servers to prevent API overload
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(`📊 Resource monitoring complete: ${servers.length} servers checked, ${serversScaled} servers scaled`);

            return {
                serversChecked: servers.length,
                serversScaled,
                results
            };

        } catch (error) {
            console.error('❌ Failed to monitor servers:', error);
            throw error;
        }
    }

    /**
     * Get resource usage summary for dashboard
     */
    async getResourceSummary(serverId: string): Promise<{
        cpuUsage: number;
        memoryUsage: number;
        memoryLimit: number;
        memoryUsagePercent: number;
        playersOnline: number;
        maxPlayers: number;
        networkRx: number;
        networkTx: number;
        isOptimal: boolean;
        recommendations?: string[];
        error?: string;
    } | null> {
        try {
            await dbConnect();

            const server = await Server.findOne({ uniqueId: serverId });
            if (!server) {
                return null;
            }

            const environmentId = await portainer.getValidEnvironmentId(server.environmentId ?? (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID, 10) : null));
            const containerIdentifier = getContainerName(server);
            const container = await portainer.getContainerByIdentifier(containerIdentifier, environmentId);
            
            if (!container) {
                return null;
            }

            const stats = await this.getResourceStats(container.Id, environmentId, parseMemoryMB(server.serverConfig?.serverMemory));
            if (!stats) {
                return null;
            }
            // The player limit of the server itself when it could not be asked
            if (!stats.maxPlayers) stats.maxPlayers = Number(server.serverConfig?.maxPlayers) || 20;

            // Generate recommendations
            const recommendations = [];
            if (stats.memoryUsagePercent > 90) {
                recommendations.push("Memory usage is critically high. Consider upgrading server resources.");
            } else if (stats.memoryUsagePercent > 80) {
                recommendations.push("Memory usage is high. Monitor for performance issues.");
            }

            if (stats.cpuUsagePercent > 90) {
                recommendations.push("CPU usage is critically high. Server may experience lag.");
            }

            if (stats.playersOnline > stats.maxPlayers * 0.8) {
                recommendations.push("Server is near player capacity. Consider increasing max players or server resources.");
            }

            const isOptimal = stats.memoryUsagePercent < 80 && stats.cpuUsagePercent < 80;

            return {
                cpuUsage: stats.cpuUsagePercent,
                memoryUsage: stats.memoryUsageMB,
                memoryLimit: stats.memoryLimitMB,
                memoryUsagePercent: stats.memoryUsagePercent,
                playersOnline: stats.playersOnline,
                maxPlayers: stats.maxPlayers,
                networkRx: stats.networkRxMB,
                networkTx: stats.networkTxMB,
                isOptimal,
                recommendations: recommendations.length > 0 ? recommendations : undefined
            };

        } catch (error) {
            console.error(`❌ Failed to get resource summary for server ${serverId}:`, error);
            return {
                cpuUsage: 0,
                memoryUsage: 0,
                memoryLimit: 0,
                memoryUsagePercent: 0,
                playersOnline: 0,
                maxPlayers: 20,
                networkRx: 0,
                networkTx: 0,
                isOptimal: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Update scaling rules (admin function)
     */
    updateScalingRules(newRules: Partial<ScalingRules>): void {
        this.scalingRules = { ...this.scalingRules, ...newRules };
        console.log('📋 Resource scaling rules updated:', this.scalingRules);
    }

    /**
     * Get current scaling rules
     */
    getScalingRules(): ScalingRules {
        return { ...this.scalingRules };
    }
}

// Export singleton instance
export default ResourceMonitor.getInstance();
