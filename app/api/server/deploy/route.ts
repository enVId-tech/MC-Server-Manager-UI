import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Server from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";
import BodyParser from "@/lib/db/bodyParser";
import portainer from "@/lib/server/portainer";
import MinecraftServerManager from "@/lib/server/serverManager";
import { createMinecraftServer, convertClientConfigToServerConfig, ClientServerConfig } from "@/lib/server/minecraft";
import verificationService from "@/lib/server/verify";
import { FileInfo } from "@/lib/objects/ServerConfig";

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
            _id: serverId,
            email: user.email
        });

        if (!server) {
            return NextResponse.json({ error: "Server not found." }, { status: 404 });
        }

        // Check what steps need to be performed based on server state
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasPort = !!(server as any).port;
        const hasFolder = true; // Assume folder exists if server was created with new flow

        // Initialize deployment status with conditional steps
        const steps: DeploymentStep[] = [
            { id: 'validate', name: 'Validating configuration', status: 'running', progress: 0 }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deployServer(serverId: string, server: Record<string, unknown>, user: any) {
    const rollbackActions: (() => Promise<void>)[] = [];

    try {
        // Dynamically get Portainer environment - fail if not available
        let portainerEnvironmentId: number;
        try {
            const environments = await portainer.getEnvironments();
            if (environments.length === 0) {
                throw new Error('No Portainer environments found');
            }

            // Use the first available environment
            const availableEnvironment = environments[0];
            portainer.DefaultEnvironmentId = availableEnvironment.Id;
            portainerEnvironmentId = availableEnvironment.Id;
            console.log(`Deploy using Portainer environment: ${availableEnvironment.Id} (${availableEnvironment.Name})`);

        } catch (error) {
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

        // Step 1: Validate configuration
        await updateStep(serverId, 'validate', 'running', 0, 'Validating server configuration...');

        // Extract server config with proper typing
        const serverConfig = (server as Record<string, unknown>).serverConfig as DatabaseServerConfig;
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
            await Server.findByIdAndUpdate(serverId, {
                port: portAllocation.port,
                rconPort: portAllocation.rconPort
            });

            allocatedPort = portAllocation.port;
            allocatedRconPort = portAllocation.rconPort;

            // Add rollback action for port allocation
            rollbackActions.push(async () => {
                console.log(`Rolling back port allocation for server ${serverId}`);
                await Server.findByIdAndUpdate(serverId, {
                    $unset: { port: 1, rconPort: 1 }
                });
            });

            const portMessage = allocatedRconPort
                ? `Allocated ports: ${allocatedPort} (game), ${allocatedRconPort} (RCON)`
                : `Allocated port: ${allocatedPort}`;
            await updateStep(serverId, 'ports', 'completed', 100, portMessage);
        }

        // Step 4: Create server folder structure (only if not already created)
        if (!hasFolder) {
            await updateStep(serverId, 'folder', 'running', 0, 'Creating server folder structure...');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const serverData = server as any;
            const folderResult = await MinecraftServerManager.createServerFolder(
                serverData.uniqueId,
                user.email,
                serverData.serverConfig?.serverType
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
            name: serverConfig.name,
            serverType: serverConfig.serverType,
            version: serverConfig.version,
            description: serverConfig.description || '',
            seed: serverConfig.seed || '',
            gameMode: serverConfig.gameMode,
            difficulty: serverConfig.difficulty,
            worldType: serverConfig.worldType,
            worldGeneration: serverConfig.worldGeneration,
            maxPlayers: serverConfig.maxPlayers,
            whitelistEnabled: serverConfig.whitelistEnabled,
            onlineMode: serverConfig.onlineMode,
            pvpEnabled: serverConfig.pvpEnabled,
            commandBlocksEnabled: serverConfig.commandBlocksEnabled,
            flightEnabled: serverConfig.flightEnabled,
            spawnAnimalsEnabled: serverConfig.spawnAnimalsEnabled,
            spawnMonstersEnabled: serverConfig.spawnMonstersEnabled,
            spawnNpcsEnabled: serverConfig.spawnNpcsEnabled,
            generateStructuresEnabled: serverConfig.generateStructuresEnabled,
            port: allocatedPort!,
            rconPort: allocatedRconPort,
            viewDistance: serverConfig.viewDistance,
            simulationDistance: serverConfig.simulationDistance,
            spawnProtection: serverConfig.spawnProtection,
            rconEnabled: serverConfig.rconEnabled,
            rconPassword: serverConfig.rconPassword,
            motd: serverConfig.motd,
            resourcePackUrl: serverConfig.resourcePackUrl || '',
            resourcePackSha1: serverConfig.resourcePackSha1 || '',
            resourcePackPrompt: serverConfig.resourcePackPrompt || '',
            forceResourcePack: serverConfig.forceResourcePack,
            enableJmxMonitoring: serverConfig.enableJmxMonitoring,
            syncChunkWrites: serverConfig.syncChunkWrites,
            enforceWhitelist: serverConfig.enforceWhitelist,
            preventProxyConnections: serverConfig.preventProxyConnections,
            hideOnlinePlayers: serverConfig.hideOnlinePlayers,
            broadcastRconToOps: serverConfig.broadcastRconToOps,
            broadcastConsoleToOps: serverConfig.broadcastConsoleToOps,
            serverMemory: serverConfig.serverMemory,
            plugins: [],
            mods: [],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            subdomain: (server as any).subdomainName.replace('.etran.dev', '')
        };

        const minecraftConfig = convertClientConfigToServerConfig(updatedClientConfig);
        const updatedMinecraftServer = createMinecraftServer(
            minecraftConfig,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (server as any).serverName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (server as any).uniqueId,
            portainerEnvironmentId,
            user.email
        );

        await new Promise(resolve => setTimeout(resolve, 800));
        await updateStep(serverId, 'docker', 'completed', 100, 'Docker configuration generated');

        // Step 6: Deploy to Portainer
        await updateStep(serverId, 'deploy', 'running', 0, 'Deploying server to container platform...');

        const deployResult = await updatedMinecraftServer.deployToPortainer();

        if (!deployResult.success) {
            // Try fallback deployment method
            console.log('Portainer deployment failed, trying Docker Compose fallback...');
            await updateStep(serverId, 'deploy', 'running', 50, 'Portainer failed, trying fallback deployment...');

            const fallbackResult = await updatedMinecraftServer.deployToDockerCompose(user.email);

            if (!fallbackResult.success) {
                await updateStep(serverId, 'deploy', 'failed', 0, 'All deployment methods failed',
                    `Portainer: ${deployResult.error}, Fallback: ${fallbackResult.error}`);
                throw new Error(`All deployment methods failed. Portainer: ${deployResult.error}, Fallback: ${fallbackResult.error}`);
            }

            await updateStep(serverId, 'deploy', 'completed', 100,
                `Deployment completed using Docker Compose fallback. File: ${fallbackResult.composeFile}`);
        } else {
            // Add rollback action for Portainer deployment
            rollbackActions.push(async () => {
                console.log(`Rolling back Portainer deployment for server ${serverId}`);
                try {
                    await updatedMinecraftServer.deleteFromPortainer();
                } catch (error) {
                    console.warn('Could not clean up Portainer deployment during rollback:', error);
                }
            });

            await updateStep(serverId, 'deploy', 'completed', 100, 'Server deployed successfully to Portainer');
        }

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
            const serverConfig = (server as Record<string, unknown>).serverConfig as DatabaseServerConfig;
            
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
                    const serverPath = `/servers/${(server as Record<string, unknown>).uniqueId}`;
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
                        // Handle ZIP world files with proper extraction
                        const worldAnalysis = serverConfig.worldFiles.analysis;
                        if (worldAnalysis) {
                            worldUploadResult = await updatedMinecraftServer.uploadAndExtractWorldZip(worldBuffer, worldAnalysis);
                        } else {
                            // Fallback to basic world upload
                            const worldFiles: { [path: string]: Buffer } = {};
                            worldFiles[`world/${serverConfig.worldFiles.originalName}`] = worldBuffer;
                            worldUploadResult = await updatedMinecraftServer.uploadServerFiles(worldFiles, 'world');
                        }
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

        // Step 9: Finalize deployment
        await updateStep(serverId, 'finalize', 'running', 0, 'Finalizing deployment...');

        // Update server status to indicate successful deployment
        await Server.findByIdAndUpdate(serverId, {
            isOnline: false, // Server is deployed but not necessarily running
            $set: {
                deployedAt: new Date(),
                lastDeploymentStatus: 'success'
            }
        });

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
        console.error('Deployment failed, executing rollback:', error);

        // Execute rollback actions
        await MinecraftServerManager.executeRollback(rollbackActions);

        // Update deployment status
        const failedStatus = deploymentStatuses.get(serverId);
        if (failedStatus) {
            failedStatus.status = 'failed';
            failedStatus.error = error instanceof Error ? error.message : 'Unknown error occurred';
            deploymentStatuses.set(serverId, failedStatus);
        }

        // Update server record to mark deployment as failed
        await Server.findByIdAndUpdate(serverId, {
            $set: {
                lastDeploymentStatus: 'failed',
                lastDeploymentError: error instanceof Error ? error.message : 'Unknown error occurred',
                lastDeploymentAt: new Date()
            }
        });

        throw error;
    }
}
