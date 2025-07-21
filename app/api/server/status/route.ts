import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";
import resourceMonitor from "@/lib/server/resourceMonitor";

export async function GET(request: NextRequest) {
    await dbConnect();
    
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Get server uniqueId from request body
        const url = new URL(request.url);
        const serverIdentifier = url.searchParams.get('uniqueId') || '';
        const includeResources = url.searchParams.get('includeResources') === 'true';

        if (!serverIdentifier) {
            return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });
        }

        if (!serverIdentifier) {
            return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });
        }

        // Find the server by slug (uniqueId, subdomain, or serverName)
        const server = await Server.findOne({
            $and: [
                { email: user.email }, // Ensure user owns the server
                {
                    $or: [
                        { uniqueId: serverIdentifier },
                        { subdomainName: serverIdentifier },
                    ]
                }
            ]
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        // Get container by server MongoDB _id (containers are named mc-{_id})
        const containerIdentifier = `mc-${server.uniqueId}`;
        const container = await portainer.getContainerByIdentifier(containerIdentifier);
        
        if (!container) {
            const baseResponse = { 
                status: 'offline',
                message: 'Container not found for this server.',
                serverId: server.uniqueId.toString()
            };

            if (includeResources) {
                return NextResponse.json({
                    ...baseResponse,
                    resources: {
                        cpuUsage: 0,
                        memoryUsage: 0,
                        memoryLimit: server.serverConfig?.serverMemory || 1024,
                        memoryUsagePercent: 0,
                        playersOnline: 0,
                        maxPlayers: server.serverConfig?.maxPlayers || 20,
                        networkRx: 0,
                        networkTx: 0,
                        isOptimal: false,
                        error: 'Container not found'
                    }
                }, { status: 200 });
            }

            return NextResponse.json(baseResponse, { status: 200 });
        }

        // Map container state to our server status
        let serverStatus: 'online' | 'offline' | 'starting' | 'crashed' | 'unhealthy' | 'paused' = 'offline';

        if (container.Status) {
            const containerStatus = container.Status.toLowerCase();
            if (containerStatus.includes('exited')) {
                const exitCode: number = parseInt(containerStatus.split('(')[1].split(')')[0]);
                
                if (exitCode === 0) {
                    serverStatus = 'offline';
                } else {
                    serverStatus = 'crashed';
                }
            } else if (containerStatus.includes('starting')) {
                serverStatus = 'starting';
            } else if (containerStatus.includes('healthy')) {
                serverStatus = 'online';
            } else if (containerStatus.includes('unhealthy')) {
                serverStatus = 'unhealthy';
            } else if (containerStatus.includes('paused')) {
                serverStatus = 'paused';
            } else {
                serverStatus = 'offline';
                const baseResponse = {
                    status: serverStatus,
                    message: 'Container status is not available.',
                    serverId: server.uniqueId.toString()
                };

                if (includeResources) {
                    return NextResponse.json({
                        ...baseResponse,
                        resources: {
                            cpuUsage: 0,
                            memoryUsage: 0,
                            memoryLimit: server.serverConfig?.serverMemory || 1024,
                            memoryUsagePercent: 0,
                            playersOnline: 0,
                            maxPlayers: server.serverConfig?.maxPlayers || 20,
                            networkRx: 0,
                            networkTx: 0,
                            isOptimal: false,
                            error: 'Container status unavailable'
                        }
                    }, { status: 200 });
                }

                return NextResponse.json(baseResponse, { status: 200 });
            }
        } else {
            const baseResponse = { 
                status: 'offline',
                message: 'Container not found for this server.',
                serverId: server.uniqueId.toString()
            };

            if (includeResources) {
                return NextResponse.json({
                    ...baseResponse,
                    resources: {
                        cpuUsage: 0,
                        memoryUsage: 0,
                        memoryLimit: server.serverConfig?.serverMemory || 1024,
                        memoryUsagePercent: 0,
                        playersOnline: 0,
                        maxPlayers: server.serverConfig?.maxPlayers || 20,
                        networkRx: 0,
                        networkTx: 0,
                        isOptimal: false,
                        error: 'Container not found'
                    }
                }, { status: 200 });
            }

            return NextResponse.json(baseResponse, { status: 200 });
        }

        console.log(`Container status for ${server.serverName} (${containerIdentifier}): ${serverStatus}`);

        // Update the server's online status in the database
        const isOnline = serverStatus === 'online';
        if (server.isOnline !== isOnline) {
            server.isOnline = isOnline;
            Server.updateOne({ uniqueId: server.uniqueId }, { isOnline: isOnline })
                .then(() => console.log(`Updated server ${server.serverName} online status to ${isOnline}`))
                .catch(err => console.error(`Failed to update server status for ${server.serverName}:`, err));
        }

        const responseData: {
            status: string;
            resources?: {
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
            };
        } = {
            status: serverStatus,
        };

        // Include resource information if requested
        if (includeResources && serverStatus === 'online') {
            try {
                console.log(`📊 Getting resource summary for server ${server.uniqueId}...`);
                const resourceSummary = await resourceMonitor.getResourceSummary(server.uniqueId);
                
                if (resourceSummary) {
                    console.log(`✅ Resource summary retrieved:`, {
                        cpuUsage: resourceSummary.cpuUsage,
                        memoryUsage: resourceSummary.memoryUsage,
                        playersOnline: resourceSummary.playersOnline,
                        maxPlayers: resourceSummary.maxPlayers
                    });
                } else {
                    console.log(`⚠️ Resource summary is null for server ${server.uniqueId}`);
                }
                
                responseData.resources = resourceSummary || {
                    cpuUsage: 0,
                    memoryUsage: 0,
                    memoryLimit: server.serverConfig?.serverMemory || 1024,
                    memoryUsagePercent: 0,
                    playersOnline: 0,
                    maxPlayers: server.serverConfig?.maxPlayers || 20,
                    networkRx: 0,
                    networkTx: 0,
                    isOptimal: false,
                    error: 'Failed to get resource data'
                };
            } catch (resourceError) {
                console.error('Failed to get resource summary:', resourceError);
                responseData.resources = {
                    cpuUsage: 0,
                    memoryUsage: 0,
                    memoryLimit: server.serverConfig?.serverMemory || 1024,
                    memoryUsagePercent: 0,
                    playersOnline: 0,
                    maxPlayers: server.serverConfig?.maxPlayers || 20,
                    networkRx: 0,
                    networkTx: 0,
                    isOptimal: false,
                    error: 'Resource monitoring unavailable'
                };
            }
        } else if (includeResources) {
            // Server is not online, but still provide static resource info
            responseData.resources = {
                cpuUsage: 0,
                memoryUsage: 0,
                memoryLimit: server.serverConfig?.serverMemory || 1024,
                memoryUsagePercent: 0,
                playersOnline: 0,
                maxPlayers: server.serverConfig?.maxPlayers || 20,
                networkRx: 0,
                networkTx: 0,
                isOptimal: false,
                error: `Server is ${serverStatus}`
            };
        }

        return NextResponse.json(responseData, { status: 200 });

    } catch (error) {
        console.error('Error fetching server status:', error);
        
        const errorResponse: { 
            status: string;
            message: string;
            error: string;
            resources?: {
                cpuUsage: number;
                memoryUsage: number;
                memoryLimit: number;
                memoryUsagePercent: number;
                playersOnline: number;
                maxPlayers: number;
                networkRx: number;
                networkTx: number;
                isOptimal: boolean;
                error: string;
            };
        } = { 
            status: 'offline',
            message: 'Failed to fetch server status.',
            error: error instanceof Error ? error.message : 'Unknown error'
        };

        // Include resource error info if requested
        const url = new URL(request.url);
        if (url.searchParams.get('includeResources') === 'true') {
            errorResponse.resources = {
                cpuUsage: 0,
                memoryUsage: 0,
                memoryLimit: 1024,
                memoryUsagePercent: 0,
                playersOnline: 0,
                maxPlayers: 20,
                networkRx: 0,
                networkTx: 0,
                isOptimal: false,
                error: 'Service unavailable'
            };
        }

        return NextResponse.json(errorResponse, { status: 500 });
    }
}
