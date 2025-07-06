import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import jwt from "jsonwebtoken";
import User from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import porkbun from "@/lib/server/porkbun";
import webdavService from "@/lib/server/webdav";
import { MinecraftServer } from "@/lib/server/minecraft";

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
        const { uniqueId, force = true, removeVolumes = false } = await request.json();
        if (!uniqueId) {
            return NextResponse.json({ message: 'Server identifier (uniqueId) is required.' }, { status: 400 });
        }

        // Find the server by slug (uniqueId, subdomain, or serverName)
        const server = await Server.findOne({
            $and: [
                { email: user.email }, // Ensure user owns the server
                {
                    $or: [
                        { uniqueId: uniqueId },
                        { subdomainName: uniqueId },
                        { serverName: uniqueId }
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

        // Remove the associated DNS record if it exists
        if (server.subdomainName) {
            try {
                await porkbun.deleteDnsRecord(server.subdomainName, server.email);
            } catch (error) {
                console.error('Error deleting DNS record:', error);
            }
        }

        // Delete all server files using MinecraftServer class
        let filesDeleted = false;
        let deletedPaths: string[] = [];
        let localPaths: string[] = [];
        
        if (removeVolumes) {
            try {
                const environmentId = await portainer.getFirstEnvironmentId();

                // Ensure environment ID is valid
                if (!environmentId) {
                    throw new Error('No valid environment ID found for file deletion');
                }

                // Create a MinecraftServer instance to handle file deletion
                const minecraftServer = new MinecraftServer(
                    { 
                        EULA: true, 
                        userEmail: server.email,
                        SERVER_NAME: server.serverName 
                    },
                    server.serverName,
                    server.uniqueId,
                    environmentId || 1 // Default to environment ID 1 if not set
                );

                // Delete all server files
                const deleteResult = await minecraftServer.deleteAllServerFiles();
                
                if (deleteResult.success) {
                    filesDeleted = true;
                    deletedPaths = deleteResult.deletedPaths || [];
                    localPaths = deleteResult.localPaths || [];
                    console.log(`Successfully deleted ${deletedPaths.length} server files for ${server.serverName}`);
                } else {
                    console.error('Failed to delete server files:', deleteResult.error);
                }
            } catch (error) {
                console.error('Error deleting server files:', error);
                
                // Fallback to basic WebDAV deletion
                try {
                    await webdavService.deleteDirectory(`/servers/${server.uniqueId}`);
                    filesDeleted = true;
                    console.log('Fallback: Basic WebDAV deletion completed');
                } catch (fallbackError) {
                    console.error('Fallback deletion also failed:', fallbackError);
                }
            }
        }

        return NextResponse.json({ 
            message: 'Server deleted successfully.',
            serverId: server.uniqueId,
            serverName: server.serverName,
            containerRemoved: !!container,
            volumesRemoved: removeVolumes,
            filesDeleted,
            deletedPathsCount: deletedPaths.length,
            localPathsForCleanup: localPaths
        }, { status: 200 });

    } catch (error) {
        console.error('Error deleting server:', error);
        return NextResponse.json({ 
            message: 'Failed to delete server.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
