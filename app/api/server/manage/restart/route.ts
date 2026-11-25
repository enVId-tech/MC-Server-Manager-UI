import { ownerFilter } from '@/lib/server/access';
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";
import { getContainerName } from '@/lib/server/containerNames';
import { addonsOf, applyStagedAddons } from '@/lib/server/addons/manager';

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
                { ...ownerFilter(user) }, // Ensure user owns the server
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
        const containerIdentifier = getContainerName(server);
        const container = await portainer.getContainerByIdentifier(containerIdentifier, portainerEnvironmentId);
        
        if (!container) {
            return NextResponse.json({ message: 'Container not found for this server.' }, { status: 404 });
        }

        // If plugin/mod updates are staged, stop first so open jars unlock, swap to new versioned files (and delete old ones), then start
        const hasStaged = addonsOf(server).some(entry => Boolean(entry.staged));
        if (hasStaged) {
            if (['running', 'restarting', 'paused'].includes(container.State)) {
                await portainer.stopContainer(container.Id, portainerEnvironmentId, Math.max(timeout, 20));
            }
            await applyStagedAddons(server).catch(error => console.warn('Staged add-ons not applied:', error instanceof Error ? error.message : error));
            await portainer.startContainer(container.Id, portainerEnvironmentId);
        } else {
            await portainer.restartContainer(container.Id, portainerEnvironmentId, timeout);
        }
        
        // Update server status in database (use updateOne to avoid validation issues)
        await Server.updateOne(
            { _id: server._id },
            { $set: { isOnline: true, transition: { action: 'starting', at: new Date() } } }
        );

        return NextResponse.json({ 
            message: 'Server restarted successfully.',
            containerId: container.Id,
            containerName: container.Names?.[0]?.replace(/^\//, '') || 'Unknown'
        }, { status: 200 });

    } catch (error) {
        console.error('Error restarting server:', error);
        return NextResponse.json({ 
            message: 'Failed to restart server.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
