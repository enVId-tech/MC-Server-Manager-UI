import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import mongoose from "mongoose";
import Server from "@/lib/objects/Server";
import jwt from "jsonwebtoken";
import User from "@/lib/objects/User";
import { ServerConfigData } from "@/lib/objects/ServerConfig";
import BodyParser from "@/lib/db/bodyParser";

// Configure body parsing for this API route
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // Set desired value here
        },
    },
};

// Internal function to get create config (not exported)
async function getCreateConfig() {
    await dbConnect();
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error("Database connection not established.");
    }
    const collection = db.collection('create');
    // Get single combined document
    return await collection.findOne({});
}

export async function GET() {
    try {
        console.log("Fetching server configuration options...");
        
        await dbConnect();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Fetch the single combined configuration document
        const configOptions = await getCreateConfig();
        if (!configOptions) {
            console.warn("No configuration options found in CreateConfig.");
            return NextResponse.json({ error: "No server configuration options found." }, { status: 404 });
        }

        // Remove MongoDB-specific fields and return the configuration
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _id, __v, createdAt, updatedAt, ...cleanConfig } = configOptions;

        return NextResponse.json(cleanConfig, { status: 200 });
    } catch (error) {
        console.error("Error fetching server configuration options:", error);
        return NextResponse.json({ 
            error: "Failed to fetch server configuration options.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Writing a POST API route to handle creating a new server based on provided configuration from the client.
export async function POST(request: NextRequest) {
    try {
        // Apply body parsing to get the configuration object
        // This will automatically parse the JSON body of the request
        // and handle errors if the body is not valid JSON.
        const config = await BodyParser.parseAuto(request);

        console.log("Received server configuration:", config);

        // Connect to the database
        await dbConnect();
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
        const email: string = user.email;
        if (!email) {
            console.warn("User email not found in session.");
            // If the email is not found, return an error response
            // This is a critical error, as the server configuration requires an email
            // to associate the server with the user.

            // Delete the session token cookie if email is not found
            const response = NextResponse.json({ error: "User email not found." }, { status: 401 });
            response.cookies.delete('sessionToken');
            return response;
        }

        // Validate the configuration object
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            return NextResponse.json({ error: "Invalid server configuration format." }, { status: 400 });
        }

        // Ensure required fields are provided
        if (!config.name || !config.subdomain) {
            return NextResponse.json({ error: "Server name and subdomain are required." }, { status: 400 });
        }

        if (!config.serverType || !config.version) {
            return NextResponse.json({ error: "Server type and version are required." }, { status: 400 });
        }

        // Check for existing server with the same name or subdomain
        const existingServer = await Server.findOne({
            $or: [
                { serverName: config.name },
                { subdomainName: `${config.subdomain}.etran.dev` }
            ]
        });

        if (existingServer) {
            return NextResponse.json({ error: "Server with the same name or subdomain already exists." }, { status: 400 });
        }

        // Create a new server configuration document with all properties
        const serverConfigData: ServerConfigData = {
            // Basic server information
            name: config.name,
            serverType: config.serverType,
            version: config.version,
            description: config.description || '',
            
            // World settings
            seed: config.seed || '',
            gameMode: config.gameMode || 'survival',
            difficulty: config.difficulty || 'easy',
            worldType: config.worldType || 'default',
            worldGeneration: config.worldGeneration || 'new',
            worldFile: config.worldFile || null,
            
            // Player settings
            maxPlayers: config.maxPlayers || 20,
            whitelistEnabled: config.whitelistEnabled || false,
            onlineMode: config.onlineMode !== undefined ? config.onlineMode : true,
            
            // Game mechanics
            pvpEnabled: config.pvpEnabled !== undefined ? config.pvpEnabled : true,
            commandBlocksEnabled: config.commandBlocksEnabled || false,
            flightEnabled: config.flightEnabled || false,
            spawnAnimalsEnabled: config.spawnAnimalsEnabled !== undefined ? config.spawnAnimalsEnabled : true,
            spawnMonstersEnabled: config.spawnMonstersEnabled !== undefined ? config.spawnMonstersEnabled : true,
            spawnNpcsEnabled: config.spawnNpcsEnabled !== undefined ? config.spawnNpcsEnabled : true,
            generateStructuresEnabled: config.generateStructuresEnabled !== undefined ? config.generateStructuresEnabled : true,
            
            // Network settings
            port: config.port || 25565,
            
            // Performance settings
            viewDistance: config.viewDistance || 10,
            simulationDistance: config.simulationDistance || 10,
            spawnProtection: config.spawnProtection !== undefined ? config.spawnProtection : 16,
            
            // Server management
            rconEnabled: config.rconEnabled || false,
            rconPassword: config.rconPassword || '',
            motd: config.motd || 'A Minecraft Server',
            
            // Resource settings
            resourcePackUrl: config.resourcePackUrl || '',
            resourcePackSha1: config.resourcePackSha1 || '',
            resourcePackPrompt: config.resourcePackPrompt || '',
            forceResourcePack: config.forceResourcePack || false,
            
            // Advanced settings
            enableJmxMonitoring: config.enableJmxMonitoring || false,
            syncChunkWrites: config.syncChunkWrites !== undefined ? config.syncChunkWrites : true,
            enforceWhitelist: config.enforceWhitelist || false,
            preventProxyConnections: config.preventProxyConnections || false,
            hideOnlinePlayers: config.hideOnlinePlayers || false,
            broadcastRconToOps: config.broadcastRconToOps !== undefined ? config.broadcastRconToOps : true,
            broadcastConsoleToOps: config.broadcastConsoleToOps !== undefined ? config.broadcastConsoleToOps : true,
            
            // Memory and performance
            serverMemory: config.serverMemory || 1024
        };

        const newServer = new Server({
            email: user.email,
            uniqueId: new mongoose.Types.ObjectId().toString(), // Generate a unique ID
            subdomainName: `${config.subdomain}.etran.dev`,
            isOnline: false, // Default to offline when created
            folderPath: `${process.env.FOLDER_PATH || '/servers/otherServers'}/${email.split('@')[0]}/${config.name}`,
            serverName: config.name,
            createdAt: new Date(),
            serverConfig: serverConfigData // Embed the configuration directly
        });

        // Save only the server (which includes the embedded configuration)
        await newServer.save();

        console.log("Successfully created server configuration:", newServer._id);

        return NextResponse.json({
            message: "Server configuration created successfully",
            serverId: newServer._id,
            config: {
                name: serverConfigData.name,
                serverType: serverConfigData.serverType,
                version: serverConfigData.version,
                subdomain: config.subdomain
            }
        }, { status: 201 });
    } catch (error) {
        console.error("Error creating server configuration:", error);
        return NextResponse.json({
            error: "Failed to create server configuration.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}