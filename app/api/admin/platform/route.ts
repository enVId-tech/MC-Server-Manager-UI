import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { getPlatformSettings, savePlatformSettings, computeMemoryMb } from '@/lib/server/memory';
import { getFolderNaming, isFolderNaming, setFolderNaming } from '@/lib/server/folderNaming';

/** GET /api/admin/platform  limits and memory rules. PUT changes them */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const settings = await getPlatformSettings();
    return NextResponse.json({ success: true, settings: { ...settings, folderNaming: await getFolderNaming() }, example: computeMemoryMb({ serverType: 'paper', plugins: 10, players: 20 }, settings) });
}

export async function PUT(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    const settings = await savePlatformSettings(body ?? {});
    if (isFolderNaming(body?.folderNaming)) await setFolderNaming(body.folderNaming);
    return NextResponse.json({ success: true, settings: { ...settings, folderNaming: await getFolderNaming() } });
}
