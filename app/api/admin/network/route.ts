import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import Server, { type NetworkWarning } from '@/lib/objects/Server';
import { adoptExistingProxies } from '@/lib/server/network/proxyManagement';
import { getNetworkSettings, listProxies, saveNetworkSettings, syncAllServers, toPublicProxy } from '@/lib/server/network/service';
import { forwardingModesFor } from '@/lib/server/network/versions';

async function requireAdmin(request: NextRequest) {
    const user = await verificationService.getUserFromToken(request);
    return user?.isAdmin ? user : null;
}

/**
 * GET /api/admin/network
 * Every proxy with what its files say, how many servers are behind it, the balancing settings and the servers
 * that are not part of the network. Proxies that exist already are added to the dashboard on the way.
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const user = await requireAdmin(request);
        if (!user) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });

        const adopted = await adoptExistingProxies(user.email);
        const [proxies, settings, servers] = await Promise.all([
            listProxies(),
            getNetworkSettings(),
            Server.find({ kind: { $ne: 'proxy' } }, 'uniqueId serverName email network serverConfig.version serverConfig.serverType').lean(),
        ]);

        const unlinked = servers
            .filter(server => ((server.network?.links ?? []) as unknown[]).length === 0)
            .map(server => ({
                uniqueId: server.uniqueId,
                serverName: server.serverName,
                email: server.email,
                version: server.serverConfig?.version ?? 'unknown',
                warnings: ((server.network?.warnings ?? []) as NetworkWarning[]).map(warning => warning.code),
            }));

        return NextResponse.json({
            success: true,
            adopted,
            settings,
            proxies: proxies.map(proxy => ({ ...toPublicProxy(proxy), allowedForwarding: forwardingModesFor(proxy.kind) })),
            servers: servers.length,
            unlinked,
        });
    } catch (error) {
        console.error('[Admin Network] GET error:', error);
        return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

/**
 * PUT /api/admin/network   { strategy?, noFallback?, mirrorViaPlugins? }
 * Changes how servers are spread over proxies, then applies it to every server.
 */
export async function PUT(request: NextRequest) {
    await dbConnect();
    try {
        if (!(await requireAdmin(request))) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        const body = await BodyParser.parseAuto(request);

        const update: Record<string, unknown> = {};
        if (body.strategy !== undefined) {
            if (!['all', 'balanced', 'priority'].includes(body.strategy)) return NextResponse.json({ message: 'Unknown balancing strategy.' }, { status: 400 });
            update.strategy = body.strategy;
        }
        if (body.noFallback !== undefined) update.noFallback = Boolean(body.noFallback);
        if (body.mirrorViaPlugins !== undefined) update.mirrorViaPlugins = Boolean(body.mirrorViaPlugins);
        await saveNetworkSettings(update);

        const sync = await syncAllServers();
        return NextResponse.json({ success: true, settings: await getNetworkSettings(), details: sync.details });
    } catch (error) {
        console.error('[Admin Network] PUT error:', error);
        return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

/** POST /api/admin/network   { action: 'sync' }  checks every server against the proxies again (rebalances) */
export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        if (!(await requireAdmin(request))) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        const body = await BodyParser.parseAuto(request);
        if (body.action !== 'sync') return NextResponse.json({ message: 'Unknown action.' }, { status: 400 });
        const sync = await syncAllServers();
        return NextResponse.json({ success: true, servers: sync.servers, details: sync.details });
    } catch (error) {
        console.error('[Admin Network] POST error:', error);
        return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
