import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import { userUploadPath } from '@/lib/server/uploadsDir';
import { extractWorldZip } from '@/lib/server/world/install';
import { judgeWorld, ERA_LABEL, DOWNGRADE_WARNING } from '@/lib/server/world/analyze';

/**
 * POST /api/server/world/check   { fileName, version }
 * Looks at a world zip the user uploaded earlier (files/upload) and says whether a server of `version` can load it:
 * ok, upgrade, downgrade (needs an acknowledgement, unsupported) or blocked (across 1.17 or 26.1).
 */
export async function POST(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user || !user.isActive) return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const zipPath = userUploadPath(user.email, typeof body.fileName === 'string' ? body.fileName : null);
    if (!zipPath) return NextResponse.json({ message: 'Upload the world first.' }, { status: 400 });

    try {
        const extracted = await extractWorldZip(zipPath);
        try {
            const { info } = extracted;
            const judgement = judgeWorld(info, String(body.version ?? 'LATEST'));
            return NextResponse.json({
                found: info.found,
                levelName: info.levelName,
                versionName: info.versionName,
                era: info.era,
                eraLabel: info.era ? ERA_LABEL[info.era] : undefined,
                nether: info.hasNether,
                end: info.hasEnd,
                problems: info.problems,
                judgement,
                downgradeWarning: judgement.status === 'downgrade' ? DOWNGRADE_WARNING : undefined,
            });
        } finally {
            await extracted.cleanup();
        }
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : 'The world could not be read. Is it a valid zip file?' }, { status: 422 });
    }
}
