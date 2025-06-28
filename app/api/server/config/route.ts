import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import mongoose from "mongoose";
import ServerConfig from "@/lib/objects/ServerConfig"; // For storing individual server configurations

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
export async function POST(request: Request) {
    try {
        const config = await request.json();

        console.log("Received server configuration:", config);

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

        await dbConnect();

        // Check for existing server with the same name or subdomain
        const existingServer = await ServerConfig.findOne({
            $or: [
                { name: config.name },
                { subdomain: config.subdomain }
            ]
        });

        if (existingServer) {
            return NextResponse.json({ error: "Server with the same name or subdomain already exists." }, { status: 400 });
        }

        // Create a new server configuration document with all properties
        const newServerConfig = new ServerConfig({
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
        });

        const savedConfig = await newServerConfig.save();

        console.log("Successfully created server configuration:", savedConfig._id);

        return NextResponse.json({
            message: "Server configuration created successfully",
            serverId: savedConfig._id,
            config: {
                name: savedConfig.name,
                serverType: savedConfig.serverType,
                version: savedConfig.version,
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