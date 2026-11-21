import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import Server from '@/lib/objects/Server';
import { findServerForUser } from '@/lib/server/access';
import { syncServerNetwork } from '@/lib/server/network/service';
import { IUser } from '@/lib/objects/User';
import verificationService from '@/lib/server/verify';
import portainer from '@/lib/server/portainer';
import { createMinecraftServerFromRecord } from '@/lib/server/minecraft';
import { getContainerName } from '@/lib/server/containerNames';
import {
    getRequiredJavaVersion,
    getServerType,
    sanitizeOverrides,
    splitOptionValues,
    type OptionValues,
} from '@/lib/data/itzg';

import {
    dropLocked, lockedEnvFor, lockedPropertiesFor, redactSecrets, SECRET_ENV, SECRET_PROPERTIES,
} from '@/lib/server/accessPolicy';

async function findOwnedServer(request: NextRequest, identifier: string | null) {
    const user: IUser | null = await verificationService.getUserFromToken(request);
    if (!user || !user.isActive) {
        return { error: NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 }) };
    }
    if (!identifier) {
        return { error: NextResponse.json({ message: 'A server identifier is required.' }, { status: 400 }) };
    }

    const server = await findServerForUser(user, identifier);
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
        const { user, server } = found;

        const config = (server.serverConfig ?? {}) as Record<string, unknown>;
        const type = getServerType(config.serverType as string)?.id ?? 'vanilla';
        const version = typeof config.version === 'string' ? config.version : 'LATEST';

        // The dedicated fields (maxPlayers, difficulty, ...) are returned as they are, the panel maps them to options
        const { itzgEnv, serverProperties } = config;
        const lockedEnv = lockedEnvFor(user);
        const lockedProperties = lockedPropertiesFor(user);

        // Users see which options belong to the host, but never a password or a key
        const form = { ...config };
        if (!user.isAdmin) {
            delete form.rconPassword;
            delete form.fileAccess;
        }

        return NextResponse.json({
            uniqueId: server.uniqueId,
            serverType: type,
            version,
            javaVersion: getRequiredJavaVersion(version),
            form,
            itzgEnv: user.isAdmin ? ((itzgEnv as OptionValues) ?? {}) : redactSecrets((itzgEnv as OptionValues) ?? {}, SECRET_ENV),
            serverProperties: user.isAdmin ? ((serverProperties as Record<string, string>) ?? {}) : redactSecrets((serverProperties as Record<string, string>) ?? {}, SECRET_PROPERTIES),
            ...(lockedEnv.length > 0 ? { lockedEnv, lockedProperties } : {}),
            memory: { mb: Number(config.serverMemory) || null, mode: config.memoryMode ?? 'auto' },
            isAdmin: Boolean(user.isAdmin),
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

        // Ports, memory, RCON, the network and the container belong to the host. Only administrators change them; for
        // everyone else they are dropped here, whatever the client sent
        const previousEnv = ((config.itzgEnv ?? {}) as Record<string, unknown>);
        const previousProperties = ((config.serverProperties ?? {}) as Record<string, string>);
        if (!user.isAdmin) {
            if (body.values && typeof body.values === 'object') {
                const result = dropLocked(body.values as Record<string, unknown>, lockedEnvFor(user));
                body.values = result.values;
                for (const key of result.dropped) rejected[key] = 'Managed by the administrators';
            }
            if (body.serverProperties && typeof body.serverProperties === 'object') {
                const result = dropLocked(body.serverProperties as Record<string, unknown>, lockedPropertiesFor(user));
                body.serverProperties = result.values;
                for (const key of result.dropped) rejected[key] = 'Managed by the administrators';
            }
        }

        if (body.values !== undefined) {
            const sanitized = sanitizeOverrides(body.values, type, version);
            rejected = { ...rejected, ...sanitized.rejected };
            const { form, overrides } = splitOptionValues(sanitized.values);
            Object.assign(config, form);
            config.itzgEnv = overrides;
            if (!user.isAdmin) {
                for (const key of lockedEnvFor(user)) {
                    if (key in previousEnv) (config.itzgEnv as Record<string, unknown>)[key] = previousEnv[key];
                }
            } else if ('MEMORY' in (body.values as Record<string, unknown>)) {
                config.memoryMode = 'manual';
            }
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
            if (!user.isAdmin) {
                for (const key of lockedPropertiesFor(user)) {
                    if (key in previousProperties) properties[key] = previousProperties[key];
                }
            }
            config.serverProperties = properties;
        }

        server.serverConfig = config as unknown as typeof server.serverConfig;
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

                if (server.imported) {
                    // The container of an imported server is defined elsewhere, so it is not rebuilt here: a restart
                    // makes the server read the changed server.properties.
                    const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId);
                    if (!container) throw new Error('The container of this server was not found.');
                    await portainer.restartContainer(container.Id, environmentId);
                    applied = true;
                } else {
                    const instance = createMinecraftServerFromRecord(server, environmentId, user.email);

                    const stack = await portainer.getStackByName(`minecraft-${server.uniqueId}`);
                    if (!stack) throw new Error('The container stack of this server was not found. Redeploy the server first.');

                    await portainer.updateStack(stack.Id, instance.generateDockerComposeYaml(), environmentId, false);
                    applied = true;
                    await Server.updateOne({ _id: server._id }, { $unset: { startGuard: '' } });
                }

                // Keep the proxy settings of the server in place after the change
                if (!server.imported || (server.network?.links?.length ?? 0) > 0) {
                    await syncServerNetwork(server, { environmentId }).catch(error => console.warn('Network sync after settings failed:', error));
                }
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
