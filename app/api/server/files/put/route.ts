import { NextRequest, NextResponse } from 'next/server';
import serverStorage from '@/lib/server/storage';
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';

const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 1024) * 1024 * 1024;

/**
 * POST /api/server/files/put   multipart: server, path (folder), file (one or more)
 * Puts files the user dragged in into a folder of the server. Needs the uploads toggle of the server (administrators
 * always may).
 */
export async function POST(request: NextRequest) {
    try {
        const form = await request.formData();
        const folder = String(form.get('path') ?? '/');
        const files = form.getAll('file').filter((entry): entry is File => typeof entry !== 'string');
        if (files.length === 0) return NextResponse.json({ message: 'No file was sent.' }, { status: 400 });

        const access = await authorizeFile(request, String(form.get('server') ?? ''), 'upload', folder);
        if (isDenied(access)) return access.response;

        const saved: string[] = [];
        const skipped: Array<{ name: string; reason: string }> = [];
        for (const file of files) {
            const name = file.name.replace(/\\/g, '/').split('/').pop() ?? '';
            if (!name || name === '.' || name === '..' || name.includes('\0')) { skipped.push({ name: file.name, reason: 'Invalid name' }); continue; }
            if (file.size > MAX_UPLOAD_BYTES) { skipped.push({ name, reason: `Larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB` }); continue; }

            const target = `${access.rel === '/' ? '' : access.rel}/${name}`;
            const targetAccess = await authorizeFile(request, String(form.get('server') ?? ''), 'upload', target);
            if (isDenied(targetAccess)) { skipped.push({ name, reason: 'Not allowed' }); continue; }

            await serverStorage.uploadFile(targetAccess.full, Buffer.from(await file.arrayBuffer()), true);
            saved.push(target);
        }

        return NextResponse.json({ success: skipped.length === 0, saved, skipped }, { status: saved.length > 0 || skipped.length === 0 ? 200 : 400 });
    } catch (error) {
        console.error('File upload error:', error);
        return NextResponse.json({ message: 'The upload failed.' }, { status: 500 });
    }
}
