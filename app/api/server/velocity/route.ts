import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Server from "@/lib/objects/Server";
import verificationService from "@/lib/server/verify";
import velocityService from "@/lib/server/velocity";
import BodyParser from "@/lib/db/bodyParser";
import portainer from "@/lib/server/portainer";

import { IServer } from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";

export async function POST(request: NextRequest) {
    await dbConnect();
    
    try {
        const { serverId, action } = await BodyParser.parseAuto(request);

        if (!serverId) {
            return NextResponse.json({ error: "Server ID is required." }, { status: 400 });
        }

        const user = await verificationService.getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Find the server
        const server = await Server.findOne({
            uniqueId: serverId,
            email: user.email
        });

        if (!server) {
            return NextResponse.json({ error: "Server not found." }, { status: 404 });
        }

        if (action === 'configure') {
            return await configureServerForVelocity(server, user);
        }

        return NextResponse.json({ error: "Invalid action." }, { status: 400 });

    } catch (error) {
        console.error('Error in velocity configuration:', error);
        return NextResponse.json(
            { 
                error: 'Failed to configure Velocity',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            },
            { status: 500 }
        );
    }
}

async function configureServerForVelocity(server: IServer, user: IUser) {
    try {
        console.log(`Starting Velocity configuration for server ${server.uniqueId}`);

        // Get Portainer environment
        const environments = await portainer.getEnvironments();
        if (environments.length === 0) {
            throw new Error('No Portainer environments available');
        }

        const environmentId = environments[0].Id;

        // Find the container
        const containers = await portainer.getContainers(environmentId);
        const serverContainer = containers.find(container =>
            container.Names.some(name => 
                name.includes(`mc-${server.uniqueId}`) ||
                name.includes(`minecraft-${server.uniqueId}`)
            )
        );

        if (!serverContainer) {
            throw new Error('Server container not found');
        }

        const containerId = serverContainer.Id;

        // Step 1: Wait for server files to be created
        console.log('Waiting for server files to be created...');
        const filesReady = await velocityService.waitForServerFilesToBeCreated(
            containerId,
            environmentId,
            120000 // 2 minutes timeout
        );

        if (!filesReady.success) {
            throw new Error(filesReady.error || 'Timeout waiting for server files');
        }

        // Step 2: Stop the container to configure files
        console.log('Stopping container for configuration...');
        if (serverContainer.State === 'running') {
            await portainer.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/stop`
            );
            
            // Wait a moment for the container to fully stop
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Step 3: Configure server for Velocity
        const velocityConfig = {
            serverId: server.uniqueId,
            serverName: server.serverName,
            address: `mc-${server.uniqueId}:25565`, // Container name:port for internal network
            port: server.port || 25565,
            motd: server.serverConfig?.motd || server.serverName,
            restrictedToProxy: true,
            playerInfoForwardingMode: 'legacy' as const, // For <1.13 support
            forwardingSecret: process.env.VELOCITY_FORWARDING_SECRET || 'velocity-secret'
        };

        const configResult = await velocityService.configureServerForVelocity(
            velocityConfig,
            user.email,
            server.uniqueId
        );

        if (!configResult.success) {
            throw new Error(configResult.error || 'Failed to configure server for Velocity');
        }

        // Step 4: Restart the container
        console.log('Restarting container with Velocity configuration...');
        await portainer.axiosInstance.post(
            `/api/endpoints/${environmentId}/docker/containers/${containerId}/start`
        );

        return NextResponse.json({
            success: true,
            message: 'Server successfully configured for Velocity proxy',
            details: configResult.details,
            velocityConfig: {
                serverName: velocityConfig.serverName,
                address: velocityConfig.address,
                forwardingMode: velocityConfig.playerInfoForwardingMode
            }
        });

    } catch (error) {
        console.error('Error configuring server for Velocity:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                message: 'Failed to configure server for Velocity proxy'
            },
            { status: 500 }
        );
    }
}
