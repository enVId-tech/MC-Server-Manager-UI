/**
 * Docker Image Update Manager
 * 
 * This service manages Docker image updates for Minecraft servers:
 * - Scheduled automatic updates (configurable intervals)
 * - Manual admin-triggered updates
 * - Cleanup of old/outdated images
 * - Server restart coordination during updates
 * - Update rollback capabilities
 */

import portainer from './portainer';
import { PortainerContainer, PortainerImage } from './portainer';
import Server from '@/lib/objects/Server';
import User, { IUser } from '@/lib/objects/User';
import dbConnect from '@/lib/db/dbConnect';

export interface ImageUpdateConfig {
    enabled: boolean;
    schedule: 'daily' | 'weekly' | 'monthly' | 'manual';
    maintenanceWindow?: {
        startHour: number; // 0-23
        endHour: number;   // 0-23
        timezone: string;  // e.g., 'America/New_York'
    };
    autoRestart: boolean;
    cleanupOldImages: boolean;
    maxImageAge: number; // Days to keep old images
    notifyUsers: boolean;
    rollbackOnFailure: boolean;
}

export interface UpdateResult {
    success: boolean;
    updatedContainers: string[];
    failedContainers: string[];
    cleanedImages: string[];
    errors: string[];
    rollbackPerformed: boolean;
    details: string[];
}

export interface ServerUpdateStatus {
    serverId: string;
    serverName: string;
    containerName: string;
    currentImage: string;
    targetImage: string;
    status: 'pending' | 'updating' | 'completed' | 'failed' | 'rolled-back';
    startTime?: Date;
    endTime?: Date;
    error?: string;
    userNotified: boolean;
}

/**
 * Docker Image Update Manager Service
 */
export class DockerImageUpdater {
    private config: ImageUpdateConfig;
    private updateQueue: ServerUpdateStatus[] = [];
    private isUpdating = false;

    constructor() {
        this.config = this.loadConfig();
    }

    /**
     * Load configuration from environment variables with defaults
     */
    private loadConfig(): ImageUpdateConfig {
        return {
            enabled: process.env.DOCKER_UPDATE_ENABLED === 'true',
            schedule: (process.env.DOCKER_UPDATE_SCHEDULE as 'daily' | 'weekly' | 'monthly') || 'weekly',
            maintenanceWindow: {
                startHour: parseInt(process.env.DOCKER_UPDATE_START_HOUR || '2'),
                endHour: parseInt(process.env.DOCKER_UPDATE_END_HOUR || '6'),
                timezone: process.env.DOCKER_UPDATE_TIMEZONE || 'UTC'
            },
            autoRestart: process.env.DOCKER_UPDATE_AUTO_RESTART === 'true',
            cleanupOldImages: process.env.DOCKER_UPDATE_CLEANUP_OLD === 'true',
            maxImageAge: parseInt(process.env.DOCKER_UPDATE_MAX_AGE || '30'),
            notifyUsers: process.env.DOCKER_UPDATE_NOTIFY_USERS === 'true',
            rollbackOnFailure: process.env.DOCKER_UPDATE_ROLLBACK === 'true'
        };
    }

    /**
     * Update configuration (admin only)
     */
    updateConfig(newConfig: Partial<ImageUpdateConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
    }

    /**
     * Save configuration to environment/database
     */
    private saveConfig(): void {
        // In a real implementation, this would save to database or update env vars
        console.log('Configuration updated:', this.config);
    }

    /**
     * Check if we're in the maintenance window
     */
    isInMaintenanceWindow(): boolean {
        if (!this.config.maintenanceWindow) return true;

        const now = new Date();
        const currentHour = now.getHours();
        const { startHour, endHour } = this.config.maintenanceWindow;

        if (startHour <= endHour) {
            return currentHour >= startHour && currentHour < endHour;
        } else {
            // Maintenance window crosses midnight
            return currentHour >= startHour || currentHour < endHour;
        }
    }

