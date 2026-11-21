import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import Server from '@/lib/objects/Server';
import verificationService from '@/lib/server/verify';
import { findServerForUser } from '@/lib/server/access';
import { getFileAccess } from '@/lib/server/accessPolicy';

/**
 * PATCH /api/server/files/access   { server, uploads?, editing? }
 * Switches whether the owner may upload and edit files. Both start switched off.
 */
export async function PATCH(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user || !user.isActive) return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const server = typeof body.server === 'string' ? await findServerForUser(user, body.server) : null;
    if (!server || server.kind === 'proxy') return NextResponse.json({ message: 'Server not found.' }, { status: 404 });

    const current = getFileAccess(server);
    const next = {
        uploads: typeof body.uploads === 'boolean' ? body.uploads : current.uploads,
        editing: typeof body.editing === 'boolean' ? body.editing : current.editing,
    };
    await Server.updateOne({ _id: server._id }, { $set: { 'serverConfig.fileAccess': next } });
    return NextResponse.json({ success: true, access: next });
}
