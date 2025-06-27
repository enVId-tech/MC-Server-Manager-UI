import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/lib/objects/User";
import Server from "@/lib/objects/Server";

/** Route to fetch server configuration for the authenticated user.
  * @param request - The incoming request object.
  * @returns A JSON response containing the server configuration or an error message.
  */

export async function GET(request: Request) {
    await dbConnect();
    try {
        // Fetch servers that match the user's email
        const sessionToken = request.headers.get("sessionToken");
        if (!sessionToken) {
            return NextResponse.json({ error: "Session token is required." }, { status: 400 });
        }

        const user = await User.findOne({ sessionToken });
        if (!user) {
            return NextResponse.json({ error: "Invalid session token." }, { status: 401 });
        }

        const servers = await Server.find({ email: user.email }).select("-__v -createdAt -updatedAt");
        if (!servers || servers.length === 0) {
            return NextResponse.json({ message: "No servers found for this user." }, { status: 404 });
        }

        // Format the server data
        const serverData = servers.map(server => ({
            isOnline: server.isOnline,
            subdomainName: server.subdomainName,
            serverName: server.serverName,
        }));

        return NextResponse.json({ servers: serverData }, { status: 200 });
    } catch (error) {
        console.error("Error fetching server configuration:", error);
        return NextResponse.json({ error: "Failed to fetch server configuration." }, { status: 500 });
    }
}