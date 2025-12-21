import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Server, { IServer } from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";
import BodyParser from "@/lib/db/bodyParser";
import portainer from "@/lib/server/portainer";
import MinecraftServerManager from "@/lib/server/serverManager";
import { createMinecraftServer, convertClientConfigToServerConfig, ClientServerConfig } from "@/lib/server/minecraft";
import verificationService from "@/lib/server/verify";
import velocityService from "@/lib/server/velocity";
import { FileInfo } from "@/lib/objects/ServerConfig";
import { definedProxies } from "@/lib/config/proxies";
import { proxyManager } from "@/lib/server/proxy-manager";
import { promises as fs } from 'fs';
import path from 'path';

// Interface for server config as stored in database (with FileInfo instead of AnalyzedFile)
interface DatabaseServerConfig {
    name: string;
    serverType: string;
    version: string;
    description?: string;
    seed?: string;
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
    serverProperties?: Record<string, string | number | boolean>;
    plugins?: FileInfo[];
    mods?: FileInfo[];
    worldFiles?: FileInfo;
}

export interface DeploymentStep {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    message?: string;
    error?: string;
}

export interface DeploymentStatus {
    serverId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    currentStep: string;
    steps: DeploymentStep[];
    error?: string;
}

// Store deployment statuses in memory (in production, use Redis or database)
const deploymentStatuses = new Map<string, DeploymentStatus>();

/**
 * Cleanup temporary files after successful deployment
 */
async function cleanupTemporaryFiles(serverConfig: DatabaseServerConfig, userEmail: string): Promise<void> {
    try {
        const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
        const userUploadDir = path.join(UPLOAD_DIR, userEmail);

        console.log(`Starting cleanup of temporary files in: ${userUploadDir}`);

        // Check if user upload directory exists
        try {
            await fs.access(userUploadDir);
        } catch {
            console.log('No temporary files to cleanup - upload directory does not exist');
            return;
        }

        const filesToDelete: string[] = [];

        // Add world file paths to deletion list
        if (serverConfig.worldFiles && serverConfig.worldFiles.filename) {
            const worldFilePath = path.join(userUploadDir, serverConfig.worldFiles.filename);
            filesToDelete.push(worldFilePath);
            console.log(`Marked world file for deletion: ${worldFilePath}`);
        }

        // Add plugin file paths to deletion list
        if (serverConfig.plugins && Array.isArray(serverConfig.plugins)) {
            for (const plugin of serverConfig.plugins) {
                if (plugin.filename) {
                    const pluginFilePath = path.join(userUploadDir, plugin.filename);
                    filesToDelete.push(pluginFilePath);
                    console.log(`Marked plugin file for deletion: ${pluginFilePath}`);
                }
            }
        }

        // Add mod file paths to deletion list
        if (serverConfig.mods && Array.isArray(serverConfig.mods)) {
            for (const mod of serverConfig.mods) {
                if (mod.filename) {
                    const modFilePath = path.join(userUploadDir, mod.filename);
                    filesToDelete.push(modFilePath);
                    console.log(`Marked mod file for deletion: ${modFilePath}`);
                }
            }
        }

        // Delete all marked files
        let deletedCount = 0;
        for (const filePath of filesToDelete) {
            try {
                await fs.unlink(filePath);
                deletedCount++;
                console.log(`Deleted temporary file: ${filePath}`);
            } catch (error) {
                console.warn(`Failed to delete temporary file ${filePath}:`, error);
            }
        }

        // Try to remove the user upload directory if it's empty
        try {
            const remainingFiles = await fs.readdir(userUploadDir);
            if (remainingFiles.length === 0) {
                await fs.rmdir(userUploadDir);
                console.log(`Removed empty upload directory: ${userUploadDir}`);
            } else {
                console.log(`Upload directory not empty, keeping: ${userUploadDir} (${remainingFiles.length} files remaining)`);
            }
        } catch (error) {
            console.warn(`Failed to remove upload directory ${userUploadDir}:`, error);
        }

        console.log(`Cleanup completed. Deleted ${deletedCount} temporary files.`);
    } catch (error) {
        console.error('Error during temporary file cleanup:', error);
        // Don't throw the error - cleanup failure shouldn't break deployment
    }
}

