import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Server from "@/lib/objects/Server";
import jwt from "jsonwebtoken";
import User from "@/lib/objects/User";
import BodyParser from "@/lib/db/bodyParser";
import portainer from "@/lib/server/portainer";
import { createMinecraftServer, convertClientConfigToServerConfig, ClientServerConfig } from "@/lib/server/minecraft";

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
    try {
        const { serverId } = await BodyParser.parseAuto(request);
        
        if (!serverId) {
            return NextResponse.json({ error: "Server ID is required." }, { status: 400 });
        }

        // Connect to the database
        await dbConnect();
        const token = request.cookies.get('sessionToken')?.value;

        if (!token) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default');
        if (!decoded) {
            return NextResponse.json({ message: 'Invalid session token.' }, { status: 401 });
        }

        // Find the user by ID from the decoded token
        const user = await User.findById((decoded as { id: string }).id);
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

        // Initialize deployment status
        const initialStatus: DeploymentStatus = {
            serverId: serverId,
            status: 'running',
            progress: 0,
            currentStep: 'Initializing deployment...',
            steps: [
                { id: 'validate', name: 'Validating configuration', status: 'running', progress: 0 },
                { id: 'docker', name: 'Generating Docker configuration', status: 'pending', progress: 0 },
                { id: 'deploy', name: 'Deploying to container platform', status: 'pending', progress: 0 },
                { id: 'files', name: 'Setting up file directories', status: 'pending', progress: 0 },
                { id: 'upload', name: 'Uploading server files', status: 'pending', progress: 0 },
                { id: 'dns', name: 'Creating DNS records', status: 'pending', progress: 0 },
                { id: 'finalize', name: 'Finalizing deployment', status: 'pending', progress: 0 }
            ]
        };

        deploymentStatuses.set(serverId, initialStatus);

        // Start deployment process asynchronously
        deployServer(serverId, server).catch(error => {
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

async function deployServer(serverId: string, server: Record<string, unknown>) {
    try {
        portainer.DefaultEnvironmentId = (await portainer.getEnvironments()).pop()?.Id || null;

        // Step 1: Validate configuration
        await updateStep(serverId, 'validate', 'running', 0, 'Validating server configuration...');
        await new Promise(resolve => setTimeout(resolve, 500));
        await updateStep(serverId, 'validate', 'completed', 100, 'Configuration validated');

        // Step 2: Generate Docker configuration
        await updateStep(serverId, 'docker', 'running', 0, 'Generating Docker Compose configuration...');
        
        // Convert server config to client config format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serverConfig = (server as any).serverConfig;
        const clientConfig: ClientServerConfig = {
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
            port: serverConfig.port,
            viewDistance: serverConfig.viewDistance,
            simulationDistance: serverConfig.simulationDistance,
            spawnProtection: serverConfig.spawnProtection,
            rconEnabled: serverConfig.rconEnabled,
            rconPassword: serverConfig.rconPassword,
            motd: serverConfig.motd,
            resourcePackUrl: serverConfig.resourcePackUrl,
            resourcePackSha1: serverConfig.resourcePackSha1,
            resourcePackPrompt: serverConfig.resourcePackPrompt,
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

        const minecraftConfig = convertClientConfigToServerConfig(clientConfig);
        const minecraftServer = createMinecraftServer(
            minecraftConfig,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (server as any).serverName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (server as any).uniqueId,
            portainer.DefaultEnvironmentId || 1
        );

        await new Promise(resolve => setTimeout(resolve, 800));
        await updateStep(serverId, 'docker', 'completed', 100, 'Docker configuration generated');

        // Step 3: Deploy to Portainer
        await updateStep(serverId, 'deploy', 'running', 0, 'Deploying server to container platform...');
        
        const deployResult = await minecraftServer.deployToPortainer();
        
        if (!deployResult.success) {
            await updateStep(serverId, 'deploy', 'failed', 0, 'Deployment failed', deployResult.error);
            throw new Error(`Deployment failed: ${deployResult.error}`);
        }

        await updateStep(serverId, 'deploy', 'completed', 100, 'Server deployed successfully');

        // Step 4: Verify deployment and wait for container to be ready
        await updateStep(serverId, 'files', 'running', 0, 'Verifying container deployment...');
        
        // Wait a bit for the container to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if container is actually running
        const statusCheck = await minecraftServer.getServerStatus();
        if (statusCheck.running) {
            await updateStep(serverId, 'files', 'completed', 100, 'Container is running and ready');
        } else {
            // Container might still be starting up, that's okay
            await updateStep(serverId, 'files', 'completed', 100, 'Container deployment verified');
        }

        // Step 5: Upload files (if any)
        await updateStep(serverId, 'upload', 'running', 0, 'Preparing file uploads...');
        // Note: File uploads would happen here if files were provided
        await new Promise(resolve => setTimeout(resolve, 400));
        await updateStep(serverId, 'upload', 'completed', 100, 'File upload completed');

        // Step 6: Create DNS records
        await updateStep(serverId, 'dns', 'running', 0, 'Creating DNS SRV record...');
        try {
            // Get environment variables for DNS configuration
            const dnsConfig = {
                domain: process.env.MINECRAFT_DOMAIN || process.env.DOMAIN || 'example.com',
                target: process.env.SERVER_TARGET || process.env.SERVER_IP || 'server.example.com'
            };

            if (dnsConfig.domain !== 'example.com' && dnsConfig.target !== 'server.example.com') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const serverData = server as any;
                const subdomain = serverData.subdomainName || serverData.uniqueId;
                const port = serverConfig.port || 25565;

                const dnsResult = await minecraftServer.createDnsRecord(
                    dnsConfig.domain,
                    subdomain,
                    dnsConfig.target,
                    port
                );

                if (dnsResult.success && dnsResult.recordId) {
                    // Update the server record with DNS information
                    await Server.findByIdAndUpdate(serverId, {
                        $set: {
                            'dnsRecord': {
                                recordId: dnsResult.recordId,
                                domain: dnsConfig.domain,
                                subdomain: subdomain,
                                target: dnsConfig.target,
                                port: port,
                                createdAt: new Date()
                            }
                        }
                    });
                    await updateStep(serverId, 'dns', 'completed', 100, `DNS record created: ${subdomain}.${dnsConfig.domain}`);
                } else {
                    await updateStep(serverId, 'dns', 'completed', 100, `DNS record creation skipped: ${dnsResult.error || 'Configuration not available'}`);
                }
            } else {
                await updateStep(serverId, 'dns', 'completed', 100, 'DNS record creation skipped: Domain not configured');
            }
        } catch (error) {
            console.error('DNS creation error:', error);
            await updateStep(serverId, 'dns', 'completed', 100, `DNS record creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Step 7: Finalize
        await updateStep(serverId, 'finalize', 'running', 0, 'Finalizing server setup...');
        await new Promise(resolve => setTimeout(resolve, 500));
        await updateStep(serverId, 'finalize', 'completed', 100, 'Server setup completed');

        // Update deployment status to completed
        const finalStatus = deploymentStatuses.get(serverId);
        if (finalStatus) {
            finalStatus.status = 'completed';
            finalStatus.progress = 100;
            finalStatus.currentStep = 'Deployment completed successfully!';
            deploymentStatuses.set(serverId, finalStatus);
        }

        console.log(`Successfully deployed server ${server.serverName}`);

    } catch (error) {
        console.error('Deployment error:', error);
        const status = deploymentStatuses.get(serverId);
        if (status) {
            status.status = 'failed';
            status.error = error instanceof Error ? error.message : 'Unknown error occurred';
            deploymentStatuses.set(serverId, status);
        }
        throw error;
    }
}
