import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import Server from '@/lib/objects/Server';
import { IUser } from '@/lib/objects/User';
import verificationService from '@/lib/server/verify';
import portainer from '@/lib/server/portainer';
import { createMinecraftServerFromRecord } from '@/lib/server/minecraft';
import {
    getRequiredJavaVersion,
    getServerType,
    sanitizeOverrides,
    splitOptionValues,
    type OptionValues,
} from '@/lib/data/itzg';

async function findOwnedServer(request: NextRequest, identifier: string | null) {
    const user: IUser | null = await verificationService.getUserFromToken(request);
    if (!user || !user.isActive) {
        return { error: NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 }) };
    }
    if (!identifier) {
        return { error: NextResponse.json({ message: 'A server identifier is required.' }, { status: 400 }) };
    }

    const server = await Server.findOne({
        $and: [
            { email: user.email },
            { $or: [{ uniqueId: identifier }, { subdomainName: identifier }, { serverName: identifier }] },
        ],
    });
    if (!server) {
        return { error: NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 }) };
    }
    return { user, server };
}

export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const identifier = new URL(request.url).searchParams.get('server');
        const found = await findOwnedServer(request, identifier);
        if (found.error) return found.error;
        const { server } = found;

        const config = (server.serverConfig ?? {}) as Record<string, unknown>;
        const type = getServerType(config.serverType as string)?.id ?? 'vanilla';
        const version = typeof config.version === 'string' ? config.version : 'LATEST';

        // The dedicated fields (maxPlayers, difficulty, ...) are returned as they are, the panel maps them to options
        const { itzgEnv, serverProperties } = config;

        return NextResponse.json({
            uniqueId: server.uniqueId,
            serverType: type,
            version,
            javaVersion: getRequiredJavaVersion(version),
            form: config,
            itzgEnv: (itzgEnv as OptionValues) ?? {},
            serverProperties: (serverProperties as Record<string, string>) ?? {},
        });
    } catch (error) {
        console.error('Failed to read server settings:', error);
        return NextResponse.json({ message: 'Failed to read server settings.' }, { status: 500 });
    }
}

/**
 * Saves settings and optionally applies them by updating the container stack, which recreates the
 * container (a few seconds of downtime, the world is kept).
 *
 * Body: { server, values?, serverProperties?, apply? }
 *  - values: every edited itzg setting by environment variable name, dedicated fields included
 *  - serverProperties: the complete server.properties key/value map
 */
export async function PATCH(request: NextRequest) {
    await dbConnect();
    try {
        const body = await request.json();
        const found = await findOwnedServer(request, typeof body?.server === 'string' ? body.server : null);
        if (found.error) return found.error;
        const { user, server } = found;

        const config = { ...((server.serverConfig ?? {}) as Record<string, unknown>) };
        const type = getServerType(config.serverType as string)?.id ?? 'vanilla';
        const version = typeof config.version === 'string' ? config.version : 'LATEST';

        let rejected: Record<string, string> = {};

        if (body.values !== undefined) {
            const sanitized = sanitizeOverrides(body.values, type, version);
            rejected = sanitized.rejected;
            const { form, overrides } = splitOptionValues(sanitized.values);
            Object.assign(config, form);
            config.itzgEnv = overrides;
        }

        if (body.serverProperties !== undefined) {
            const raw = body.serverProperties;
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                return NextResponse.json({ message: 'serverProperties must be an object.' }, { status: 400 });
            }
            const properties: Record<string, string> = {};
            for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
                if (!/^[a-zA-Z0-9._-]{1,100}$/.test(key)) continue;
                if (value === null || value === undefined) continue;
                const text = String(value);
                if (text.length > 8192 || text.includes('\0')) continue;
                properties[key] = text;
            }
            config.serverProperties = properties;
        }

        server.serverConfig = config;
        server.markModified('serverConfig');
        await server.save();

        let applied = false;
        let applyError: string | undefined;

        if (body.apply === true) {
            try {
                const environments = await portainer.getEnvironments();
                if (environments.length === 0) throw new Error('No container environment is available.');
                const environmentId = environments[0].Id;
                portainer.DefaultEnvironmentId = environmentId;

                const instance = createMinecraftServerFromRecord(server, environmentId, user.email);

                const stack = await portainer.getStackByName(`minecraft-${server.uniqueId}`);
                if (!stack) throw new Error('The container stack of this server was not found. Redeploy the server first.');

                await portainer.updateStack(stack.Id, instance.generateDockerComposeYaml(), environmentId, false);
                applied = true;
            } catch (error) {
                applyError = error instanceof Error ? error.message : 'Unknown error';
                console.error('Failed to apply server settings:', error);
            }
        }

        return NextResponse.json({
            saved: true,
            applied,
            applyError,
            rejected,
            message: applied
                ? 'Settings saved and applied. The server is restarting.'
                : applyError
                    ? 'Settings saved, but they could not be applied to the running server.'
                    : 'Settings saved. They take effect the next time the server is recreated.',
        });
    } catch (error) {
        console.error('Failed to save server settings:', error);
        return NextResponse.json({ message: 'Failed to save server settings.' }, { status: 500 });
    }
}
