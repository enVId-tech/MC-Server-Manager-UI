import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import User, { IUser } from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import portainer from '@/lib/server/portainer';

// GET - Get all servers for admin management (admin only)
export async function GET(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const sortBy = searchParams.get('sortBy') || 'createdAt';
        const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;
        const userEmail = searchParams.get('userEmail');
        const status = searchParams.get('status'); // 'online', 'offline', 'all'
        const serverType = searchParams.get('serverType');
        const search = searchParams.get('search');

        // Build query
        const query: any = {};

        if (userEmail) {
            query.email = { $regex: userEmail, $options: 'i' };
        }

        if (serverType && serverType !== 'all') {
            query['serverConfig.serverType'] = serverType;
        }

        if (search) {
            query.$or = [
                { serverName: { $regex: search, $options: 'i' } },
                { subdomainName: { $regex: search, $options: 'i' } },
                { uniqueId: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Get total count
        const totalServers = await Server.countDocuments(query);

        // Get servers with pagination
        let serversQuery = Server.find(query)
            .sort({ [sortBy]: sortOrder })
            .skip((page - 1) * limit)
            .limit(limit);

        const servers = await serversQuery.exec();

        // Get container status for each server if status filter is specified
        let serversWithStatus = servers;
        
        if (status && status !== 'all') {
            const environments = await portainer.getEnvironments();
            const environmentId = environments[0]?.Id;

            if (environmentId) {
                const containers = await portainer.getContainers(environmentId);
                
                serversWithStatus = servers.filter(server => {
                    const containerName = `mc-${server.uniqueId}`;
                    const container = containers.find(c => 
                        c.Names && c.Names.some(name => name.includes(containerName))
                    );
                    
                    const isOnline = container?.State === 'running';
                    
                    if (status === 'online') return isOnline;
                    if (status === 'offline') return !isOnline;
                    return true;
                });
            }
        }

        // Get user information for each server
        const userEmails = [...new Set(serversWithStatus.map(s => s.email))];
        const users = await User.find({ email: { $in: userEmails } }, { 
            email: 1, 
            isActive: 1, 
            maxServers: 1, 
            createdAt: 1 
        });

        const userMap = users.reduce((acc, user) => {
            acc[user.email] = user;
            return acc;
        }, {} as any);

        // Enrich servers with user data and container status
        const enrichedServers = await Promise.all(
            serversWithStatus.map(async (server) => {
                const user = userMap[server.email];
                
                // Get container status
                let containerStatus = null;
                try {
                    const environments = await portainer.getEnvironments();
                    const environmentId = environments[0]?.Id;
                    
                    if (environmentId) {
                        const containerName = `mc-${server.uniqueId}`;
                        const container = await portainer.getContainerByIdentifier(containerName, environmentId);
                        
                        if (container) {
                            containerStatus = {
                                id: container.Id,
                                state: container.State,
                                status: container.Status,
                                image: container.Image,
                                created: container.Created,
                                ports: container.Ports
                            };
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to get container status for ${server.uniqueId}:`, error);
                }

                return {
                    ...server.toObject(),
                    user: user ? {
                        email: user.email,
                        isActive: user.isActive,
                        maxServers: user.maxServers,
                        createdAt: user.createdAt
                    } : null,
                    containerStatus
                };
            })
        );

        // Get aggregated statistics
        const stats = {
            totalServers: totalServers,
            totalUsers: userEmails.length,
            onlineServers: enrichedServers.filter(s => s.containerStatus?.state === 'running').length,
            offlineServers: enrichedServers.filter(s => s.containerStatus?.state !== 'running').length,
            serverTypes: await Server.aggregate([
                { $group: { _id: '$serverConfig.serverType', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        };

        return NextResponse.json({
            success: true,
            servers: enrichedServers,
            pagination: {
                page,
                limit,
                totalServers,
                totalPages: Math.ceil(totalServers / limit),
                hasNext: page * limit < totalServers,
                hasPrev: page > 1
            },
            stats,
            message: 'Servers retrieved successfully'
        });

    } catch (error) {
        console.error('Error getting servers for admin:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// POST - Perform admin actions on servers (admin only)
export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        const adminUser: IUser | null = await verificationService.getUserFromToken(request);

        if (!adminUser || !adminUser.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const { action, serverIds, newSettings } = await BodyParser.parseAuto(request);

        if (!action) {
            return NextResponse.json({
                success: false,
                error: 'Action is required'
            }, { status: 400 });
        }

        const results: any[] = [];

        if (action === 'bulk-start') {
            // Start multiple servers
            for (const serverId of serverIds || []) {
                try {
                    const server = await Server.findOne({ uniqueId: serverId });
                    if (!server) {
                        results.push({ serverId, success: false, error: 'Server not found' });
                        continue;
                    }

                    const environments = await portainer.getEnvironments();
                    const environmentId = environments[0]?.Id;
                    
                    if (!environmentId) {
                        results.push({ serverId, success: false, error: 'No Portainer environment available' });
                        continue;
                    }

                    const containerName = `mc-${serverId}`;
                    const container = await portainer.getContainerByIdentifier(containerName, environmentId);
                    
                    if (!container) {
                        results.push({ serverId, success: false, error: 'Container not found' });
                        continue;
                    }

                    await portainer.startContainer(container.Id, environmentId);
                    
                    // Update database
                    await Server.updateOne({ uniqueId: serverId }, { $set: { isOnline: true } });
                    
                    results.push({ serverId, success: true, message: 'Server started successfully' });
                } catch (error) {
                    results.push({ 
                        serverId, 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    });
                }
            }

        } else if (action === 'bulk-stop') {
            // Stop multiple servers
            for (const serverId of serverIds || []) {
                try {
                    const server = await Server.findOne({ uniqueId: serverId });
                    if (!server) {
                        results.push({ serverId, success: false, error: 'Server not found' });
                        continue;
                    }

                    const environments = await portainer.getEnvironments();
                    const environmentId = environments[0]?.Id;
                    
                    if (!environmentId) {
                        results.push({ serverId, success: false, error: 'No Portainer environment available' });
                        continue;
                    }

                    const containerName = `mc-${serverId}`;
                    const container = await portainer.getContainerByIdentifier(containerName, environmentId);
                    
                    if (!container) {
                        results.push({ serverId, success: false, error: 'Container not found' });
                        continue;
                    }

                    await portainer.stopContainer(container.Id, environmentId);
                    
                    // Update database
                    await Server.updateOne({ uniqueId: serverId }, { $set: { isOnline: false } });
                    
                    results.push({ serverId, success: true, message: 'Server stopped successfully' });
                } catch (error) {
                    results.push({ 
                        serverId, 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    });
                }
            }

        } else if (action === 'bulk-restart') {
            // Restart multiple servers
            for (const serverId of serverIds || []) {
                try {
                    const server = await Server.findOne({ uniqueId: serverId });
                    if (!server) {
                        results.push({ serverId, success: false, error: 'Server not found' });
                        continue;
                    }

                    const environments = await portainer.getEnvironments();
                    const environmentId = environments[0]?.Id;
                    
                    if (!environmentId) {
                        results.push({ serverId, success: false, error: 'No Portainer environment available' });
                        continue;
                    }

                    const containerName = `mc-${serverId}`;
                    const container = await portainer.getContainerByIdentifier(containerName, environmentId);
                    
                    if (!container) {
                        results.push({ serverId, success: false, error: 'Container not found' });
                        continue;
                    }

                    await portainer.restartContainer(container.Id, environmentId);
                    
                    // Update database
                    await Server.updateOne({ uniqueId: serverId }, { $set: { isOnline: true } });
                    
                    results.push({ serverId, success: true, message: 'Server restarted successfully' });
                } catch (error) {
                    results.push({ 
                        serverId, 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    });
                }
            }

        } else if (action === 'bulk-delete') {
            // Delete multiple servers
            for (const serverId of serverIds || []) {
                try {
                    const server = await Server.findOne({ uniqueId: serverId });
                    if (!server) {
                        results.push({ serverId, success: false, error: 'Server not found' });
                        continue;
                    }

                    // Delete from Portainer
                    try {
                        const environments = await portainer.getEnvironments();
                        const environmentId = environments[0]?.Id;
                        
                        if (environmentId) {
                            const containerName = `mc-${serverId}`;
                            const container = await portainer.getContainerByIdentifier(containerName, environmentId);
                            
                            if (container) {
                                if (container.State === 'running') {
                                    await portainer.stopContainer(container.Id, environmentId);
                                }
                                await portainer.removeContainer(container.Id, environmentId, true, true);
                            }

                            // Also try to delete stack if it exists
                            const stacks = await portainer.getStacks();
                            const stack = stacks.find(s => s.Name === `minecraft-${serverId}`);
                            if (stack) {
                                await portainer.deleteStack(stack.Id, environmentId);
                            }
                        }
                    } catch (portainerError) {
                        console.warn(`Failed to cleanup Portainer resources for ${serverId}:`, portainerError);
                    }

                    // Delete from database
                    await Server.deleteOne({ uniqueId: serverId });
                    
                    results.push({ serverId, success: true, message: 'Server deleted successfully' });
                } catch (error) {
                    results.push({ 
                        serverId, 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    });
                }
            }

        } else if (action === 'update-settings') {
            // Update server settings
            const serverId = serverIds?.[0];
            if (!serverId || !newSettings) {
                return NextResponse.json({
                    success: false,
                    error: 'Server ID and new settings are required for update-settings action'
                }, { status: 400 });
            }

            try {
                const server = await Server.findOne({ uniqueId: serverId });
                if (!server) {
                    return NextResponse.json({
                        success: false,
                        error: 'Server not found'
                    }, { status: 404 });
                }

                // Update server configuration
                const updateData: any = {};
                
                if (newSettings.serverName) {
                    updateData.serverName = newSettings.serverName;
                }
                
                if (newSettings.serverConfig) {
                    updateData.serverConfig = { ...server.serverConfig, ...newSettings.serverConfig };
                }
                
                if (newSettings.subdomainName) {
                    updateData.subdomainName = newSettings.subdomainName;
                }

                await Server.updateOne({ uniqueId: serverId }, { $set: updateData });

                return NextResponse.json({
                    success: true,
                    message: 'Server settings updated successfully',
                    serverId
                });

            } catch (error) {
                return NextResponse.json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }, { status: 500 });
            }

        } else {
            return NextResponse.json({
                success: false,
                error: 'Invalid action. Valid actions: bulk-start, bulk-stop, bulk-restart, bulk-delete, update-settings'
            }, { status: 400 });
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        return NextResponse.json({
            success: failureCount === 0,
            results,
            summary: {
                total: results.length,
                successful: successCount,
                failed: failureCount
            },
            message: `Bulk operation completed: ${successCount} successful, ${failureCount} failed`
        });

    } catch (error) {
        console.error('Error performing admin server action:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
