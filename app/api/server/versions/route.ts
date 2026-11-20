import { NextRequest, NextResponse } from 'next/server';
import { getServerType } from '@/lib/data/itzg';
import { getVersionsForType } from '@/lib/server/versionProviders';

/**
 * Minecraft versions a server type can run, fetched from the platform's own version API.
 * GET /api/server/versions?type=paper
 */
export async function GET(request: NextRequest) {
    const type = request.nextUrl.searchParams.get('type') ?? 'vanilla';

    if (!getServerType(type)) {
        return NextResponse.json({ error: `Unknown server type "${type}".` }, { status: 400 });
    }

    try {
        const list = await getVersionsForType(type);
        return NextResponse.json(list, { status: 200 });
    } catch (error) {
        console.error('Error loading server versions:', error);
        return NextResponse.json({ error: 'Failed to load server versions.' }, { status: 500 });
    }
}
