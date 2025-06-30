import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import User from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import jwt from "jsonwebtoken";

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

        // TODO: Add logic to delete the server files and configurations from the file server

        // Delete the server
        await Server.deleteOne({ uniqueId: serverId });
        return NextResponse.json({ message: 'Server deleted successfully.' }, { status: 200 });
    } catch (error) {
        console.error("Error deleting server:", error);
        return NextResponse.json({ error: "Failed to delete server." }, { status: 500 });
    }
}