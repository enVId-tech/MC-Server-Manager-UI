import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import jwt from "jsonwebtoken";
import User from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";

export async function POST(request: NextRequest) {
    await dbConnect();
    
    try {
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

        // Get server uniqueId from request body
        const { uniqueId } = await request.json();
        const serverIdentifier = uniqueId;

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
                        { serverName: serverIdentifier }
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
            return NextResponse.json({ 
                status: 'offline',
                message: 'Container not found for this server.',
                serverId: server.uniqueId.toString()
            }, { status: 200 });
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
                return NextResponse.json({
                    status: serverStatus,
                    message: 'Container status is not available.',
                serverId: server.uniqueId.toString()
            }, { status: 200 });
            }
        } else {
            return NextResponse.json({ 
                status: 'offline',
                message: 'Container not found for this server.',
                serverId: server.uniqueId.toString()
            }, { status: 200 });
        }

        // Update the server's online status in the database
        const isOnline = serverStatus === 'online';
        if (server.isOnline !== isOnline) {
            server.isOnline = isOnline;
            await server.save();
        }

        return NextResponse.json({
            status: serverStatus,
            containerState: container.State,
            containerId: container.Id,
            containerName: container.Names?.[0]?.replace(/^\//, '') || 'Unknown',
            serverId: server._id.toString(),
            serverName: server.serverName,
            uniqueId: server.uniqueId,
            exitCode: container.ExitCode || 0,
            startedAt: container.StartedAt,
            finishedAt: container.FinishedAt
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching server status:', error);
        return NextResponse.json({ 
            status: 'offline',
            message: 'Failed to fetch server status.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
