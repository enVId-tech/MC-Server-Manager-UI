import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { getPlatformSettings, savePlatformSettings, computeMemoryMb } from '@/lib/server/memory';

/** GET /api/admin/platform  limits and memory rules. PUT changes them */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const settings = await getPlatformSettings();
    return NextResponse.json({ success: true, settings, example: computeMemoryMb({ serverType: 'paper', plugins: 10, players: 20 }, settings) });
}

export async function PUT(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    const settings = await savePlatformSettings(body ?? {});
    return NextResponse.json({ success: true, settings });
}
