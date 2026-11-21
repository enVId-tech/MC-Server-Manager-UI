import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import { getNetworkSettings, listProxies } from '@/lib/server/network/service';
import { chooseProxies, versionAllowance } from '@/lib/server/network/versions';

/**
 * GET /api/network?version=1.20.4
 * What the proxy network means for a new server, for the create page: the oldest version that can be chosen,
 * and, for a given version, whether it fits and which kind of proxy it would join. Names of proxies and their
 * secrets are not part of the answer.
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 });

    const version = new URL(request.url).searchParams.get('version');
    const [proxies, settings] = await Promise.all([listProxies(), getNetworkSettings()]);
    const enabled = proxies.filter(proxy => proxy.enabled);
    const allowance = versionAllowance(enabled, version ?? 'LATEST');
    const decision = version ? chooseProxies(enabled, version, settings.strategy) : null;

    const isAdmin = Boolean(user.isAdmin);
    return NextResponse.json({
        isAdmin,
        hasProxy: enabled.length > 0,
        minVersion: allowance.minVersion,
        // Administrators may create servers that no proxy takes, they get the warning
        allowed: allowance.allowed || isAdmin,
        // What is true for regular users, so administrators can see the warning
        wouldBeAllowed: allowance.allowed,
        reason: allowance.reason,
        bedrock: decision ? decision.proxies.some(proxy => proxy.plugins.geyser) : false,
        // How the network is wired is for administrators
        ...(isAdmin ? {
            forwarding: decision?.forwarding ?? null,
            proxyCount: decision?.proxies.length ?? 0,
            viaPlugins: decision ? decision.proxies.some(proxy => proxy.plugins.viaversion || proxy.plugins.viabackwards || proxy.plugins.viarewind) : false,
        } : {}),
    });
}
