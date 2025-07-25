import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import mongoose from "mongoose";
import Server from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";
import { ServerConfigData } from "@/lib/objects/ServerConfig";
import BodyParser from "@/lib/db/bodyParser";
import portainer from "@/lib/server/portainer";
import MinecraftServerManager from "@/lib/server/serverManager";
import { v4 as uuidv4 } from 'uuid';
import verificationService from "@/lib/server/verify";

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
// This now uses a transactional approach: validate everything first, create external resources,
// and only save to database after all steps succeed.
export async function POST(request: NextRequest) {
    const rollbackActions: (() => Promise<void>)[] = [];

    // Connect to the database
    await dbConnect();

    try {
        // Apply body parsing to get the configuration object
        const config = await BodyParser.parseAuto(request);
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }
        const email: string = user.email;
        if (!email) {
            console.warn("User email not found in session.");
            const response = NextResponse.json({ error: "User email not found." }, { status: 401 });
            response.cookies.delete('sessionToken');
            return response;
        }

        // === VALIDATION PHASE ===
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

        // Validate the subdomain format
        const subdomainRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
        if (!subdomainRegex.test(config.subdomain)) {
            return NextResponse.json({ error: "Invalid subdomain format. Only lowercase letters, numbers, and hyphens are allowed." }, { status: 400 });
        }

        // Check if there is a server with the same name in the user's account
        const existingNameServer = await Server.findOne({
            email: user.email,
            serverName: config.name
        });

        if (existingNameServer) {
            return NextResponse.json({ error: "Server with the same name already exists in your account." }, { status: 400 });
        }

        // Validate subdomain using MinecraftServerManager (checks prohibited list and conflicts)
        const fullSubdomain = `${config.subdomain}.mc.etran.dev`;
        const subdomainValidation = await MinecraftServerManager.validateSubdomain(config.subdomain, email);
        if (!subdomainValidation.isValid) {
            return NextResponse.json({ error: subdomainValidation.error }, { status: 400 });
        }

        // === PORT ALLOCATION PHASE ===
        // Portainer is required - fail if not available
        let portainerEnvironmentId: number;
        try {
            const environments = await portainer.getEnvironments();
            if (environments.length === 0) {
                return NextResponse.json({
                    error: "No Portainer environments found. Server creation requires a valid Portainer environment."
                }, { status: 503 });
            }

            // Use the first available environment (you can modify this logic to select a specific environment)
            const availableEnvironment = environments[0];
            portainer.DefaultEnvironmentId = availableEnvironment.Id;
            portainerEnvironmentId = availableEnvironment.Id;
            console.log(`Using Portainer environment: ${availableEnvironment.Id} (${availableEnvironment.Name})`);

        } catch (error) {
            console.error("Failed to connect to Portainer:", error instanceof Error ? error.message : 'Unknown error');
            return NextResponse.json({
                error: "Unable to connect to Portainer. Server creation requires Portainer to be available.",
                details: error instanceof Error ? error.message : 'Unknown error'
            }, { status: 503 });
        }

        // Allocate port for the server
        const needsRcon = config.rconEnabled || false;
        const portAllocation = await MinecraftServerManager.allocatePort(email, needsRcon, portainerEnvironmentId);
        if (!portAllocation.success) {
            return NextResponse.json({ error: portAllocation.error }, { status: 500 });
        }

        const allocatedPort = portAllocation.port!;
        const allocatedRconPort = portAllocation.rconPort;

        // === EXTERNAL RESOURCE CREATION PHASE ===
        // Generate unique ID for the server - use UUID for security
        // This ensures complete uniqueness and prevents predictable IDs
        const uniqueId = uuidv4();

        // Create server folder structure in WebDAV with JAR download
        const folderCreation = await MinecraftServerManager.createServerFolder(
            uniqueId,
            email,
            config.serverType
        );

        if (!folderCreation.success) {
            return NextResponse.json({ error: folderCreation.error }, { status: 500 });
        }

        if (folderCreation.rollbackAction) {
            rollbackActions.push(folderCreation.rollbackAction);
        }

        // === SERVER CONFIGURATION CREATION ===
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

            // Network settings - use allocated ports
            port: allocatedPort,
            subdomain: config.subdomain,

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
            serverMemory: config.serverMemory || 1024,

            // Server properties (from advanced section)
            serverProperties: config.serverProperties || {},

            // File information
            plugins: config.plugins || [],
            mods: config.mods || [],
            worldFiles: config.worldFiles || null
        };

        // === DATABASE INSERTION PHASE ===
        // Only now, after all external resources are created successfully, save to database
        const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
        const userFolder = email.split('@')[0];
        const folderPath = `${baseServerPath}/${userFolder}/${uniqueId}`;

        const newServer = new Server({
            email: user.email,
            uniqueId: uniqueId,
            subdomainName: fullSubdomain,
            isOnline: false, // Default to offline when created
            folderPath: folderPath,
            serverName: config.name,
            createdAt: new Date(),
            port: allocatedPort,
            rconPort: allocatedRconPort,
            serverConfig: serverConfigData // Embed the configuration directly
        });

        // Save the server to database
        await newServer.save();

        // Add database rollback action
        rollbackActions.push(async () => {
            try {
                await Server.findOneAndDelete({ uniqueId: uniqueId });
                console.log(`Deleted server ${uniqueId} from database during rollback`);
            } catch (error) {
                console.error(`Error deleting server ${uniqueId} during rollback:`, error);
            }
        });

        // === SUCCESS RESPONSE ===
        console.log(`Server created successfully with uniqueId: ${newServer.uniqueId}`);
        
        return NextResponse.json({
            message: "Server created successfully",
            serverId: newServer.uniqueId, // Use uniqueId as serverId for consistency
            uniqueId: newServer.uniqueId,
            config: {
                name: serverConfigData.name,
                serverType: serverConfigData.serverType,
                version: serverConfigData.version,
                subdomain: config.subdomain,
                port: allocatedPort,
                rconPort: allocatedRconPort,
                uniqueId: uniqueId
            }
        }, { status: 201 });

    } catch (error) {
        console.error("Error creating server:", error);

        // Execute rollback actions if any external resources were created
        if (rollbackActions.length > 0) {
            console.log("Error occurred, executing rollback actions...");
            await MinecraftServerManager.executeRollback(rollbackActions);
        }

        return NextResponse.json({
            error: "Failed to create server.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}