import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import { findServerForUser } from '@/lib/server/access';

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
        subdomain: server.subdomainName,
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