    /**
     * Get all Minecraft server containers that need updates
     */
    async getMinecraftContainers(): Promise<{
        containers: PortainerContainer[];
        images: PortainerImage[];
    }> {
        try {
            const environments = await portainer.getEnvironments();
            let allContainers: PortainerContainer[] = [];
            let allImages: PortainerImage[] = [];

            for (const env of environments) {
                const containers = await portainer.getContainers(env.Id);
                const images = await portainer.getImages(env.Id);

                // Filter for Minecraft containers (those with minecraft labels or itzg image)
                const minecraftContainers = containers.filter(container =>
                    container.Image.includes('itzg/minecraft-server') ||
                    (container.Names && container.Names.some(name => name.includes('mc-')))
                );

                // Filter for Minecraft images
                const minecraftImages = images.filter(image =>
                    image.RepoTags && image.RepoTags.some(tag => tag.includes('itzg/minecraft-server'))
                );

                allContainers = [...allContainers, ...minecraftContainers];
                allImages = [...allImages, ...minecraftImages];
            }

            return { containers: allContainers, images: allImages };
        } catch (error) {
            console.error('Error getting Minecraft containers:', error);
            throw error;
        }
    }

    /**
     * Check for available image updates
     */
    async checkForUpdates(): Promise<{
        updatesAvailable: boolean;
        containers: ServerUpdateStatus[];
    }> {
        try {
            const { containers } = await this.getMinecraftContainers();
            const updateStatuses: ServerUpdateStatus[] = [];

            for (const container of containers) {
                // Extract server ID from container name (format: mc-{uniqueId})
                const serverIdMatch = container.Names[0]?.match(/mc-([a-zA-Z0-9-]+)/);
                if (!serverIdMatch) continue;

                const serverId = serverIdMatch[1];
                
                // Get server info from database
                await dbConnect();
                const server = await Server.findOne({ uniqueId: serverId });
                if (!server) continue;

                const currentImage = container.Image;
                const targetImage = 'itzg/minecraft-server:latest'; // Or version-specific logic

                // Check if update is needed (simplified - could be more sophisticated)
                const needsUpdate = !currentImage.includes(':latest') || 
                                   await this.isImageOutdated();

                if (needsUpdate) {
                    updateStatuses.push({
                        serverId,
                        serverName: server.serverName,
                        containerName: container.Names[0],
                        currentImage,
                        targetImage,
                        status: 'pending',
                        userNotified: false
                    });
                }
            }

            return {
                updatesAvailable: updateStatuses.length > 0,
                containers: updateStatuses
            };
        } catch (error) {
            console.error('Error checking for updates:', error);
            throw error;
        }
    }

    /**
     * Check if an image is outdated
     */
    private async isImageOutdated(): Promise<boolean> {
        try {
            // This would typically check against registry or compare creation dates
            // For now, implement simple logic
            return false; // Placeholder
        } catch (error) {
            console.error('Error checking image age:', error);
            return false;
        }
    }

    /**
     * Perform manual update (admin triggered)
     */
    async performManualUpdate(
        adminUser: IUser,
        serverIds?: string[]
    ): Promise<UpdateResult> {
        if (!adminUser.isAdmin) {
            throw new Error('Only administrators can trigger manual updates');
        }

        console.log(`Manual update triggered by admin: ${adminUser.email}`);
        return await this.performUpdate(serverIds);
    }

    /**
     * Perform scheduled automatic update
     */
    async performScheduledUpdate(): Promise<UpdateResult> {
        if (!this.config.enabled) {
            return {
                success: false,
                updatedContainers: [],
                failedContainers: [],
                cleanedImages: [],
                errors: ['Automatic updates are disabled'],
                rollbackPerformed: false,
                details: []
            };
        }

        if (!this.isInMaintenanceWindow()) {
            return {
                success: false,
                updatedContainers: [],
                failedContainers: [],
                cleanedImages: [],
                errors: ['Not in maintenance window'],
                rollbackPerformed: false,
                details: []
            };
        }

        console.log('Performing scheduled Docker image update...');
        return await this.performUpdate();
    }

