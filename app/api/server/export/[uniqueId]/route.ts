import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';
import { createBackupStream } from '@/lib/server/backup';
import { collectSecrets } from '@/lib/server/backups/service';

/**
 * GET /api/server/export/<id>        a zip of the server folder with everything about the proxy network removed
 * GET /api/server/export/<id>?raw=1  the same without cleaning, administrators only
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ uniqueId: string }> }) {
    try {
        const { uniqueId } = await params;
        const access = await authorizeFile(request, uniqueId, 'read');
        if (isDenied(access)) return access.response;

        const raw = new URL(request.url).searchParams.get('raw') === '1';
        if (raw && !access.user.isAdmin) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });

        const name = access.server.serverName.replace(/[^\w.-]+/g, '_');
        return new NextResponse(Readable.toWeb(createBackupStream(access.base, { raw, secrets: raw ? [] : await collectSecrets(access.server) })) as unknown as ReadableStream, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${name}-backup.zip"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ message: 'Failed to export the server.' }, { status: 500 });
    }
}
