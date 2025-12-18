/**
 * Redis Management Service
 * 
 * This service manages the Redis container required for RustyConnector
 * dynamic server management. It handles:
 * - Checking if Redis exists
 * - Creating Redis containers with proper networking
 * - Managing Redis connections for velocity proxies
 */

import portainer from './portainer';
import { getRedisConfig, RedisConfig, getRedisPassword } from '@/lib/config/proxies';

export interface RedisStatus {
    exists: boolean;
    running: boolean;
    containerId?: string;
    stackId?: number;
    networkName?: string;
    host?: string;
    port?: number;
    error?: string;
}

export interface RedisEnsureResult {
    success: boolean;
    status: RedisStatus;
    details: string[];
    error?: string;
}

/**
 * Redis Management Service
 */
export class RedisService {
    private readonly REDIS_CONTAINER_NAME = 'redis';
    private readonly REDIS_STACK_NAME = 'redis';
    
    /**
     * Check if Redis container exists and is running
     */
    async checkRedisStatus(environmentId: number): Promise<RedisStatus> {
        try {
            // First check for Redis stack
            const stack = await portainer.getStackByName(this.REDIS_STACK_NAME);
            
            if (stack) {
                // Stack exists, check container status
                const containers = await portainer.getContainers(environmentId);
                const redisContainer = containers.find(c => 
                    c.Names.some(n => n.includes(this.REDIS_CONTAINER_NAME))
                );
                
                if (redisContainer) {
                    const config = getRedisConfig();
                    return {
                        exists: true,
                        running: redisContainer.State === 'running',
                        containerId: redisContainer.Id,
                        stackId: stack.Id,
                        networkName: config?.networkName || 'velocity-network',
                        host: config?.internalHost || 'redis',
                        port: config?.port || 6379
                    };
                }
                
                // Stack exists but no container (something wrong)
                return {
                    exists: true,
                    running: false,
                    stackId: stack.Id,
                    error: 'Redis stack exists but container not found'
                };
            }
            
            // Also check for standalone container (no stack)
            const containers = await portainer.getContainers(environmentId);
            const redisContainer = containers.find(c => 
                c.Names.some(n => n.includes(this.REDIS_CONTAINER_NAME)) ||
                c.Image.includes('redis')
            );
            
            if (redisContainer) {
                const config = getRedisConfig();
                return {
                    exists: true,
                    running: redisContainer.State === 'running',
                    containerId: redisContainer.Id,
                    networkName: config?.networkName || 'velocity-network',
                    host: config?.internalHost || 'redis',
                    port: config?.port || 6379
                };
            }
            
            return {
                exists: false,
                running: false
            };
            
        } catch (error) {
            return {
                exists: false,
                running: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    /**
     * Ensure Redis container exists and is running
     * This is called before server creation and proxy creation
     */
    async ensureRedis(environmentId: number, isAdmin: boolean = false): Promise<RedisEnsureResult> {
        const details: string[] = [];
        
        try {
            // Get Redis config from YAML
            const config = getRedisConfig();
            
            if (!config) {
                return {
                    success: false,
                    status: { exists: false, running: false },
                    details: ['Redis configuration not found in proxies.yaml'],
                    error: 'Redis configuration not found'
                };
            }
            
            details.push('Checking Redis status...');
            
            // Check current status
            const status = await this.checkRedisStatus(environmentId);
            
            // If Redis exists and is running, we're done
            if (status.exists && status.running) {
                details.push('✓ Redis is already running');
                return {
                    success: true,
                    status,
                    details
                };
            }
            
            // If Redis exists but not running, start it
            if (status.exists && !status.running && status.containerId) {
                details.push('Redis exists but not running. Starting...');
                
                try {
                    await portainer.startContainer(status.containerId, environmentId);
                    details.push('✓ Redis container started');
                    
                    return {
                        success: true,
                        status: { ...status, running: true },
                        details
                    };
                } catch (startError) {
                    details.push(`Failed to start Redis: ${startError}`);
                    
                    // If not admin, this is an error
                    if (!isAdmin) {
                        return {
                            success: false,
                            status,
                            details,
                            error: 'Redis container exists but could not be started. Contact an administrator.'
                        };
                    }
                }
            }
            
            // Redis doesn't exist - only admins can create it
            if (!isAdmin) {
                return {
                    success: false,
                    status,
                    details: [...details, 'Redis not found. An administrator must configure the infrastructure first.'],
                    error: 'Redis infrastructure not configured. Please contact an administrator.'
                };
            }
            
            // Admin: Create Redis
            details.push('Creating Redis container...');
            
            const createResult = await this.createRedis(config, environmentId);
            details.push(...createResult.details);
            
            if (!createResult.success) {
                return {
                    success: false,
                    status: { exists: false, running: false },
                    details,
                    error: createResult.error
                };
            }
            
            // Verify creation
            const newStatus = await this.checkRedisStatus(environmentId);
            
            return {
                success: newStatus.exists && newStatus.running,
                status: newStatus,
                details
            };
            
        } catch (error) {
            return {
                success: false,
                status: { exists: false, running: false },
                details: [...details, `Error ensuring Redis: ${error}`],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    /**
     * Create Redis container and stack
     */
    private async createRedis(
        config: RedisConfig, 
        environmentId: number
    ): Promise<{ success: boolean; details: string[]; error?: string }> {
        const details: string[] = [];
        
        try {
            // Ensure network exists
            details.push(`Ensuring network ${config.networkName} exists...`);
            await this.ensureNetwork(config.networkName, environmentId);
            details.push(`✓ Network ${config.networkName} ready`);
            
            // Generate password
            const redisPassword = getRedisPassword();
            
            // Create Docker Compose content for Redis
            const composeContent = `version: '3.8'
services:
  ${config.internalHost}:
    image: ${config.image}
    container_name: ${config.internalHost}
    restart: unless-stopped
    command: redis-server --requirepass ${redisPassword} --maxmemory ${config.config?.maxmemory || '100mb'} --maxmemory-policy ${config.config?.['maxmemory-policy'] || 'allkeys-lru'} --appendonly ${config.config?.appendonly || 'yes'}
    ports:
      - "${config.port}:6379"
    volumes:
      - redis-data:/data
    networks:
      - ${config.networkName}
    deploy:
      resources:
        limits:
          memory: ${config.memory}

volumes:
  redis-data:

networks:
  ${config.networkName}:
    external: true
`;

            details.push('Deploying Redis stack...');
            
            // Check if Redis stack already exists (handles duplicate scenario)
            const existingStack = await portainer.getStackByName(this.REDIS_STACK_NAME);
            if (existingStack) {
                details.push('✓ Redis stack already exists, checking container status...');
                
                // Just verify container is running
                const status = await this.checkRedisStatus(environmentId);
                if (status.running) {
                    details.push('✓ Redis container is already running');
                    return { success: true, details };
                } else if (status.containerId) {
                    // Container exists but not running, try to start it
                    details.push('Starting existing Redis container...');
                    try {
                        await portainer.startContainer(status.containerId, environmentId);
                        details.push('✓ Redis container started');
                        return { success: true, details };
                    } catch (startErr) {
                        details.push(`⚠ Could not start Redis container: ${startErr}`);
                    }
                }
                // Fall through to return success since stack exists
                return { success: true, details };
            }
            
            // Create stack
            const stackData = {
                Name: this.REDIS_STACK_NAME,
                ComposeFile: composeContent,
                Env: [
                    { name: 'REDIS_PASSWORD', value: redisPassword }
                ]
            };
            
            try {
                await portainer.createStack(stackData, environmentId);
            } catch (createError) {
                // If stack creation fails due to existing container, try to recover
                const errorMsg = createError instanceof Error ? createError.message : String(createError);
                if (errorMsg.includes('already exists') || errorMsg.includes('name is already in use')) {
                    details.push('⚠ Redis container already exists (possibly orphaned), checking status...');
                    const status = await this.checkRedisStatus(environmentId);
                    if (status.exists) {
                        details.push('✓ Found existing Redis container');
                        return { success: true, details };
                    }
                }
                throw createError;
            }
            
            // Wait for container to start
            details.push('Waiting for Redis to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Verify Redis is running
            const status = await this.checkRedisStatus(environmentId);
            
            if (status.running) {
                details.push('✓ Redis created and running successfully');
                return { success: true, details };
            } else {
                details.push('⚠ Redis stack created but container not running yet');
                return { success: true, details }; // Still success, might just need more time
            }
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            details.push(`✗ Failed to create Redis: ${errorMsg}`);
            return {
                success: false,
                details,
                error: errorMsg
            };
        }
    }
    
    /**
     * Ensure Docker network exists
     */
    private async ensureNetwork(networkName: string, environmentId: number): Promise<void> {
        try {
            // Check if network exists
            const networks = await portainer.axiosInstance.get(
                `/api/endpoints/${environmentId}/docker/networks`
            );
            
            const networkExists = networks.data.some(
                (n: { Name: string }) => n.Name === networkName
            );
            
            if (!networkExists) {
                // Create network
                await portainer.axiosInstance.post(
                    `/api/endpoints/${environmentId}/docker/networks/create`,
                    {
                        Name: networkName,
                        Driver: 'bridge',
                        Options: {}
                    }
                );
                console.log(`Created network: ${networkName}`);
            }
        } catch (error) {
            // Network might already exist, which is fine
            console.warn(`Network check/create warning: ${error}`);
        }
    }
    
    /**
     * Get Redis connection details for RustyConnector configuration
     */
    async getRedisConnectionDetails(environmentId: number): Promise<{
        host: string;
        port: number;
        password: string;
    } | null> {
        const status = await this.checkRedisStatus(environmentId);
        
        if (!status.exists || !status.running) {
            return null;
        }
        
        const config = getRedisConfig();
        
        return {
            host: config?.internalHost || 'redis',
            port: 6379, // Internal port is always 6379
            password: getRedisPassword()
        };
    }
    
    /**
     * Delete Redis (admin only, for cleanup)
     */
    async deleteRedis(environmentId: number): Promise<{ success: boolean; details: string[] }> {
        const details: string[] = [];
        
        try {
            // Check if stack exists
            const stack = await portainer.getStackByName(this.REDIS_STACK_NAME);
            
            if (stack) {
                details.push('Deleting Redis stack...');
                await portainer.deleteStack(stack.Id, environmentId);
                details.push('✓ Redis stack deleted');
            } else {
                // Try to find and delete standalone container
                const status = await this.checkRedisStatus(environmentId);
                
                if (status.containerId) {
                    details.push('Stopping Redis container...');
                    await portainer.stopContainer(status.containerId, environmentId);
                    details.push('✓ Redis container stopped');
                    
                    // Note: We don't delete the container, just stop it
                    // This preserves data in case of accidental deletion
                }
            }
            
            return { success: true, details };
            
        } catch (error) {
            details.push(`Error deleting Redis: ${error}`);
            return { success: false, details };
        }
    }
}

// Export singleton instance
export const redisService = new RedisService();
export default redisService;
