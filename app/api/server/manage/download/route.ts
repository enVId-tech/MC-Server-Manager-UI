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

        // Get server identifier from request body
        const { serverSlug } = await request.json();
        if (!serverSlug) {
            return NextResponse.json({ message: 'Server slug is required.' }, { status: 400 });
        }

        // Find the server by slug (uniqueId, subdomain, or serverName)
        const server = await Server.findOne({
            $and: [
                { email: user.email }, // Ensure user owns the server
                {
                    $or: [
                        { uniqueId: serverSlug },
                        { subdomainName: serverSlug },
                        { serverName: serverSlug }
                    ]
                }
            ]
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        // Get container by server name or unique ID
        const containerIdentifier = server.serverName || server.uniqueId;
        const container = await portainer.getContainerByIdentifier(containerIdentifier);
        
        if (!container) {
            return NextResponse.json({ message: 'Container not found for this server.' }, { status: 404 });
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
            downloadUrl: `/api/server/export/${server.uniqueId}`, // Future implementation
            instructions: [
                'This endpoint prepares server data for download.',
                'Container volumes and configuration will be packaged.',
                'Download will be available via the provided URL.',
                'Please ensure the server is stopped before downloading for data consistency.'
            ]
        };

        // TODO: Implement actual container export/backup logic here
        // This could involve:
        // 1. Creating a tar archive of container volumes
        // 2. Exporting container image
        // 3. Packaging configuration files
        // 4. Generating download links

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
