import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import Server, { type NetworkWarning } from '@/lib/objects/Server';
import { findServerForUser } from '@/lib/server/access';
import { getJoinAddresses, getProxy, readEducationJoin, syncServerNetwork } from '@/lib/server/network/service';
import { visibleWarnings } from '@/lib/server/network/warnings';

/**
 * GET /api/server/network?uniqueId=...            how the server is connected, how players join, warnings
 * GET /api/server/network?uniqueId=...&edu=1      the Education Edition join codes of the proxy (EduGeyser)
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 });

    const url = new URL(request.url);
    const identifier = url.searchParams.get('uniqueId') ?? '';
    const server = identifier ? await findServerForUser(user, identifier) : null;
    if (!server || server.kind === 'proxy') return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });

    if (url.searchParams.get('edu')) {
        const links = (server.network?.links ?? []) as Array<{ proxyId: string }>;
        for (const link of links) {
            const proxy = await getProxy(link.proxyId);
            if (proxy?.plugins.edugeyser) return NextResponse.json({ success: true, proxyName: proxy.name, ...(await readEducationJoin(proxy, url.searchParams.get('edu') === 'refresh')) });
        }
        return NextResponse.json({ success: true, links: [], lines: [], error: 'No EduGeyser proxy is connected to this server' });
    }

    const links = (server.network?.links ?? []) as Array<{ proxyId: string; proxyName: string; forwarding: string; entryName: string }>;
    return NextResponse.json({
        success: true,
        connected: links.length > 0,
        // Which proxies and how they forward is for administrators
        ...(user.isAdmin ? {
            forwarding: server.network?.forwarding ?? 'none',
            links: links.map(link => ({ proxyName: link.proxyName, forwarding: link.forwarding })),
        } : {}),
        // Players need the addresses; the names of the proxies behind them are for administrators
        joinAddresses: (await getJoinAddresses(server)).map((address, index) => (
            user.isAdmin ? address : { ...address, proxyId: String(index), proxyName: '' }
        )),
        ...(user.isAdmin ? { port: server.port } : {}),
        warnings: visibleWarnings(server.network?.warnings as NetworkWarning[] | undefined).map(warning => ({ code: warning.code, message: warning.message, port: warning.port })),
        // The proxy settings are changed by administrators only
        locked: links.length > 0 && !user.isAdmin,
        syncedAt: server.network?.syncedAt ?? null,
    });
}

/**
 * POST /api/server/network   { uniqueId, action: 'dismiss', code }   clears a warning
 *                            { uniqueId, action: 'sync', restart? }  checks the server against the proxies again
 */
export async function POST(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 });

    const body = await BodyParser.parseAuto(request);
    const server = body.uniqueId ? await findServerForUser(user, String(body.uniqueId)) : null;
    if (!server || server.kind === 'proxy') return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });

    if (body.action === 'dismiss') {
        const warnings = ((server.network?.warnings ?? []) as NetworkWarning[]).map(warning => (
            warning.code === body.code ? { ...warning, dismissed: true } : warning
        ));
        await Server.updateOne({ _id: server._id }, { $set: { 'network.warnings': warnings } });
        return NextResponse.json({ success: true, warnings: visibleWarnings(warnings).map(warning => ({ code: warning.code, message: warning.message, port: warning.port })) });
    }

    if (body.action === 'sync') {
        if (!user.isAdmin) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        const result = await syncServerNetwork(server, { restart: Boolean(body.restart) });
        return NextResponse.json({
            success: true,
            linked: result.linked.length,
            forwarding: result.forwarding,
            restartNeeded: result.restartNeeded,
            details: result.details,
            warnings: visibleWarnings(result.warnings).map(warning => ({ code: warning.code, message: warning.message, port: warning.port })),
        });
    }

    return NextResponse.json({ message: 'Unknown action.' }, { status: 400 });
}
