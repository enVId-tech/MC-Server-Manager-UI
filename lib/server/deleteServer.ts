import portainer from "@/lib/server/portainer";
import Server from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";
import { FileInfo } from "@/lib/objects/ServerConfig";

interface DatabaseServerConfig {
    name: string;
    serverType: string;
    version: string;
    description?: string;
    gameMode: string;
    difficulty: string;
    worldType: string;
    worldGeneration: string;
    maxPlayers: number;
    whitelistEnabled: boolean;
    onlineMode: boolean;
    pvpEnabled: boolean;
    commandBlocksEnabled: boolean;
    flightEnabled: boolean;
    spawnAnimalsEnabled: boolean;
    spawnMonstersEnabled: boolean;
    spawnNpcsEnabled: boolean;
    generateStructuresEnabled: boolean;
    port: number;
    viewDistance: number;
    simulationDistance: number;
    spawnProtection: number;
    rconEnabled: boolean;
    rconPassword: string;
    motd: string;
    resourcePackUrl?: string;
    resourcePackSha1?: string;
    resourcePackPrompt?: string;
    forceResourcePack: boolean;
    enableJmxMonitoring: boolean;
    syncChunkWrites: boolean;
    enforceWhitelist: boolean;
    preventProxyConnections: boolean;
    hideOnlinePlayers: boolean;
    broadcastRconToOps: boolean;
    broadcastConsoleToOps: boolean;
    serverMemory: number;
    plugins?: FileInfo[];
    mods?: FileInfo[];
    worldFiles?: FileInfo;
}

/**
 * Comprehensive server cleanup and deletion utility
 */
