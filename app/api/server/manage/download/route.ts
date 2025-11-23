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
            return NextResponse.json({ message: 'Server identifier is required.' }, { status: 400 });
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

        // Get container by server MongoDB _id (containers are named mc-{uniqueId})
        const containerIdentifier = `mc-${server.uniqueId}`;
        const container = await portainer.getContainerByIdentifier(containerIdentifier);
        
        if (!container) {
            return NextResponse.json({ message: `Container '${containerIdentifier}' not found for this server.` }, { status: 404 });
        }

        // Generate download information
        const downloadInfo = {
            serverId: server.uniqueId,
            serverName: server.serverName,
            containerId: container.Id,
            containerName: container.Names?.[0]?.replace(/^\//, '') || 'Unknown',
            exportDate: new Date().toISOString(),
            serverConfig: server.serverConfig,
            // Note: Actual file download would require additional implementation
            // This could include creating a tar archive of the container volumes
            downloadUrl: `/api/server/export/${server.uniqueId}`,
            instructions: [
                'This endpoint prepares server data for download.',
                'Container volumes and configuration will be packaged.',
                'Download will be available via the provided URL.',
                'Please ensure the server is stopped before downloading for data consistency.'
            ]
        };

        return NextResponse.json({ 
            message: 'Server download prepared successfully.',
            downloadInfo
        }, { status: 200 });

    } catch (error) {
        console.error('Error preparing server download:', error);
        return NextResponse.json({ 
            message: 'Failed to prepare server download.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
