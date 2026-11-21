import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import { identifyLink, lookupAddon, SOURCE_LABEL } from '@/lib/server/addons/sources';

/**
 * GET ?link=<url>  Name and logo of a link, for the preview before it is added. Only Modrinth, SpigotMC, Bukkit
 * and CurseForge links are looked up; any other link is accepted as it is, without contacting it.
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user || !user.isActive) return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });
    const link = identifyLink(request.nextUrl.searchParams.get('link') ?? '');
    if (!link) return NextResponse.json({ message: 'That is not a valid link.' }, { status: 400 });
    if (link.source === 'other') {
        return NextResponse.json({ success: true, lookup: { source: 'other', sourceLabel: SOURCE_LABEL.other, url: link.url, name: null, kinds: [], downloadable: true, verified: false } });
    }
    try {
        const lookup = await lookupAddon(link);
        return NextResponse.json({ success: true, lookup: { ...lookup, sourceLabel: SOURCE_LABEL[lookup.source] } });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : 'The link could not be read.' }, { status: 422 });
    }
}
