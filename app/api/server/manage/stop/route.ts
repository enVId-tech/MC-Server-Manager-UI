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

        // Get server identifier from request body (handle both serverSlug and uniqueId for compatibility)
        const { uniqueId, timeout = 10 } = await request.json();
        const serverIdentifier = uniqueId;

        if (!serverIdentifier) {
            return NextResponse.json({ message: 'Server identifier (serverSlug or uniqueId) is required.' }, { status: 400 });
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
            return NextResponse.json({ message: `Container '${containerIdentifier}' not found for this server.` }, { status: 404 });
        }

        // Stop the container
        await portainer.stopContainer(container.Id, null, timeout);
        
        // Update server status in database (use updateOne to avoid validation issues)
        await Server.updateOne(
            { _id: server._id },
            { $set: { isOnline: false } }
        );

        return NextResponse.json({ 
            message: 'Server stopped successfully.',
            containerId: container.Id,
            containerName: container.Names?.[0]?.replace(/^\//, '') || 'Unknown'
        }, { status: 200 });

    } catch (error) {
        console.error('Error stopping server:', error);
        return NextResponse.json({ 
            message: 'Failed to stop server.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
