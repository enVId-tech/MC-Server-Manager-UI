import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import jwt from "jsonwebtoken";
import User from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";

export async function DELETE(request: NextRequest) {
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
        const { serverSlug, force = true, removeVolumes = false } = await request.json();
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

        // Get container by server MongoDB _id (containers are named mc-{_id})
        const containerIdentifier = `mc-${server._id}`;
        const container = await portainer.getContainerByIdentifier(containerIdentifier);
        
        if (container) {
            // If container is running, stop it first (unless force is true)
            if (container.State === 'running' && !force) {
                try {
                    await portainer.stopContainer(container.Id);
                } catch (stopError) {
                    console.warn('Failed to stop container before deletion:', stopError);
                    // Continue with force removal
                }
            }

            // Remove the container
            await portainer.removeContainer(container.Id, null, force, removeVolumes);
        }
        
        // Remove server from database
        await Server.findByIdAndDelete(server._id);

        return NextResponse.json({ 
            message: 'Server deleted successfully.',
            serverId: server.uniqueId,
            serverName: server.serverName,
            containerRemoved: !!container,
            volumesRemoved: removeVolumes
        }, { status: 200 });

    } catch (error) {
        console.error('Error deleting server:', error);
        return NextResponse.json({ 
            message: 'Failed to delete server.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
