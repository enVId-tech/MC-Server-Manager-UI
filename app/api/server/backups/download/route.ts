import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import dbConnect from '@/lib/db/dbConnect';
import Backup from '@/lib/objects/Backup';
import { findServerForUser } from '@/lib/server/access';
import { readBackup } from '@/lib/server/backups/service';
import verificationService from '@/lib/server/verify';

/** GET /api/server/backups/download?uniqueId=<id>&id=<backup>  the zip of one backup, for the server's owner and administrators */
export async function GET(request: NextRequest) {
    try {
        await dbConnect();
        const user = await verificationService.getUserFromToken(request);
        if (!user || !user.isActive) return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });

        const url = new URL(request.url);
        const identifier = url.searchParams.get('uniqueId');
        const id = url.searchParams.get('id') ?? '';
        const server = identifier ? await findServerForUser(user, identifier) : null;
        const backup = server && /^[a-f0-9]{24}$/i.test(id) ? await Backup.findOne({ _id: id, serverId: server.uniqueId }) : null;
        if (!server || !backup) return NextResponse.json({ message: 'Backup not found.' }, { status: 404 });

        const stream = await readBackup(backup).catch(() => null);
        if (!stream) return NextResponse.json({ message: 'The backup file is no longer there.' }, { status: 404 });
        return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${backup.fileName.replace(/[^\w.-]+/g, '_')}"`,
                'Content-Length': String(backup.sizeBytes),
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Backup download error:', error);
        return NextResponse.json({ message: 'Failed to download the backup.' }, { status: 500 });
    }
}
