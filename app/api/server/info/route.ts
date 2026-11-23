import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import Server from '@/lib/objects/Server';
import { findServerForUser } from '@/lib/server/access';
import { publicSubdomain } from '@/lib/server/subdomain';

/** GET /api/server/info?server=...  what the dashboard needs to know about a server before it shows anything */
export async function GET(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 });

    const identifier = new URL(request.url).searchParams.get('server') ?? '';
    const server = identifier ? await findServerForUser(user, identifier) : null;
    if (!server) return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });

    const config = (server.serverConfig ?? {}) as unknown as Record<string, unknown>;
    const isProxy = server.kind === 'proxy';
    return NextResponse.json({
        uniqueId: server.uniqueId,
        name: server.serverName,
        subdomain: publicSubdomain(server.subdomainName),
        owner: server.email,
        isOwner: server.email === user.email,
        isAdmin: Boolean(user.isAdmin),
        kind: isProxy ? 'proxy' : 'server',
        serverType: isProxy ? server.proxy?.type : config.serverType,
        version: isProxy ? undefined : config.version,
        port: server.port,
        imported: Boolean(server.imported),
        startGuard: server.startGuard ? {
            stoppedAt: server.startGuard.stoppedAt,
            failures: server.startGuard.failures,
            // The last log lines can mention the host, so only administrators get them
            ...(user.isAdmin ? { exitCode: server.startGuard.exitCode, lastLog: server.startGuard.lastLog } : {}),
        } : undefined,
        proxy: isProxy ? {
            type: server.proxy?.type,
            forwarding: server.proxy?.forwarding,
            enabled: server.proxy?.enabled !== false,
        } : undefined,
    });
}

/** PATCH /api/server/info   { uniqueId, name }   renames the display name without touching its folder or container */
export async function PATCH(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user || !user.isActive) return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });

    const body = await BodyParser.parseAuto(request);
    const identifier = String(body.uniqueId ?? body.server ?? '').trim();
    const server = identifier ? await findServerForUser(user, identifier) : null;
    if (!server) return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });

    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    if (!rawName) return NextResponse.json({ message: 'Server name cannot be empty.' }, { status: 400 });
    if (rawName.length > 50) return NextResponse.json({ message: 'Server name cannot exceed 50 characters.' }, { status: 400 });
    if (/[\r\n\0]/.test(rawName)) return NextResponse.json({ message: 'Server name contains invalid characters.' }, { status: 400 });

    const update: Record<string, unknown> = { serverName: rawName };
    if (server.kind !== 'proxy' && server.serverConfig) {
        update['serverConfig.name'] = rawName;
    }

    await Server.updateOne({ _id: server._id }, { $set: update });
    return NextResponse.json({ success: true, name: rawName });
}
