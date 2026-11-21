import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import { createProxy, deleteProxy, updateProxy, type CreateProxyInput, type UpdateProxyInput } from '@/lib/server/network/proxyManagement';
import type { ProxyPluginName } from '@/lib/server/network/backend';

const PLUGINS: ProxyPluginName[] = ['viaversion', 'viabackwards', 'viarewind', 'geyser', 'floodgate'];

async function requireAdmin(request: NextRequest) {
    const user = await verificationService.getUserFromToken(request);
    return user?.isAdmin ? user : null;
}

function plugins(value: unknown): ProxyPluginName[] {
    return Array.isArray(value) ? value.filter((name): name is ProxyPluginName => PLUGINS.includes(name)) : [];
}

function fail(error: unknown, status = 400) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }, { status });
}

/** POST /api/admin/network/proxies  creates a Velocity, BungeeCord or Waterfall proxy */
export async function POST(request: NextRequest) {
    await dbConnect();
    const user = await requireAdmin(request);
    if (!user) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
    try {
        const body = await BodyParser.parseAuto(request);
        const input: CreateProxyInput = {
            name: String(body.name ?? ''),
            kind: body.kind,
            forwarding: body.forwarding,
            port: Number(body.port),
            memory: body.memory,
            networkName: body.networkName,
            publicHost: body.publicHost,
            motd: body.motd,
            maxPlayers: body.maxPlayers !== undefined ? Number(body.maxPlayers) : undefined,
            priority: body.priority !== undefined ? Number(body.priority) : undefined,
            image: body.image,
            plugins: plugins(body.plugins),
            bedrockPort: body.bedrockPort !== undefined ? Number(body.bedrockPort) : undefined,
            shareSecret: body.shareSecret,
        };
        const result = await createProxy(input, user.email);
        return NextResponse.json({ success: true, ...result }, { status: 201 });
    } catch (error) {
        console.error('[Admin Network] create proxy failed:', error);
        return fail(error);
    }
}

/** PATCH /api/admin/network/proxies  { id, ...changes } */
export async function PATCH(request: NextRequest) {
    await dbConnect();
    if (!(await requireAdmin(request))) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
    try {
        const body = await BodyParser.parseAuto(request);
        if (!body.id) return NextResponse.json({ success: false, message: 'Proxy id is required.' }, { status: 400 });
        const patch: UpdateProxyInput = {
            name: body.name, enabled: body.enabled, priority: body.priority, forwarding: body.forwarding, motd: body.motd,
            maxPlayers: body.maxPlayers !== undefined ? Number(body.maxPlayers) : undefined, publicHost: body.publicHost,
            defaultEntry: body.defaultEntry, memory: body.memory, image: body.image, installPlugins: plugins(body.installPlugins), pullImage: body.pullImage === true,
        };
        return NextResponse.json({ success: true, ...(await updateProxy(String(body.id), patch)) });
    } catch (error) {
        console.error('[Admin Network] update proxy failed:', error);
        return fail(error);
    }
}

/** DELETE /api/admin/network/proxies?id=... */
export async function DELETE(request: NextRequest) {
    await dbConnect();
    if (!(await requireAdmin(request))) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
    try {
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return NextResponse.json({ success: false, message: 'Proxy id is required.' }, { status: 400 });
        return NextResponse.json({ success: true, ...(await deleteProxy(id)) });
    } catch (error) {
        console.error('[Admin Network] delete proxy failed:', error);
        return fail(error);
    }
}