// Deploy server with step-by-step tracking
export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        const { serverId } = await BodyParser.parseAuto(request);

        if (!serverId) {
            return NextResponse.json({ error: "Server ID is required." }, { status: 400 });
        }

        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Find the server
        const server = await Server.findOne({
            uniqueId: serverId,
            email: user.email
        });

        console.log(`Looking for server with uniqueId: ${serverId} and email: ${user.email}`);

        if (!server) {
            console.log(`Server not found in database for uniqueId: ${serverId}`);
            return NextResponse.json({ error: "Server not found." }, { status: 404 });
        }

        console.log(`Server found: ${server.serverName} (${server.uniqueId})`);
        console.log(`Server port: ${server.port}, RCON port: ${server.rconPort}`);
        console.log(`Server config exists: ${!!server.serverConfig}`);

        // Check what steps need to be performed based on server state
        const hasPort = !!server.port;
        const hasFolder = true; // Assume folder exists if server was created with new flow

        console.log(`Server has port: ${hasPort}, has folder: ${hasFolder}`);

        // Initialize deployment status with conditional steps
        const steps: DeploymentStep[] = [
            { id: 'prerequisites', name: 'Checking infrastructure prerequisites', status: 'running', progress: 0 },
            { id: 'validate', name: 'Validating configuration', status: 'pending', progress: 0 }
        ];

        if (!hasPort) {
            steps.push(
                { id: 'subdomain', name: 'Validating subdomain', status: 'pending', progress: 0 },
                { id: 'ports', name: 'Allocating ports', status: 'pending', progress: 0 }
            );
        }

        if (!hasFolder) {
            steps.push({ id: 'folder', name: 'Creating server folders', status: 'pending', progress: 0 });
        }

        steps.push(
            { id: 'docker', name: 'Generating Docker configuration', status: 'pending', progress: 0 },
            { id: 'deploy', name: 'Deploying to container platform', status: 'pending', progress: 0 },
            { id: 'files', name: 'Setting up file directories', status: 'pending', progress: 0 },
            { id: 'upload', name: 'Uploading server files', status: 'pending', progress: 0 },
            { id: 'velocity', name: 'Configuring Velocity proxy integration', status: 'pending', progress: 0 },
            { id: 'finalize', name: 'Finalizing deployment', status: 'pending', progress: 0 }
        );

        const initialStatus: DeploymentStatus = {
            serverId: serverId,
            status: 'running',
            progress: 0,
            currentStep: 'Initializing deployment...',
            steps: steps
        };

        deploymentStatuses.set(serverId, initialStatus);

        // Start deployment process asynchronously
        deployServer(serverId, server, user).catch(error => {
            console.error('Deployment error:', error);
            const status = deploymentStatuses.get(serverId);
            if (status) {
                status.status = 'failed';
                status.error = error.message;
                deploymentStatuses.set(serverId, status);
            }
        });

        return NextResponse.json({
            message: "Deployment started",
            serverId: serverId
        }, { status: 200 });

    } catch (error) {
        console.error("Error starting deployment:", error);
        return NextResponse.json({
            error: "Failed to start deployment.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Get deployment status
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const serverId = url.searchParams.get('serverId');

        if (!serverId) {
            return NextResponse.json({ error: "Server ID is required." }, { status: 400 });
        }

        const status = deploymentStatuses.get(serverId);
        if (!status) {
            return NextResponse.json({ error: "Deployment status not found." }, { status: 404 });
        }

        return NextResponse.json(status, { status: 200 });

    } catch (error) {
        console.error("Error getting deployment status:", error);
        return NextResponse.json({
            error: "Failed to get deployment status.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

async function updateStep(serverId: string, stepId: string, status: 'running' | 'completed' | 'failed', progress: number, message?: string, error?: string) {
    const deploymentStatus = deploymentStatuses.get(serverId);
    if (!deploymentStatus) return;

    const step = deploymentStatus.steps.find(s => s.id === stepId);
    if (step) {
        step.status = status;
        step.progress = progress;
        if (message) step.message = message;
        if (error) step.error = error;
    }

    // Update overall progress
    const completedSteps = deploymentStatus.steps.filter(s => s.status === 'completed').length;
    const runningSteps = deploymentStatus.steps.filter(s => s.status === 'running').length;
    const totalSteps = deploymentStatus.steps.length;

    // Calculate progress more accurately
    const runningProgress = runningSteps > 0 ? 0.5 : 0; // Give 50% credit for running steps
    deploymentStatus.progress = Math.round(((completedSteps + runningProgress) / totalSteps) * 100);

    // Update current step
    const currentRunningStep = deploymentStatus.steps.find(s => s.status === 'running');
    if (currentRunningStep) {
        deploymentStatus.currentStep = message || currentRunningStep.name;
    } else if (status === 'completed' && completedSteps === totalSteps) {
        deploymentStatus.currentStep = 'Deployment completed successfully!';
    }

    deploymentStatuses.set(serverId, deploymentStatus);

    // Log progress for debugging
    console.log(`[${serverId}] Step ${stepId}: ${status} (${progress}%) - ${message || ''}`);
}

async function deployServer(serverId: string, server: IServer, user: IUser) {
    const rollbackActions: (() => Promise<void>)[] = [];

    console.log(`=== Starting deployment for server ${serverId} ===`);
    console.log(`User email: ${user.email}`);
    console.log(`Server name: ${server.serverName}`);
    console.log(`Server subdomain: ${server.subdomainName}`);

    try {
        // Dynamically get Portainer environment - fail if not available
        let portainerEnvironmentId: number;
        try {
            console.log('Connecting to Portainer...');
            const environments = await portainer.getEnvironments();
            console.log(`Found ${environments.length} Portainer environments`);

            if (environments.length === 0) {
                throw new Error('No Portainer environments found');
            }

            // Use configured environment or fallback to first available
            const configuredEnvId = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null;
            
            let availableEnvironment;
            if (configuredEnvId) {
                availableEnvironment = environments.find(e => e.Id === configuredEnvId);
                if (!availableEnvironment) {
                    console.warn(`Configured environment ID ${configuredEnvId} not found, falling back to first available.`);
                    availableEnvironment = environments[0];
                }
            } else {
                availableEnvironment = environments[0];
            }

            portainer.DefaultEnvironmentId = availableEnvironment.Id;
            portainerEnvironmentId = availableEnvironment.Id;
            console.log(`Deploy using Portainer environment: ${availableEnvironment.Id} (${availableEnvironment.Name})`);

        } catch (error) {
            console.error('Portainer connection failed:', error);
            throw new Error(`Failed to connect to Portainer: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Check if server already has allocated ports and folder from new creation flow
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasPort = !!(server as any).port;
        const hasFolder = true; // New servers created with updated flow have folders
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allocatedPort = (server as any).port;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allocatedRconPort = (server as any).rconPort;

        // Step 0: Check infrastructure prerequisites (Velocity proxies)
        // This runs for ALL users to ensure proxy configuration is synced
        await updateStep(serverId, 'prerequisites', 'running', 0, 'Checking infrastructure prerequisites...');

        try {
            // ALWAYS sync proxies on server creation for ALL users
            // This ensures YAML config matches Portainer state
            await updateStep(serverId, 'prerequisites', 'running', 75, 'Syncing Velocity proxies with configuration...');
            
            // Ensure Velocity proxies are running and synced with YAML
            const proxyDetails = await proxyManager.ensureProxies(portainerEnvironmentId);
            
            if (proxyDetails.length > 0) {
                console.log('Proxy sync details:', proxyDetails);
                await updateStep(serverId, 'prerequisites', 'completed', 100, 'Infrastructure synced successfully');
            } else {
                await updateStep(serverId, 'prerequisites', 'completed', 100, 'Infrastructure verified (no proxies configured)');
            }
            
        } catch (prereqError) {
            console.error('Prerequisites check failed:', prereqError);
            // Don't fail deployment - just warn and continue
            await updateStep(serverId, 'prerequisites', 'completed', 100, `Prerequisites check warning: ${prereqError instanceof Error ? prereqError.message : 'Unknown error'}`);
        }

        // Step 1: Validate configuration
        await updateStep(serverId, 'validate', 'running', 0, 'Validating server configuration...');

        // Extract server config with proper typing
        const serverConfig = server.serverConfig as DatabaseServerConfig;
        if (!serverConfig) {
            throw new Error('Server configuration is missing');
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        await updateStep(serverId, 'validate', 'completed', 100, 'Configuration validated successfully');

        // Step 2: Validate subdomain (only if no port allocated yet)
        if (!hasPort) {
            await updateStep(serverId, 'subdomain', 'running', 0, 'Validating subdomain availability...');

            const subdomainValidation = await MinecraftServerManager.validateSubdomain(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (server as any).subdomainName,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (server as any).email
            );

            if (!subdomainValidation.isValid) {
                await updateStep(serverId, 'subdomain', 'failed', 0, 'Subdomain validation failed', subdomainValidation.error);
                throw new Error(`Subdomain validation failed: ${subdomainValidation.error}`);
            }

            await updateStep(serverId, 'subdomain', 'completed', 100,
                subdomainValidation.isReserved ? 'Reserved subdomain approved for admin use' : 'Subdomain available'
            );

            // Step 3: Allocate ports (only if not already allocated)
            await updateStep(serverId, 'ports', 'running', 0, 'Allocating server ports...');

            const portAllocation = await MinecraftServerManager.allocatePort(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (server as any).email,
                serverConfig.rconEnabled || false,
                portainerEnvironmentId
            );

            if (!portAllocation.success) {
                await updateStep(serverId, 'ports', 'failed', 0, 'Port allocation failed', portAllocation.error);
                throw new Error(`Port allocation failed: ${portAllocation.error}`);
            }

            // Update server with allocated ports
            await Server.findOneAndUpdate(
                { uniqueId: serverId },
                {
                    port: portAllocation.port,
                    rconPort: portAllocation.rconPort
                }
            );

            allocatedPort = portAllocation.port;
            allocatedRconPort = portAllocation.rconPort;

            // Add rollback action for port allocation
            rollbackActions.push(async () => {
                console.log(`Rolling back port allocation for server ${serverId}`);
                try {
                    // Remove ports from server record
                    await Server.findOneAndUpdate(
                        { uniqueId: serverId },
                        {
                            $unset: { port: 1, rconPort: 1 }
                        }
                    );

                    console.log(`Ports ${allocatedPort} and ${allocatedRconPort || 'N/A'} removed from server ${serverId} record`);
                } catch (portRollbackError) {
                    console.warn('Error during port rollback:', portRollbackError);
                }
            });

            const portMessage = allocatedRconPort
                ? `Allocated ports: ${allocatedPort} (game), ${allocatedRconPort} (RCON)`
                : `Allocated port: ${allocatedPort}`;
            await updateStep(serverId, 'ports', 'completed', 100, portMessage);
        }

        // Step 4: Create server folder structure (only if not already created)
        if (!hasFolder) {
            await updateStep(serverId, 'folder', 'running', 0, 'Creating server folder structure...');

            const folderResult = await MinecraftServerManager.createServerFolder(
                server.uniqueId,
                user.email,
                server.serverConfig?.serverType
            );

            if (!folderResult.success) {
                await updateStep(serverId, 'folder', 'failed', 0, 'Failed to create server folders', folderResult.error);
                throw new Error(`Failed to create server folders: ${folderResult.error}`);
            }

            // Add rollback action for folder creation
            if (folderResult.rollbackAction) {
                rollbackActions.push(folderResult.rollbackAction);
            }

            await updateStep(serverId, 'folder', 'completed', 100, 'Server folder structure created');
        }

        // Step 5: Generate Docker configuration
        await updateStep(serverId, 'docker', 'running', 0, 'Generating Docker configuration...');

        // Update server config with allocated ports for Docker generation
        const updatedClientConfig: ClientServerConfig = {
            name: server.serverConfig.name,
            serverType: server.serverConfig.serverType,
            version: server.serverConfig.version,
            description: server.serverConfig.description || '',
            seed: server.serverConfig.seed || '',
            gameMode: server.serverConfig.gameMode,
            difficulty: server.serverConfig.difficulty,
            worldType: server.serverConfig.worldType,
            worldGeneration: server.serverConfig.worldGeneration,
            maxPlayers: server.serverConfig.maxPlayers,
            whitelistEnabled: server.serverConfig.whitelistEnabled,
            onlineMode: server.serverConfig.onlineMode,
            pvpEnabled: server.serverConfig.pvpEnabled,
            commandBlocksEnabled: server.serverConfig.commandBlocksEnabled,
            flightEnabled: server.serverConfig.flightEnabled,
            spawnAnimalsEnabled: server.serverConfig.spawnAnimalsEnabled,
            spawnMonstersEnabled: server.serverConfig.spawnMonstersEnabled,
            spawnNpcsEnabled: server.serverConfig.spawnNpcsEnabled,
            generateStructuresEnabled: server.serverConfig.generateStructuresEnabled,
            port: allocatedPort!,
            rconPort: allocatedRconPort,
            viewDistance: server.serverConfig.viewDistance,
            simulationDistance: server.serverConfig.simulationDistance,
            spawnProtection: server.serverConfig.spawnProtection,
            rconEnabled: server.serverConfig.rconEnabled,
            rconPassword: server.serverConfig.rconPassword,
            motd: server.serverConfig.motd,
            resourcePackUrl: server.serverConfig.resourcePackUrl || '',
            resourcePackSha1: server.serverConfig.resourcePackSha1 || '',
            resourcePackPrompt: server.serverConfig.resourcePackPrompt || '',
            forceResourcePack: server.serverConfig.forceResourcePack,
            enableJmxMonitoring: server.serverConfig.enableJmxMonitoring,
            syncChunkWrites: server.serverConfig.syncChunkWrites,
            enforceWhitelist: server.serverConfig.enforceWhitelist,
            preventProxyConnections: server.serverConfig.preventProxyConnections,
            hideOnlinePlayers: server.serverConfig.hideOnlinePlayers,
            broadcastRconToOps: server.serverConfig.broadcastRconToOps,
            broadcastConsoleToOps: server.serverConfig.broadcastConsoleToOps,
            serverMemory: server.serverConfig.serverMemory,
            plugins: [],
            mods: [],
            subdomain: server.subdomainName.replace('.etran.dev', '')
        };

        const minecraftConfig = convertClientConfigToServerConfig(updatedClientConfig);
        
        // Ensure SUBDOMAIN is set in the config for proxy routing
        minecraftConfig.SUBDOMAIN = server.subdomainName.replace('.etran.dev', '');

        const updatedMinecraftServer = createMinecraftServer(
            minecraftConfig,
            server.serverName,
            server.uniqueId,
            portainerEnvironmentId,
            user.email,
            server.proxyIds || []
        );

        await new Promise(resolve => setTimeout(resolve, 800));
        await updateStep(serverId, 'docker', 'completed', 100, 'Docker configuration generated');

        // Step 6: Deploy to Portainer
        await updateStep(serverId, 'deploy', 'running', 0, 'Deploying server to container platform...');

        console.log(`Starting Portainer deployment for server ${serverId}`);
        console.log(`Using environment ID: ${portainerEnvironmentId}`);
        console.log(`Server name: ${server.serverName}`);
        console.log(`Unique ID: ${server.uniqueId}`);

        const deployResult = await updatedMinecraftServer.deployToPortainer();

        console.log(`Portainer deployment result:`, deployResult);

        if (!deployResult.success) {
            console.log(`Portainer deployment failed: ${deployResult.error}`);
            // Try fallback deployment method
            console.log('Portainer deployment failed, trying Docker Compose fallback...');
            await updateStep(serverId, 'deploy', 'running', 50, 'Portainer failed, trying fallback deployment...');

            const fallbackResult = await updatedMinecraftServer.deployToDockerCompose(user.email);

            console.log(`Fallback deployment result:`, fallbackResult);

            if (!fallbackResult.success) {
                console.log(`Fallback deployment also failed: ${fallbackResult.error}`);
                await updateStep(serverId, 'deploy', 'failed', 0, 'All deployment methods failed',
                    `Portainer: ${deployResult.error}, Fallback: ${fallbackResult.error}`);
                throw new Error(`All deployment methods failed. Portainer: ${deployResult.error}, Fallback: ${fallbackResult.error}`);
            }

            await updateStep(serverId, 'deploy', 'completed', 100,
                `Deployment completed using Docker Compose fallback. File: ${fallbackResult.composeFile}`);
        } else {
            console.log('Portainer deployment successful');
            await updateStep(serverId, 'deploy', 'completed', 100, 'Server deployed successfully to Portainer');
        }

        // Add comprehensive rollback action for deployment cleanup
        rollbackActions.push(async () => {
            console.log(`Rolling back deployment for server ${serverId}`);
            try {
                // Clean up Portainer resources without deleting the database record
                const portainerEnvironments = await portainer.getEnvironments();
                if (portainerEnvironments.length > 0) {
                    const environmentId = portainerEnvironments[0].Id;

                    // Clean up containers
                    const containers = await portainer.getContainers(environmentId);
                    const serverContainers = containers.filter(container =>
                        container.Names.some(name => name.includes(serverId))
                    );

                    for (const container of serverContainers) {
                        try {
                            if (container.State === 'running') {
                                await portainer.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${container.Id}/stop`);
                            }
                            await portainer.axiosInstance.delete(`/api/endpoints/${environmentId}/docker/containers/${container.Id}`);
                            console.log(`Cleaned up container: ${container.Names[0]}`);
                        } catch (containerError) {
                            console.warn(`Failed to clean up container ${container.Names[0]}:`, containerError);
                        }
                    }

                    // Clean up stacks
                    const stacks = await portainer.getStacks();
                    const serverStacks = stacks.filter(stack => stack.Name.includes(serverId));

                    for (const stack of serverStacks) {
                        try {
                            await portainer.deleteStack(stack.Id, environmentId);
                            console.log(`Cleaned up stack: ${stack.Name}`);
                        } catch (stackError) {
                            console.warn(`Failed to clean up stack ${stack.Name}:`, stackError);
                        }
                    }
                }

                console.log('Deployment rollback completed - server record preserved');

            } catch (error) {
                console.warn('Error during deployment rollback:', error);
            }
        });

        // Step 7: Verify deployment and wait for container to be ready
        await updateStep(serverId, 'files', 'running', 0, 'Verifying container deployment...');

        // Wait a bit for the container to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if container is actually running
        const statusCheck = await updatedMinecraftServer.getServerStatus();
        if (statusCheck.running) {
            await updateStep(serverId, 'files', 'completed', 100, 'Container is running and ready');
        } else {
            // Container might still be starting up, that's okay
            await updateStep(serverId, 'files', 'completed', 100, 'Container deployment verified');
        }

        // Step 8: Upload files (server.properties, plugins, mods, world files)
        await updateStep(serverId, 'upload', 'running', 0, 'Preparing file uploads...');

        try {
            // Type the server config properly
            // Note: When retrieved from database, plugins/mods/worldFiles are FileInfo, not AnalyzedFile
            const serverConfig = server.serverConfig as DatabaseServerConfig;

            let uploadProgress = 10;

            // Upload server.properties file
            if (serverConfig.serverProperties && Object.keys(serverConfig.serverProperties).length > 0) {
                await updateStep(serverId, 'upload', 'running', uploadProgress, 'Uploading server.properties...');

                // Convert server properties to properties file format
                const { convertToServerPropertiesFormat } = await import('@/lib/data/serverProperties');
                const propertiesContent = convertToServerPropertiesFormat(serverConfig.serverProperties);

                // Upload server.properties directly via WebDAV
                try {
                    const webdavService = await import('@/lib/server/webdav');
                    const userEmail = user.email.split('@')[0] || 'default-user';
                    const serverPath = `${process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers'}/${userEmail}/${server.uniqueId}`;
                    await webdavService.default.createDirectory(serverPath);
                    await webdavService.default.uploadFile(`${serverPath}/server.properties`, propertiesContent);
                    console.log('Server properties uploaded successfully');
                } catch (propertiesError) {
                    console.error('Failed to upload server.properties:', propertiesError);
                    await updateStep(serverId, 'upload', 'running', uploadProgress, 'Server properties upload failed, continuing...');
                }

                uploadProgress += 20;
                await updateStep(serverId, 'upload', 'running', uploadProgress, 'Server properties processed');
            }

            // Upload plugin files
            if (serverConfig.plugins && serverConfig.plugins.length > 0) {
                await updateStep(serverId, 'upload', 'running', uploadProgress, `Uploading ${serverConfig.plugins.length} plugin(s)...`);

                const fs = await import('fs/promises');
                const pluginFiles: { [path: string]: Buffer } = {};

                for (const plugin of serverConfig.plugins) {
                    await updateStep(serverId, 'upload', 'running', uploadProgress, `Uploading plugin: ${plugin.originalName}`);

                    try {
                        // Read the plugin file from disk
                        const pluginPath = plugin.filePath;
                        const pluginBuffer = await fs.readFile(pluginPath);
                        pluginFiles[`plugins/${plugin.originalName}`] = pluginBuffer;

                        console.log(`Plugin loaded: ${plugin.originalName} (${pluginBuffer.length} bytes)`);
                    } catch (fileError) {
                        console.error(`Failed to read plugin file: ${plugin.originalName}`, fileError);
                        await updateStep(serverId, 'upload', 'running', uploadProgress, `Failed to read plugin: ${plugin.originalName}`);
                    }

                    uploadProgress += Math.floor(30 / serverConfig.plugins.length);
                }

                // Upload all plugin files to the server
                if (Object.keys(pluginFiles).length > 0) {
                    const pluginUploadResult = await updatedMinecraftServer.uploadServerFiles(pluginFiles, 'plugins');
                    if (!pluginUploadResult.success) {
                        console.error('Failed to upload plugins:', pluginUploadResult.error);
                        await updateStep(serverId, 'upload', 'running', uploadProgress, 'Plugin upload failed, continuing...');
                    } else {
                        console.log(`${Object.keys(pluginFiles).length} plugins uploaded successfully`);
                    }
                }

                await updateStep(serverId, 'upload', 'running', uploadProgress, 'Plugins processed');
            }

            // Upload mod files
            if (serverConfig.mods && serverConfig.mods.length > 0) {
                await updateStep(serverId, 'upload', 'running', uploadProgress, `Uploading ${serverConfig.mods.length} mod(s)...`);

                const fs = await import('fs/promises');
                const modFiles: { [path: string]: Buffer } = {};

                for (const mod of serverConfig.mods) {
                    await updateStep(serverId, 'upload', 'running', uploadProgress, `Uploading mod: ${mod.originalName}`);

                    try {
                        // Read the mod file from disk
                        const modPath = mod.filePath;
                        const modBuffer = await fs.readFile(modPath);
                        modFiles[`mods/${mod.originalName}`] = modBuffer;

                        console.log(`Mod loaded: ${mod.originalName} (${modBuffer.length} bytes)`);
                    } catch (fileError) {
                        console.error(`Failed to read mod file: ${mod.originalName}`, fileError);
                        await updateStep(serverId, 'upload', 'running', uploadProgress, `Failed to read mod: ${mod.originalName}`);
                    }

                    uploadProgress += Math.floor(30 / serverConfig.mods.length);
                }

                // Upload all mod files to the server
                if (Object.keys(modFiles).length > 0) {
                    const modUploadResult = await updatedMinecraftServer.uploadServerFiles(modFiles, 'mods');
                    if (!modUploadResult.success) {
                        console.error('Failed to upload mods:', modUploadResult.error);
                        await updateStep(serverId, 'upload', 'running', uploadProgress, 'Mod upload failed, continuing...');
                    } else {
                        console.log(`${Object.keys(modFiles).length} mods uploaded successfully`);
                    }
                }

                await updateStep(serverId, 'upload', 'running', uploadProgress, 'Mods processed');
            }

            // Upload world files
            if (serverConfig.worldFiles) {
                await updateStep(serverId, 'upload', 'running', uploadProgress, 'Uploading world files...');

                const fs = await import('fs/promises');

                try {
                    // Read the world file from disk
                    const worldPath = serverConfig.worldFiles.filePath;
                    const worldBuffer = await fs.readFile(worldPath);

                    console.log(`World file loaded: ${serverConfig.worldFiles.originalName} (${worldBuffer.length} bytes)`);

                    // Upload world file to the server
                    let worldUploadResult;
                    if (serverConfig.worldFiles.originalName.endsWith('.zip')) {
                        // Handle ZIP world files with proper extraction using intelligent world locator
                        worldUploadResult = await updatedMinecraftServer.uploadAndExtractWorldZip(worldBuffer);
                    } else {
                        // Handle other world file types
                        const worldFiles: { [path: string]: Buffer } = {};
                        worldFiles[`world/${serverConfig.worldFiles.originalName}`] = worldBuffer;
                        worldUploadResult = await updatedMinecraftServer.uploadServerFiles(worldFiles, 'world');
                    }

                    if (!worldUploadResult.success) {
                        console.error('Failed to upload world files:', worldUploadResult.error);
                        await updateStep(serverId, 'upload', 'running', uploadProgress, 'World file upload failed, continuing...');
                    } else {
                        console.log('World files uploaded successfully');
                    }

                } catch (fileError) {
                    console.error(`Failed to read world file: ${serverConfig.worldFiles.originalName}`, fileError);
                    await updateStep(serverId, 'upload', 'running', uploadProgress, `Failed to read world file: ${serverConfig.worldFiles.originalName}`);
                }

                uploadProgress = 100;
                await updateStep(serverId, 'upload', 'running', uploadProgress, 'World files processed');
            }

            await updateStep(serverId, 'upload', 'completed', 100, 'File uploads completed successfully');

        } catch (uploadError) {
            console.error('File upload failed:', uploadError);
            await updateStep(serverId, 'upload', 'failed', 0, `File upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
            throw uploadError;
        }

        // Step 9: Configure Velocity proxy integration
        await updateStep(serverId, 'velocity', 'running', 0, 'Configuring Velocity proxy integration...');

        try {
            // Check if Velocity integration is enabled
            const velocityEnabled = definedProxies.length > 0;
            
            if (velocityEnabled) {
                console.log('[Deploy] Velocity integration enabled, configuring server...');
                
                // Find the deployed container - use multiple patterns to find it
                const containers = await portainer.getContainers(portainerEnvironmentId);
                console.log(`[Deploy] Found ${containers.length} containers in environment ${portainerEnvironmentId}`);
                
                // Log all container names for debugging
                console.log('[Deploy] Available containers:', containers.map(c => ({
                    id: c.Id.slice(0, 12),
                    names: c.Names,
                    state: c.State
                })));
                
                // Try multiple name patterns - the stack name is "minecraft-{uniqueId}"
                const serverContainer = containers.find(container =>
                    container.Names.some(name => 
                        name.includes(`minecraft-${serverId}`) ||
                        name.includes(`mc-${serverId}`) ||
                        name.includes(serverId)
                    )
                );
                
                if (serverContainer) {
                    console.log(`[Deploy] Found server container: ${serverContainer.Names.join(', ')} (ID: ${serverContainer.Id.slice(0, 12)}, State: ${serverContainer.State})`);
                    
                    // Wait for server files to be created
                    await updateStep(serverId, 'velocity', 'running', 25, 'Waiting for server files to be ready...');
                    
                    const filesReady = await velocityService.waitForServerFilesToBeCreated(
                        serverContainer.Id,
                        portainerEnvironmentId,
                        120000 // 2 minutes timeout
                    );

                    if (filesReady.success) {
                        // Stop container for configuration
                        await updateStep(serverId, 'velocity', 'running', 50, 'Stopping server for Velocity configuration...');
                        
                        if (serverContainer.State === 'running') {
                            await portainer.axiosInstance.post(
                                `/api/endpoints/${portainerEnvironmentId}/docker/containers/${serverContainer.Id}/stop`
                            );
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }

                        // Configure for Velocity
                        await updateStep(serverId, 'velocity', 'running', 75, 'Applying Velocity configuration...');
                        
                        const velocityConfig = {
                            serverId: serverId,
                            serverName: server.serverName,
                            address: `mc-${serverId}:25565`,
                            port: allocatedPort,
                            motd: server.serverConfig?.motd || server.serverName,
                            restrictedToProxy: true,
                            playerInfoForwardingMode: 'legacy' as const,
                            forwardingSecret: 'velocity-secret',
                            subdomain: server.serverConfig?.subdomain // Add subdomain for forced host mapping
                        };

                        const configResult = await velocityService.configureServerForVelocity(
                            velocityConfig,
                            user.email,
                            serverId
                        );

                        if (configResult.success) {
                            // Restart container with new configuration
                            await portainer.axiosInstance.post(
                                `/api/endpoints/${portainerEnvironmentId}/docker/containers/${serverContainer.Id}/start`
                            );
                            
                            await updateStep(serverId, 'velocity', 'completed', 100, 'Velocity integration configured successfully');
                        } else {
                            throw new Error(configResult.error || 'Failed to configure Velocity');
                        }
                    } else {
                        console.warn(`[Deploy] Velocity file wait failed: ${filesReady.error}`);
                        // Don't fail - Velocity config will be applied later via WebDAV
                        await updateStep(serverId, 'velocity', 'completed', 100, `Velocity integration skipped: ${filesReady.error}`);
                    }
                } else {
                    console.warn(`[Deploy] Server container not found for Velocity configuration. Looking for patterns: minecraft-${serverId}, mc-${serverId}, or ${serverId}`);
                    // Don't fail deployment - the server is deployed but Velocity integration will need manual config
                    await updateStep(serverId, 'velocity', 'completed', 100, 'Server container not found, Velocity integration skipped');
                }
            } else {
                await updateStep(serverId, 'velocity', 'completed', 100, 'Velocity integration disabled, skipping...');
            }

        } catch (velocityError) {
            console.error('Velocity configuration failed:', velocityError);
            await updateStep(serverId, 'velocity', 'failed', 0, `Velocity configuration failed: ${velocityError instanceof Error ? velocityError.message : 'Unknown error'}`);
            // Don't throw the error - continue with deployment
        }

        // Step 10: Finalize deployment
        await updateStep(serverId, 'finalize', 'running', 0, 'Finalizing deployment...');

        // Update server status to indicate successful deployment
        await Server.findOneAndUpdate(
            { uniqueId: serverId },
            {
                isOnline: false, // Server is deployed but not necessarily running
                $set: {
                    deployedAt: new Date(),
                    lastDeploymentStatus: 'success'
                }
            });

        await updateStep(serverId, 'finalize', 'running', 50, 'Cleaning up temporary files...');

        // Cleanup temporary files from uploads directory
        await cleanupTemporaryFiles(server.serverConfig as DatabaseServerConfig, user.email);

        await new Promise(resolve => setTimeout(resolve, 500));
        await updateStep(serverId, 'finalize', 'completed', 100, 'Deployment completed successfully');

        // Mark overall deployment as completed
        const finalStatus = deploymentStatuses.get(serverId);
        if (finalStatus) {
            finalStatus.status = 'completed';
            finalStatus.progress = 100;
            finalStatus.currentStep = 'Deployment completed successfully';
            deploymentStatuses.set(serverId, finalStatus);
        }

        console.log(`Successfully deployed server ${server.serverName}`);

    } catch (error) {
        console.error('Deployment failed, executing comprehensive rollback:', error);

        // Update deployment status to show rollback in progress
        await updateStep(serverId, 'finalize', 'running', 0, 'Deployment failed, cleaning up...');

        // Execute all rollback actions
        try {
            await MinecraftServerManager.executeRollback(rollbackActions);
            console.log('Rollback completed successfully');

            // Update step to show cleanup completed
            await updateStep(serverId, 'finalize', 'failed', 0, 'Deployment failed, cleanup completed');

        } catch (rollbackError) {
            console.error('Error during rollback execution:', rollbackError);
            await updateStep(serverId, 'finalize', 'failed', 0, 'Deployment failed, cleanup partially completed');
        }

        // Update deployment status
        const failedStatus = deploymentStatuses.get(serverId);
        if (failedStatus) {
            failedStatus.status = 'failed';
            failedStatus.error = error instanceof Error ? error.message : 'Unknown error occurred';
            deploymentStatuses.set(serverId, failedStatus);
        }

        // Update server record to mark deployment as failed
        await Server.findOneAndUpdate(
            { uniqueId: serverId },
            {
                $set: {
                    lastDeploymentStatus: 'failed',
                    lastDeploymentError: error instanceof Error ? error.message : 'Unknown error occurred',
                    lastDeploymentAt: new Date()
                }
            });

        throw error;
    }
}
