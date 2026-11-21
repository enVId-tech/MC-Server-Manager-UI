import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import portainer from '@/lib/server/portainer';
import Server from '@/lib/objects/Server';
import { findServerForUser } from '@/lib/server/access';
import { createMinecraftServerFromRecord } from '@/lib/server/minecraft';
import { syncServerNetwork } from '@/lib/server/network/service';
import { getContainerName } from '@/lib/server/containerNames';

const VERSION_PATTERN = /^(LATEST|SNAPSHOT|\d{1,2}\.\d{1,2}(\.\d{1,2})?(-(pre|rc)\d+)?|\d{2}w\d{2}[a-z])$/i;

/**
 * POST /api/server/update   { uniqueId, action: 'image' }                 pulls the newest image and recreates the container
 *                           { uniqueId, action: 'version', version }      moves the server to another Minecraft version
 * Administrators only. The world and files are kept; the container is recreated, which takes a few seconds.
 */
export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        const user = await verificationService.getUserFromToken(request);
        if (!user || !user.isActive) return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });
        if (!user.isAdmin) return NextResponse.json({ message: 'Only administrators can update images and versions.' }, { status: 403 });

        const body = await BodyParser.parseAuto(request);
        const server = body.uniqueId ? await findServerForUser(user, String(body.uniqueId)) : null;
        if (!server || server.kind === 'proxy') return NextResponse.json({ message: 'Server not found.' }, { status: 404 });
        if (server.imported) {
            return NextResponse.json({ message: 'This server was imported. Its container is defined elsewhere, so its image and version are changed there.' }, { status: 409 });
        }
        if (body.action !== 'image' && body.action !== 'version') return NextResponse.json({ message: 'Unknown action.' }, { status: 400 });

        if (body.action === 'version') {
            const version = String(body.version ?? '').trim();
            if (!VERSION_PATTERN.test(version)) return NextResponse.json({ message: 'That is not a Minecraft version.' }, { status: 400 });
            await Server.updateOne({ _id: server._id }, { $set: { 'serverConfig.version': version } });
            server.set('serverConfig.version', version);
        }

        const environments = await portainer.getEnvironments();
        if (environments.length === 0) return NextResponse.json({ message: 'No container environment is available.' }, { status: 503 });
        const environmentId = environments[0].Id;
        portainer.DefaultEnvironmentId = environmentId;

        // The version decides which proxies the server can be behind, so that is worked out again first
        const details: string[] = [];
        const synced = await syncServerNetwork(server, { environmentId });
        details.push(...synced.details);
        const fresh = (await Server.findOne({ _id: server._id })) ?? server;

        const stack = await portainer.getStackByName(`minecraft-${fresh.uniqueId}`);
        if (!stack) return NextResponse.json({ message: `The container stack of ${getContainerName(fresh)} was not found. Redeploy the server first.` }, { status: 404 });
        await portainer.updateStack(stack.Id, createMinecraftServerFromRecord(fresh, environmentId, fresh.email).generateDockerComposeYaml(), environmentId, true);

        return NextResponse.json({
            success: true,
            message: body.action === 'image' ? 'The image was pulled and the server is restarting.' : `The server is moving to ${body.version} and is restarting.`,
            details,
        });
    } catch (error) {
        console.error('Server update failed:', error);
        return NextResponse.json({ message: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
    }
}
