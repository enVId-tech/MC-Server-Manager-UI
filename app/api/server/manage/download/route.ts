import { NextRequest, NextResponse } from 'next/server';
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';
import serverStorage from '@/lib/server/storage';

/** POST /api/server/manage/download { uniqueId } tells the browser where the cleaned zip of the server is */
export async function POST(request: NextRequest) {
    try {
        const { uniqueId } = await request.json();
        const access = await authorizeFile(request, uniqueId, 'read');
        if (isDenied(access)) return access.response;

        if (!(await serverStorage.exists(access.base))) {
            return NextResponse.json({ message: 'The server folder was not found.' }, { status: 404 });
        }

        return NextResponse.json({
            message: 'The backup is ready.',
            downloadUrl: `/api/server/export/${access.server.uniqueId}`,
            downloadInfo: { downloadUrl: `/api/server/export/${access.server.uniqueId}` },
            note: 'Stop the server first for a consistent copy. Proxy settings and keys are left out.',
        });
    } catch (error) {
        console.error('Error preparing server download:', error);
        return NextResponse.json({ message: 'Failed to prepare the download.' }, { status: 500 });
    }
}
