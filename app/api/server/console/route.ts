import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";

/**
 * GET /api/server/console - Get console access information for a server
 * 
 * This provides the WebSocket URL and connection details for accessing
 * the Portainer console for a server. Only the server owner can access this.
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ 
                success: false,
                message: 'User not found.' 
            }, { status: 404 });
        }

        const url = new URL(request.url);
        const uniqueId = url.searchParams.get('uniqueId');

        if (!uniqueId) {
            return NextResponse.json({ 
                success: false,
                message: 'Server uniqueId is required.' 
            }, { status: 400 });
        }

        // Find the server and verify ownership
        const server = await Server.findOne({
            email: user.email,
            uniqueId: uniqueId
        });

        if (!server) {
            return NextResponse.json({ 
                success: false,
                message: 'Server not found or access denied.' 
            }, { status: 404 });
        }

        const environmentId = server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1);
        const containerName = `mc-${server.uniqueId}`;
        
        // Find container
        const container = await portainer.getContainerByIdentifier(containerName, environmentId);
        
        if (!container) {
            return NextResponse.json({ 
                success: false,
                message: 'Server container not found.' 
            }, { status: 404 });
        }

        // Check if container is running
        if (container.State !== 'running') {
            return NextResponse.json({ 
                success: false,
                message: `Server is not running (current state: ${container.State}). Start the server first.`,
                containerState: container.State
            }, { status: 400 });
        }

        // Get WebSocket URL for console access
        const websocketUrl = portainer.getConsoleWebsocketUrl(container.Id, environmentId);

        return NextResponse.json({ 
            success: true,
            server: {
                uniqueId: server.uniqueId,
                name: server.name,
                containerName
            },
            console: {
                containerId: container.Id,
                containerState: container.State,
                websocketUrl,
                // Also provide Portainer direct link for manual access
                portainerConsoleUrl: `${process.env.PORTAINER_URL || ''}/#!/${environmentId}/docker/containers/${container.Id}/console`
            }
        });

    } catch (error) {
        console.error('[Server Console] Error:', error);
        return NextResponse.json({ 
            success: false,
            message: 'Internal server error.' 
        }, { status: 500 });
    }
}

/**
 * POST /api/server/console - Execute a command in the server console
 * 
 * This allows server owners to send commands to their server via the Portainer exec API.
 */
export async function POST(request: NextRequest) {
    await dbConnect();
    
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ 
                success: false,
                message: 'User not found.' 
            }, { status: 404 });
        }

        const body = await request.json();
        const { uniqueId, command } = body;

        if (!uniqueId) {
            return NextResponse.json({ 
                success: false,
                message: 'Server uniqueId is required.' 
            }, { status: 400 });
        }

        if (!command || typeof command !== 'string') {
            return NextResponse.json({ 
                success: false,
                message: 'Command is required and must be a string.' 
            }, { status: 400 });
        }

        // Find the server and verify ownership
        const server = await Server.findOne({
            email: user.email,
            uniqueId: uniqueId
        });

        if (!server) {
            return NextResponse.json({ 
                success: false,
                message: 'Server not found or access denied.' 
            }, { status: 404 });
        }

        const environmentId = server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1);
        const containerName = `mc-${server.uniqueId}`;
        
        // Find container
        const container = await portainer.getContainerByIdentifier(containerName, environmentId);
        
        if (!container) {
            return NextResponse.json({ 
                success: false,
                message: 'Server container not found.' 
            }, { status: 404 });
        }

        // Check if container is running
        if (container.State !== 'running') {
            return NextResponse.json({ 
                success: false,
                message: `Server is not running (current state: ${container.State}). Start the server first.`,
                containerState: container.State
            }, { status: 400 });
        }

        // Use RCON to send command if available, otherwise use docker exec
        // For Minecraft servers, we can use the attach/exec functionality
        // Send command through stdin to the container
        const escapedCommand = command.replace(/"/g, '\\"');
        const result = await portainer.executeCommand(
            container.Id, 
            `echo "${escapedCommand}" > /proc/1/fd/0`,
            environmentId
        );

        return NextResponse.json({ 
            success: true,
            message: `Command sent: ${command}`,
            result
        });

    } catch (error) {
        console.error('[Server Console] Error executing command:', error);
        return NextResponse.json({ 
            success: false,
            message: 'Failed to execute command.' 
        }, { status: 500 });
    }
}
