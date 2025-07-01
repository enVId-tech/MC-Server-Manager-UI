import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import User from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import jwt from "jsonwebtoken";
import { createMinecraftServer, convertClientConfigToServerConfig } from "@/lib/server/minecraft";
import portainer from "@/lib/server/portainer";

/** Route to fetch server configuration for the authenticated user.
  * @param request - The incoming request object.
  * @returns A JSON response containing the server configuration or an error message.
  */

export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        // Fetch servers that match the user's email
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
        const servers = await Server.find({ email: user.email }).select("-__v -createdAt -updatedAt");
        if (!servers || servers.length === 0) {
            return NextResponse.json({ message: "No servers found for this user." }, { status: 404 });
        }

        // Format the server data
        const serverData = servers.map(server => ({
            id: server.uniqueId,
            serverName: server.serverName,
            isOnline: server.isOnline ? "online" : "offline",
            subdomainName: server.subdomainName,
            serverType: server.serverConfig?.serverType || "unknown",
            players: server.serverConfig?.players || 0,
            maxPlayers: server.serverConfig?.maxPlayers || 0,
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

        // Step 1: Delete DNS records if they exist
        if (server.dnsRecord && server.dnsRecord.domain && server.dnsRecord.subdomain) {
            try {
                console.log(`Deleting DNS record for ${server.dnsRecord.subdomain}.${server.dnsRecord.domain}`);
                
                // Create a temporary MinecraftServer instance for DNS operations
                const tempConfig = convertClientConfigToServerConfig({
                    name: server.serverName,
                    serverType: server.serverConfig?.serverType || 'vanilla',
                    version: server.serverConfig?.version || 'latest',
                    description: '',
                    gameMode: 'survival',
                    difficulty: 'normal',
                    worldType: 'default',
                    worldGeneration: 'new',
                    maxPlayers: 20,
                    whitelistEnabled: false,
                    onlineMode: true,
                    pvpEnabled: true,
                    commandBlocksEnabled: false,
                    flightEnabled: false,
                    spawnAnimalsEnabled: true,
                    spawnMonstersEnabled: true,
                    spawnNpcsEnabled: true,
                    generateStructuresEnabled: true,
                    port: 25565,
                    viewDistance: 10,
                    simulationDistance: 10,
                    spawnProtection: 16,
                    rconEnabled: false,
                    rconPassword: '',
                    motd: 'A Minecraft Server',
                    resourcePackUrl: '',
                    resourcePackSha1: '',
                    resourcePackPrompt: '',
                    forceResourcePack: false,
                    enableJmxMonitoring: false,
                    syncChunkWrites: true,
                    enforceWhitelist: false,
                    preventProxyConnections: false,
                    hideOnlinePlayers: false,
                    broadcastRconToOps: true,
                    broadcastConsoleToOps: true,
                    serverMemory: 1024,
                    plugins: [],
                    mods: [],
                    subdomain: '',
                    worldFiles: null,
                    customOptions: ''
                });

                const minecraftServer = createMinecraftServer(tempConfig, server.serverName, server.uniqueId);
                const dnsResult = await minecraftServer.deleteDnsRecord(
                    server.dnsRecord.domain,
                    server.dnsRecord.subdomain
                );

                if (dnsResult.success) {
                    console.log("DNS record deleted successfully");
                } else {
                    console.warn("Failed to delete DNS record:", dnsResult.error);
                }
            } catch (error) {
                console.error("Error deleting DNS record:", error);
                // Don't fail the entire deletion if DNS cleanup fails
            }
        }

        // Step 2: Delete from Portainer if deployed
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

        // Step 3: Delete the server record from database
        await Server.deleteOne({ uniqueId: serverId });
        console.log("Server deleted successfully from database");

        return NextResponse.json({ 
            message: 'Server deleted successfully.',
            details: {
                dnsRecordDeleted: !!server.dnsRecord,
                containerDeleted: true,
                databaseRecordDeleted: true
            }
        }, { status: 200 });
    } catch (error) {
        console.error("Error deleting server:", error);
        return NextResponse.json({ error: "Failed to delete server." }, { status: 500 });
    }
}