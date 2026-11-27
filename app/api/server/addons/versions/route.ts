import { NextRequest, NextResponse } from 'next/server';
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';
import { AddonError, getAddonVersionsForServer } from '@/lib/server/addons/manager';
import type { AddonKind } from '@/lib/server/addons/jar';
import type { AddonSource } from '@/lib/server/addons/sources';

/**
 * GET ?server=<uniqueId>&id=<addonId> OR ?server=<uniqueId>&source=<src>&ref=<ref>&kind=<plugin|mod>
 * Returns available remote versions annotated with server version and loader compatibility.
 */
export async function GET(request: NextRequest) {
    const serverId = request.nextUrl.searchParams.get('server');
    const access = await authorizeFile(request, serverId, 'read', '/');
    if (isDenied(access)) return access.response;

    const id = request.nextUrl.searchParams.get('id') || undefined;
    const source = (request.nextUrl.searchParams.get('source') || undefined) as AddonSource | undefined;
    const ref = request.nextUrl.searchParams.get('ref') || undefined;
    const rawKind = request.nextUrl.searchParams.get('kind');
    const kind: AddonKind | undefined = rawKind === 'plugin' || rawKind === 'mod' ? rawKind : undefined;

    try {
        const result = await getAddonVersionsForServer(access.server, { id, source, ref, kind });
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        if (error instanceof AddonError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        const message = error instanceof Error ? error.message : 'Failed to load versions.';
        return NextResponse.json({ message }, { status: 422 });
    }
}