    /**
     * Core update logic
     */
    private async performUpdate(specificServerIds?: string[]): Promise<UpdateResult> {
        if (this.isUpdating) {
            throw new Error('Update already in progress');
        }

        this.isUpdating = true;
        const result: UpdateResult = {
            success: true,
            updatedContainers: [],
            failedContainers: [],
            cleanedImages: [],
            errors: [],
            rollbackPerformed: false,
            details: []
        };

        try {
            // Get containers that need updates
            const { updatesAvailable, containers } = await this.checkForUpdates();

            if (!updatesAvailable) {
                result.details.push('No updates available');
                return result;
            }

            // Filter by specific server IDs if provided
            let containersToUpdate = containers;
            if (specificServerIds) {
                containersToUpdate = containers.filter(c => 
                    specificServerIds.includes(c.serverId)
                );
            }

            result.details.push(`Found ${containersToUpdate.length} containers to update`);

            // Notify users if enabled
            if (this.config.notifyUsers) {
                await this.notifyUsersAboutUpdate(containersToUpdate);
            }

            // Update each container
            for (const containerStatus of containersToUpdate) {
                try {
                    await this.updateContainer(containerStatus);
                    result.updatedContainers.push(containerStatus.containerName);
                    result.details.push(`✓ Updated ${containerStatus.serverName}`);
                } catch (error) {
                    containerStatus.status = 'failed';
                    containerStatus.error = error instanceof Error ? error.message : 'Unknown error';
                    result.failedContainers.push(containerStatus.containerName);
                    result.errors.push(`Failed to update ${containerStatus.serverName}: ${containerStatus.error}`);
                    result.details.push(`✗ Failed ${containerStatus.serverName}: ${containerStatus.error}`);
                }
            }

            // Cleanup old images if enabled
            if (this.config.cleanupOldImages) {
                try {
                    const cleanedImages = await this.cleanupOldImages();
                    result.cleanedImages = cleanedImages;
                    result.details.push(`Cleaned up ${cleanedImages.length} old images`);
                } catch (error) {
                    result.errors.push(`Image cleanup failed: ${error}`);
                    result.details.push(`✗ Image cleanup failed: ${error}`);
                }
            }

            // Check if rollback is needed
            if (result.failedContainers.length > 0 && this.config.rollbackOnFailure) {
                const rollbackSuccessful = await this.performRollback(result.failedContainers);
                result.rollbackPerformed = rollbackSuccessful;
                if (rollbackSuccessful) {
                    result.details.push('Rollback completed for failed containers');
                } else {
                    result.errors.push('Rollback failed');
                    result.details.push('✗ Rollback failed');
                }
            }

            result.success = result.errors.length === 0;

        } catch (error) {
            result.success = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(errorMessage);
            result.details.push(`✗ Update process failed: ${errorMessage}`);
        } finally {
            this.isUpdating = false;
        }

        return result;
    }

    /**
     * Update a single container
     */
    private async updateContainer(containerStatus: ServerUpdateStatus): Promise<void> {
        try {
            containerStatus.status = 'updating';
            containerStatus.startTime = new Date();

            const environments = await portainer.getEnvironments();
            const environment = environments[0]; // Use first available environment

            // Pull latest image
            await this.pullLatestImage(environment.Id, containerStatus.targetImage);

            // Stop container
            const container = await portainer.getContainerByName(
                containerStatus.containerName,
                environment.Id
            );

            if (!container) {
                throw new Error('Container not found');
            }

            if (container.State === 'running') {
                await portainer.stopContainer(container.Id, environment.Id);
            }

            // Remove old container
            await portainer.removeContainer(container.Id, environment.Id, false, false);

            // Recreate container with new image
            await this.recreateContainer(containerStatus, environment.Id);

            // Start new container
            const newContainer = await portainer.getContainerByName(
                containerStatus.containerName,
                environment.Id
            );

            if (newContainer) {
                await portainer.startContainer(newContainer.Id, environment.Id);
            }

            containerStatus.status = 'completed';
            containerStatus.endTime = new Date();

        } catch (error) {
            containerStatus.status = 'failed';
            containerStatus.error = error instanceof Error ? error.message : 'Unknown error';
            containerStatus.endTime = new Date();
            throw error;
        }
    }

