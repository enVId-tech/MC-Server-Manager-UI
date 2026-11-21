import portainer from "@/lib/server/portainer";
import Server from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";
import { FileInfo } from "@/lib/objects/ServerConfig";
import { getServerFolderPath } from "@/lib/server/serverPaths";
import { getContainerName } from '@/lib/server/containerNames';

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
    const imported = server.imported === true;
    let hasErrors = false;
    // Set when the container or stack could not be removed. The files and the database record are kept then,
    // otherwise a server that is still running would lose its data and could not be deleted again.
    let containerCleanupFailed = false;

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
                portainerEnvironmentId = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1; // Default fallback
            }
        } catch (portainerError) {
            details.push(`Warning: Could not connect to Portainer - ${portainerError instanceof Error ? portainerError.message : 'Unknown error'}`);
            hasErrors = true;
            containerCleanupFailed = true;
            portainerEnvironmentId = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1; // Default fallback
        }

        // 1. Clean up Portainer deployment (containers and stacks)
        try {
            details.push('Cleaning up Portainer deployment...');

            // Try to find and delete containers
            const containers = await portainer.getContainers(portainerEnvironmentId);
            // An imported server owns exactly one container by name; matching on parts of the name could hit others
            const matchesServer = (name: string): boolean => imported
                ? name.replace(/^\//, '') === getContainerName(server)
                : name.includes(getContainerName(server)) || name.includes(`minecraft-${server.uniqueId}`) || name.includes(server.uniqueId as string);
            const serverContainers = containers.filter(container => container.Names.some(matchesServer));

            if (serverContainers.length > 0) {
                details.push(`Found ${serverContainers.length} container(s) to remove`);

                for (const container of serverContainers) {
                    const containerName = container.Names[0];
                    const base = `/api/endpoints/${portainerEnvironmentId}/docker/containers/${container.Id}`;
                    try {
                        details.push(`Removing container: ${containerName} (${container.State})`);

                        // A server that is still starting may ignore a graceful stop for a long time, and one that
                        // keeps crashing is restarted by Docker. Kill whatever is alive instead of waiting for it.
                        if (['running', 'restarting', 'paused'].includes(container.State)) {
                            if (container.State === 'paused') {
                                await portainer.axiosInstance.post(`${base}/unpause`).catch(() => undefined);
                            }
                            await portainer.axiosInstance.post(`${base}/kill`).catch(() => undefined);
                            details.push(`Container ${containerName} killed`);
                        }

                        // force removes it even when it is not fully stopped, v removes its anonymous volumes
                        await portainer.axiosInstance.delete(`${base}?force=true&v=true`);
                        details.push(`Container ${containerName} removed successfully`);

                    } catch (containerError) {
                        details.push(`Warning: Failed to remove container ${containerName} - ${containerError instanceof Error ? containerError.message : 'Unknown error'}`);
                        hasErrors = true;
                        containerCleanupFailed = true;
                    }
                }
            } else {
                details.push('No containers found for this server');
            }

            // Try to find and delete stacks
            const stacks = await portainer.getStacks();
            // The stack of an imported server was not made here and may hold other services, so it is left alone
            const serverStacks = imported ? [] : stacks.filter(stack =>
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
                        containerCleanupFailed = true;
                    }
                }
            } else {
                details.push('No stacks found for this server');
            }

            // Make sure nothing of this server is left running
            const remaining = (await portainer.getContainers(portainerEnvironmentId)).filter(container =>
                container.Names.some(matchesServer)
            );
            if (remaining.length > 0) {
                details.push(`Warning: ${remaining.length} container(s) of this server are still present`);
                hasErrors = true;
                containerCleanupFailed = true;
            }

        } catch (portainerCleanupError) {
            details.push(`Warning: Portainer cleanup failed - ${portainerCleanupError instanceof Error ? portainerCleanupError.message : 'Unknown error'}`);
            hasErrors = true;
            containerCleanupFailed = true;
        }

        // 2. Take the server out of every proxy it is in
        try {
            details.push('Removing the server from its proxies...');
            const { unlinkServerFromNetwork } = await import('@/lib/server/network/service');
            const record = await Server.findOne({ uniqueId: server.uniqueId });
            if (record) {
                details.push(...await unlinkServerFromNetwork(record, { environmentId: portainerEnvironmentId }));
            }
        } catch (proxyCleanupError) {
            details.push(`Warning: Proxy cleanup failed - ${proxyCleanupError instanceof Error ? proxyCleanupError.message : 'Unknown error'}`);
            hasErrors = true;
        }

        if (containerCleanupFailed) {
            details.push('The server files and database record were kept because its container could not be removed. Check the connection to Portainer and try again.');

            return {
                success: false,
                error: 'The server container could not be removed, so nothing else was deleted. Please try again.',
                details
            };
        }

        if (imported) {
            // The folder of an imported server existed before this app. It is never renamed or deleted here.
            details.push('The server files were left where they are (this server was imported).');
        } else if (!process.env.DELETE_SERVER_FOLDERS || process.env.DELETE_SERVER_FOLDERS.toLowerCase() !== 'true') {
            // 3. Rename WebDAV server folder instead of deleting
            try {
                details.push('Renaming server files directory...');

                const serverStorage = await import('@/lib/server/storage');
                const serverBasePath = getServerFolderPath(server as { uniqueId: string; folderPath?: string }, user.email);

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const deletedFolderPath = `${serverBasePath.substring(0, serverBasePath.lastIndexOf('/'))}/DELETED-${reason}-${timestamp}-${server.uniqueId}`;

                const exists = await serverStorage.default.exists(serverBasePath);
                if (exists) {
                    await serverStorage.default.moveDirectory(serverBasePath, deletedFolderPath);
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
                const serverStorage = await import('@/lib/server/storage');
                const serverBasePath = getServerFolderPath(server as { uniqueId: string; folderPath?: string }, user.email);

                await serverStorage.default.deleteDirectory(serverBasePath);
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
