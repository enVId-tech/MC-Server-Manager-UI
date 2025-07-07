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
        const { uniqueId, signal = 'SIGKILL' } = await request.json();
        if (!uniqueId) {
            return NextResponse.json({ message: 'Server unique ID is required.' }, { status: 400 });
        }

        // Find the server by slug (uniqueId, subdomain, or serverName)
        const server = await Server.findOne({
            $and: [
                { email: user.email }, // Ensure user owns the server
                {
                    $or: [
                        { uniqueId: uniqueId },
                    ]
                }
            ]
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        // Get container by server MongoDB uniqueId (containers are named mc-{uniqueId})
        const containerIdentifier = `mc-${server.uniqueId}`;
        const container = await portainer.getContainerByIdentifier(containerIdentifier);
        
        if (!container) {
            return NextResponse.json({ message: 'Container not found for this server.' }, { status: 404 });
        }

        // Kill the container
        await portainer.killContainer(container.Id, null, signal);
        
        // Update server status in database (use updateOne to avoid validation issues)
        await Server.updateOne(
            { uniqueId: server.uniqueId },
            { $set: { isOnline: false } }
        );

        return NextResponse.json({ 
            message: 'Server killed successfully.',
            containerId: container.Id,
            containerName: container.Names?.[0]?.replace(/^\//, '') || 'Unknown',
            signal
        }, { status: 200 });

    } catch (error) {
        console.error('Error killing server:', error);
        return NextResponse.json({ 
            message: 'Failed to kill server.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