export async function deleteServer(serverId: string, server: Record<string, unknown>, user: IUser, reason: string = 'manual-deletion'): Promise<{
    success: boolean;
    error?: string;
    details?: string[];
}> {
    const details: string[] = [];
    let hasErrors = false;

    try {
        details.push('Starting comprehensive server deletion...');

        // Get Portainer environment
        let portainerEnvironmentId: number;
        try {
            const environments = await portainer.getEnvironments();
            if (environments.length > 0) {
                const availableEnvironment = environments[0];
                portainer.DefaultEnvironmentId = availableEnvironment.Id;
                portainerEnvironmentId = availableEnvironment.Id;
                details.push(`Using Portainer environment: ${availableEnvironment.Id} (${availableEnvironment.Name})`);
            } else {
                details.push('No Portainer environments found - skipping container cleanup');
                portainerEnvironmentId = 1; // Default fallback
            }
        } catch (portainerError) {
            details.push(`Warning: Could not connect to Portainer - ${portainerError instanceof Error ? portainerError.message : 'Unknown error'}`);
            hasErrors = true;
            portainerEnvironmentId = 1; // Default fallback
        }

        // 1. Clean up Portainer deployment (containers and stacks)
        try {
            details.push('Cleaning up Portainer deployment...');

            // Try to find and delete containers
            const containers = await portainer.getContainers(portainerEnvironmentId);
            const serverContainers = containers.filter(container =>
                container.Names.some(name =>
                    name.includes(`mc-${server.uniqueId}`) ||
                    name.includes(`minecraft-${server.uniqueId}`) ||
                    name.includes(server.uniqueId as string)
                )
            );

            if (serverContainers.length > 0) {
                details.push(`Found ${serverContainers.length} container(s) to remove`);

                for (const container of serverContainers) {
                    try {
                        const containerName = container.Names[0];
                        details.push(`Removing container: ${containerName}`);

                        // Stop container if running
                        if (container.State === 'running') {
                            await portainer.axiosInstance.post(
                                `/api/endpoints/${portainerEnvironmentId}/docker/containers/${container.Id}/stop`
                            );
                            details.push(`Container ${containerName} stopped`);
                        }

                        // Remove container
                        await portainer.axiosInstance.delete(
                            `/api/endpoints/${portainerEnvironmentId}/docker/containers/${container.Id}`
                        );
                        details.push(`Container ${containerName} removed successfully`);

                    } catch (containerError) {
                        details.push(`Warning: Failed to remove container ${container.Names[0]} - ${containerError instanceof Error ? containerError.message : 'Unknown error'}`);
                        hasErrors = true;
                    }
                }
            } else {
                details.push('No containers found for this server');
            }

            // Try to find and delete stacks
            const stacks = await portainer.getStacks();
            const serverStacks = stacks.filter(stack =>
                stack.Name === `minecraft-${server.uniqueId}` ||
                stack.Name.includes(server.uniqueId as string)
            );

            if (serverStacks.length > 0) {
                details.push(`Found ${serverStacks.length} stack(s) to remove`);

                for (const stack of serverStacks) {
                    try {
                        details.push(`Removing stack: ${stack.Name}`);
                        await portainer.deleteStack(stack.Id, portainerEnvironmentId);
                        details.push(`Stack ${stack.Name} removed successfully`);

                    } catch (stackError) {
                        details.push(`Warning: Failed to remove stack ${stack.Name} - ${stackError instanceof Error ? stackError.message : 'Unknown error'}`);
                        hasErrors = true;
                    }
                }
            } else {
                details.push('No stacks found for this server');
            }

        } catch (portainerCleanupError) {
            details.push(`Warning: Portainer cleanup failed - ${portainerCleanupError instanceof Error ? portainerCleanupError.message : 'Unknown error'}`);
            hasErrors = true;
        }

        // 2. Clean up Velocity configuration
        try {
            details.push('Cleaning up Velocity configuration...');
            
            // Check if Velocity integration is enabled
            if (process.env.VELOCITY_CONFIG_PATH && process.env.VELOCITY_NETWORK_NAME) {
                const velocityService = await import('@/lib/server/velocity');
                
                // Try to remove the server from Velocity configuration
                const serverName = server.serverName as string || `mc-${server.uniqueId}`;
                const removalResult = await velocityService.default.removeServerFromVelocityConfig(
                    serverName,
                    server.uniqueId as string
                );
                
                if (removalResult.success) {
                    details.push('Successfully removed server from Velocity configuration');
                    if (removalResult.details) {
                        details.push(...removalResult.details);
                    }
                } else {
                    details.push(`Warning: Velocity configuration cleanup failed - ${removalResult.error || 'Unknown error'}`);
                    if (removalResult.details) {
                        details.push(...removalResult.details);
                    }
                    hasErrors = true;
                }
            } else {
                details.push('Velocity integration not configured - skipping Velocity cleanup');
            }
            
        } catch (velocityCleanupError) {
            details.push(`Warning: Velocity cleanup failed - ${velocityCleanupError instanceof Error ? velocityCleanupError.message : 'Unknown error'}`);
            hasErrors = true;
        }

        if (!process.env.DELETE_SERVER_FOLDERS || process.env.DELETE_SERVER_FOLDERS.toLowerCase() !== 'true') {
            // 3. Rename WebDAV server folder instead of deleting
            try {
                details.push('Renaming server files directory...');

                const webdavService = await import('@/lib/server/webdav');
                const userEmail = user.email.split('@')[0] || 'default-user';
                const serverBasePath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${userEmail}/${server.uniqueId}`;

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const deletedFolderPath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${userEmail}/DELETED-${reason}-${timestamp}-${server.uniqueId}`;

                const exists = await webdavService.default.exists(serverBasePath);
                if (exists) {
                    await webdavService.default.moveDirectory(serverBasePath, deletedFolderPath);
                    details.push(`Server folder renamed from: ${serverBasePath}`);
                    details.push(`Server folder renamed to: ${deletedFolderPath}`);
                } else {
                    details.push(`Server files directory not found: ${serverBasePath}`);
                }

            } catch (webdavError) {
                details.push(`Warning: WebDAV folder rename failed - ${webdavError instanceof Error ? webdavError.message : 'Unknown error'}`);
                hasErrors = true;
            }
        } else {
            // 3. Delete WebDAV server folder
            try {
                details.push('Deleting server files directory...');
                const webdavService = await import('@/lib/server/webdav');
                const userEmail = user.email.split('@')[0] || 'default-user';
                const serverBasePath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${userEmail}/${server.uniqueId}`;

                await webdavService.default.deleteDirectory(serverBasePath);
                details.push(`Server folder deleted: ${serverBasePath}`);
            } catch (webdavError) {
                details.push(`Warning: WebDAV folder delete failed - ${webdavError instanceof Error ? webdavError.message : 'Unknown error'}`);
                hasErrors = true;
            }
        }

        // 4. Clean up local temporary files
        try {
            details.push('Cleaning up temporary files...');

            const serverConfig = server.serverConfig as DatabaseServerConfig;
            if (serverConfig) {
                const path = await import('path');
                const fs = await import('fs/promises');
                const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
                const userUploadDir = path.join(UPLOAD_DIR, user.email);

                // Check if upload directory exists
                try {
                    await fs.access(userUploadDir);

                    // List files to delete
                    const filesToDelete: string[] = [];

                    // Check for world files
                    if (serverConfig.worldFiles) {
                        const worldFilePath = path.join(userUploadDir, (serverConfig.worldFiles as FileInfo).filename);
                        try {
                            await fs.access(worldFilePath);
                            filesToDelete.push(worldFilePath);
                        } catch {
                            // File doesn't exist, skip
                        }
                    }

                    // Check for plugin files
                    if (serverConfig.plugins && Array.isArray(serverConfig.plugins)) {
                        for (const plugin of serverConfig.plugins) {
                            const pluginFilePath = path.join(userUploadDir, (plugin as FileInfo).filename);
                            try {
                                await fs.access(pluginFilePath);
                                filesToDelete.push(pluginFilePath);
                            } catch {
                                // File doesn't exist, skip
                            }
                        }
                    }

                    // Check for mod files
                    if (serverConfig.mods && Array.isArray(serverConfig.mods)) {
                        for (const mod of serverConfig.mods) {
                            const modFilePath = path.join(userUploadDir, (mod as FileInfo).filename);
                            try {
                                await fs.access(modFilePath);
                                filesToDelete.push(modFilePath);
                            } catch {
                                // File doesn't exist, skip
                            }
                        }
                    }

                    // Delete found files
                    for (const filePath of filesToDelete) {
                        try {
                            await fs.unlink(filePath);
                            details.push(`Deleted temporary file: ${filePath}`);
                        } catch (deleteError) {
                            details.push(`Warning: Could not delete ${filePath} - ${deleteError instanceof Error ? deleteError.message : 'Unknown error'}`);
                            hasErrors = true;
                        }
                    }

                    if (filesToDelete.length === 0) {
                        details.push('No temporary files found to delete');
                    }

                } catch {
                    details.push('No temporary files directory found');
                }
            }

        } catch (tempCleanupError) {
            details.push(`Warning: Temporary file cleanup failed - ${tempCleanupError instanceof Error ? tempCleanupError.message : 'Unknown error'}`);
            hasErrors = true;
        }

        // 5. Delete server record from database
        try {
            details.push('Deleting server record from database...');

            const deletedServer = await Server.findOneAndDelete({ uniqueId: serverId });

            if (deletedServer) {
                details.push(`Server record deleted from database: ${deletedServer.serverName || serverId}`);
            } else {
                details.push('Server record not found in database (may have already been deleted)');
            }

        } catch (dbError) {
            details.push(`Error: Database deletion failed - ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
            hasErrors = true;
        }

        details.push('Server deletion completed');

        return {
            success: !hasErrors,
            details,
            ...(hasErrors && { error: 'Some cleanup operations failed - check details for more information' })
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        details.push(`Fatal error during server deletion: ${errorMessage}`);

        return {
            success: false,
            error: errorMessage,
            details
        };
    }
}
