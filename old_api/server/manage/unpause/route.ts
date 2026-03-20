import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";

export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Get server identifier from request body
        const { uniqueId } = await request.json();
        const serverIdentifier = uniqueId;

        if (!serverIdentifier) {
            return NextResponse.json({ message: 'Server identifier (uniqueId) is required.' }, { status: 400 });
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

        // Dynamically get Portainer environment ID - fail if not available
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
            console.log(`Using environment ID: ${availableEnvironment.Id}`);

        } catch (error) {
            return NextResponse.json({
                message: 'Failed to connect to Portainer',
                error: error instanceof Error ? error.message : 'Unknown error'
            }, { status: 500 });
        }

        // Get container by server uniqueId (containers are named mc-{uniqueId})
        const containerIdentifier = `mc-${server.uniqueId}`;
        const container = await portainer.getContainerByIdentifier(containerIdentifier, portainerEnvironmentId);
        
        if (!container) {
            return NextResponse.json({ message: `Container '${containerIdentifier}' not found for this server.` }, { status: 404 });
        }

        // Check if container is paused (you can only unpause paused containers)
        if (container.State !== 'paused') {
            return NextResponse.json({ 
                message: `Container '${containerIdentifier}' is not paused and cannot be unpaused. Current state: ${container.State}` 
            }, { status: 400 });
        }

        // Unpause the container with the proper environment ID
        await portainer.unpauseContainer(container.Id, portainerEnvironmentId);
        
        // Update server status in database if needed
        // server.isOnline = true; // Should already be true since it was paused, not stopped

        return NextResponse.json({ 
            message: 'Server unpaused successfully.',
            containerId: container.Id,
            containerName: container.Names?.[0]?.replace(/^\//, '') || 'Unknown',
            previousState: container.State
        }, { status: 200 });

    } catch (error) {
        console.error('Error unpausing server:', error);
        return NextResponse.json({ 
            message: 'Failed to unpause server.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
