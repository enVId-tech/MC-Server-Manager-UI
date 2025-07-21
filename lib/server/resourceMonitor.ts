import portainer from './portainer';
import Server from '@/lib/objects/Server';
import dbConnect from '@/lib/db/dbConnect';

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
    async getResourceStats(containerId: string, environmentId: number): Promise<ResourceStats | null> {
        try {
            console.log(`📊 Getting resource stats for container ${containerId}...`);
            
            // Get container stats from Docker API
            const stats = await portainer.getContainerStats(containerId, environmentId);
            console.log(`📈 Container stats retrieved: ${stats ? 'success' : 'null'}`);
            
            const playerInfo = await portainer.getMinecraftServerPlayerCount(containerId, environmentId);
            console.log(`👥 Player info retrieved:`, {
                playersOnline: playerInfo.playersOnline,
                maxPlayers: playerInfo.maxPlayers,
                error: playerInfo.error || 'none'
            });

            if (!stats) {
                console.log(`❌ No container stats available for ${containerId}`);
                return null;
            }

            // Parse CPU usage
            let cpuUsagePercent = 0;
            if (stats.cpu_stats && stats.precpu_stats) {
                const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
                const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
                const numCpus = stats.cpu_stats.online_cpus || 1;
                
                if (systemDelta > 0) {
                    cpuUsagePercent = (cpuDelta / systemDelta) * numCpus * 100;
                }
            }

            // Parse memory usage
            const memoryUsage = stats.memory_stats?.usage || 0;
            const memoryLimit = stats.memory_stats?.limit || 0;
            const memoryUsagePercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

            // Parse network I/O
            let networkRx = 0;
            let networkTx = 0;
            if (stats.networks) {
                Object.values(stats.networks).forEach((network: { rx_bytes?: number; tx_bytes?: number }) => {
                    networkRx += network.rx_bytes || 0;
                    networkTx += network.tx_bytes || 0;
                });
            }

            return {
                containerId,
                cpuUsagePercent: Math.round(cpuUsagePercent * 100) / 100,
                memoryUsageMB: Math.round(memoryUsage / 1024 / 1024),
                memoryLimitMB: Math.round(memoryLimit / 1024 / 1024),
                memoryUsagePercent: Math.round(memoryUsagePercent * 100) / 100,
                playersOnline: playerInfo.playersOnline,
                maxPlayers: playerInfo.maxPlayers,
                networkRxMB: Math.round(networkRx / 1024 / 1024 * 100) / 100,
                networkTxMB: Math.round(networkTx / 1024 / 1024 * 100) / 100,
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
            const environments = await portainer.getEnvironments();
            if (environments.length === 0) {
                return { scaled: false, error: 'No Portainer environments found' };
            }

            const environmentId = environments[0].Id;
            const containerIdentifier = `mc-${server.uniqueId}`;

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
                isOnline: true 
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

            const environments = await portainer.getEnvironments();
            if (environments.length === 0) {
                return null;
            }

            const environmentId = environments[0].Id;
            const containerIdentifier = `mc-${server.uniqueId}`;
            const container = await portainer.getContainerByIdentifier(containerIdentifier, environmentId);
            
            if (!container) {
                return null;
            }

            const stats = await this.getResourceStats(container.Id, environmentId);
            if (!stats) {
                return null;
            }

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
