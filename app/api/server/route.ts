import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";

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