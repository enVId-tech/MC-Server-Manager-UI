import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";
import { publicSubdomain } from '@/lib/server/subdomain';
import { getContainerName } from '@/lib/server/containerNames';
import { statusFromContainer, type LiveStatus } from '@/lib/server/containerStatus';
import type { PortainerContainer } from '@/lib/server/portainer';
import { getPlayers } from '@/lib/server/liveStats';

/** Route to fetch server configuration for the authenticated user.
  * @param request - The incoming request object.
  * @returns A JSON response containing the server configuration or an error message.
  */

export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }
        const servers = await Server.find({ email: user.email, kind: { $ne: 'proxy' } }).select("-__v -createdAt -updatedAt");
        
        if (!servers || servers.length === 0) {
            return NextResponse.json({ servers: [] }, { status: 200 });
        }

        // The live state of every container, one request per Docker environment. When Docker cannot be asked,
        // the last known state is shown.
        const defaultEnvironment = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID, 10) : null;
        const containersByEnvironment = new Map<number | null, PortainerContainer[] | null>();
        for (const environmentId of new Set(servers.map(server => server.environmentId ?? defaultEnvironment))) {
            try {
                containersByEnvironment.set(environmentId, await portainer.getContainers(await portainer.getValidEnvironmentId(environmentId), true));
            } catch {
                containersByEnvironment.set(environmentId, null);
            }
        }
        const liveStatus = (server: (typeof servers)[number]): LiveStatus => {
            const containers = containersByEnvironment.get(server.environmentId ?? defaultEnvironment);
            if (!containers) return server.isOnline ? 'online' : 'offline';
            const name = getContainerName(server);
            const container = containers.find(candidate => candidate.Names?.some(item => item.replace(/^\//, '') === name));
            return statusFromContainer(container, server.transition);
        };

        // Players are asked from every server that is online, a few at a time, and none may hold the list up
        const containerOf = (server: (typeof servers)[number]) => {
            const name = getContainerName(server);
            return containersByEnvironment.get(server.environmentId ?? defaultEnvironment)?.find(candidate => candidate.Names?.some(item => item.replace(/^\//, '') === name));
        };
        const online = servers.filter(server => {
            const status = liveStatus(server);
            return status === 'online' || status === 'unhealthy';
        });
        const live = new Map<string, { online: number; max: number | null }>();
        const queue = [...online];
        const worker = async () => {
            for (let server = queue.shift(); server; server = queue.shift()) {
                const container = containerOf(server);
                if (!container) continue;
                try {
                    const environmentId = await portainer.getValidEnvironmentId(server.environmentId ?? defaultEnvironment);
                    const count = await Promise.race([
                        getPlayers(container.Id, environmentId),
                        new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
                    ]);
                    if (count) live.set(server.uniqueId, { online: count.online, max: count.max });
                } catch { /* shown as 0 */ }
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, online.length) }, worker));

        // Format the server data
        const serverData = servers.map(server => ({
            id: server.uniqueId,
            serverName: server.serverName,
            isOnline: liveStatus(server),
            subdomainName: publicSubdomain(server.subdomainName),
            serverType: server.serverConfig?.serverType || "unknown",
            // Nobody is on a server that is not running; a running one is asked
            players: live.get(server.uniqueId)?.online ?? 0,
            maxPlayers: live.get(server.uniqueId)?.max || server.serverConfig?.maxPlayers || 0,
            version: server.serverConfig?.version || "unknown",
        }));

        return NextResponse.json({ servers: serverData }, { status: 200 });
    } catch (error) {
        console.error("Error fetching server configuration:", error);
        return NextResponse.json({ error: "Failed to fetch server configuration." }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    await dbConnect();
    
    // Log deprecation warning
    console.warn('⚠️  DEPRECATION WARNING: /api/server DELETE endpoint is deprecated. Please use /api/server/delete for comprehensive server deletion with proper cleanup.');
    
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Find the server by ID from the request body
        const { serverId } = await request.json();

        console.log("Deleting server with ID:", serverId);

        if (!serverId) {
            return NextResponse.json({ message: 'Server ID is required.' }, { status: 400 });
        }

        const server = await Server.findOne({ uniqueId: serverId, email: user.email });
        if (!server) {
            return NextResponse.json({ message: 'Server not found.' }, { status: 404 });
        }

        console.log("Starting server deletion process for:", server.serverName);

        // Step 1: Delete from Portainer if deployed
        try {
            portainer.DefaultEnvironmentId = (await portainer.getEnvironments()).pop()?.Id || null;
            const stacks = await portainer.getStacks();
            const serverStack = stacks.find(stack => stack.Name === server.uniqueId);

            if (serverStack) {
                console.log("Deleting Portainer stack:", serverStack.Name);
                await portainer.deleteStack(serverStack.Id);
                console.log("Portainer stack deleted successfully");
            }
        } catch (error) {
            console.error("Error deleting from Portainer:", error);
            // Don't fail the entire deletion if Portainer cleanup fails
        }

        // Step 2: Delete the server record from database
        await Server.deleteOne({ uniqueId: serverId });
        console.log("Server deleted successfully from database");

        return NextResponse.json({
            message: 'Server deleted successfully.',
            details: {
                containerDeleted: true,
                databaseRecordDeleted: true
            }
        }, { status: 200 });
    } catch (error) {
        console.error("Error deleting server:", error);
        return NextResponse.json({ error: "Failed to delete server." }, { status: 500 });
    }
}