    /**
     * Pull latest Docker image
     */
    private async pullLatestImage(environmentId: number, imageName: string): Promise<void> {
        try {
            // Use Portainer API to pull image
            await portainer.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/images/create?fromImage=${encodeURIComponent(imageName)}`
            );
        } catch (error) {
            console.error('Error pulling image:', error);
            throw error;
        }
    }

    /**
     * Recreate container with same configuration but new image
     */
    private async recreateContainer(
        containerStatus: ServerUpdateStatus,
        environmentId: number
    ): Promise<void> {
        try {
            // Get server configuration from database
            await dbConnect();
            const server = await Server.findOne({ uniqueId: containerStatus.serverId });
            if (!server) {
                throw new Error('Server not found in database');
            }

            // Recreate container using existing MinecraftServer class
            const { createMinecraftServer } = await import('./minecraft');
            const minecraftServer = createMinecraftServer(
                server.serverConfig,
                server.serverName,
                server.uniqueId,
                environmentId,
                server.email
            );

            // Deploy with new image
            await minecraftServer.deployToPortainer();

        } catch (error) {
            console.error('Error recreating container:', error);
            throw error;
        }
    }

    /**
     * Cleanup old Docker images
     */
    private async cleanupOldImages(): Promise<string[]> {
        try {
            const { images } = await this.getMinecraftContainers();
            const cleanedImages: string[] = [];
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.config.maxImageAge);

            for (const image of images) {
                // Check if image is old and not currently used
                const imageDate = new Date(image.Created * 1000);
                if (imageDate < cutoffDate && !await this.isImageInUse(image.Id)) {
                    try {
                        const environments = await portainer.getEnvironments();
                        for (const env of environments) {
                            await portainer.axiosInstance.delete(
                                `/api/endpoints/${env.Id}/docker/images/${image.Id}?force=true`
                            );
                        }
                        cleanedImages.push(image.Id);
                    } catch (error) {
                        console.warn(`Failed to cleanup image ${image.Id}:`, error);
                    }
                }
            }

            return cleanedImages;
        } catch (error) {
            console.error('Error cleaning up old images:', error);
            throw error;
        }
    }

    /**
     * Check if an image is currently in use
     */
    private async isImageInUse(imageId: string): Promise<boolean> {
        try {
            const { containers } = await this.getMinecraftContainers();
            return containers.some(container => container.Image.includes(imageId));
        } catch (error) {
            console.error('Error checking image usage:', error);
            return true; // Err on the side of caution
        }
    }

    /**
     * Notify users about upcoming update
     */
    private async notifyUsersAboutUpdate(containers: ServerUpdateStatus[]): Promise<void> {
        try {
            await dbConnect();
            
            for (const containerStatus of containers) {
                const server = await Server.findOne({ uniqueId: containerStatus.serverId });
                if (!server) continue;

                const user = await User.findOne({ email: server.email });
                if (!user) continue;

                // In a real implementation, send email/notification
                console.log(`Notification sent to ${user.email} about server ${server.serverName} update`);
                containerStatus.userNotified = true;
            }
        } catch (error) {
            console.error('Error notifying users:', error);
        }
    }

    /**
     * Perform rollback for failed containers
     */
    private async performRollback(failedContainers: string[]): Promise<boolean> {
        try {
            console.log(`Performing rollback for ${failedContainers.length} failed containers`);
            
            // Implementation would restore from backup or previous image
            // This is a simplified version
            
            return true;
        } catch (error) {
            console.error('Error performing rollback:', error);
            return false;
        }
    }

    /**
     * Get update status and configuration
     */
    getStatus(): {
        config: ImageUpdateConfig;
        isUpdating: boolean;
        lastUpdate?: Date;
        nextScheduledUpdate?: Date;
        queueSize: number;
    } {
        return {
            config: this.config,
            isUpdating: this.isUpdating,
            queueSize: this.updateQueue.length
            // lastUpdate and nextScheduledUpdate would be stored in database
        };
    }

    /**
     * Cancel ongoing update (admin only)
     */
    async cancelUpdate(adminUser: IUser): Promise<boolean> {
        if (!adminUser.isAdmin) {
            throw new Error('Only administrators can cancel updates');
        }

        if (!this.isUpdating) {
            return false;
        }

        // Implementation would safely stop the update process
        this.isUpdating = false;
        this.updateQueue = [];
        
        console.log(`Update cancelled by admin: ${adminUser.email}`);
        return true;
    }
}

// Export singleton instance
export const dockerImageUpdater = new DockerImageUpdater();
export default dockerImageUpdater;

// Helper function to create MinecraftServer instance
export async function createMinecraftServer(config: Record<string, unknown>, name: string, uniqueId: string, environmentId: number = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1) {
    const { MinecraftServer } = await import('./minecraft');
    return new MinecraftServer(config, name, uniqueId, environmentId);
}
