import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import Backup from '@/lib/objects/Backup';
import Server from '@/lib/objects/Server';
import { findServerForUser } from '@/lib/server/access';
import verificationService from '@/lib/server/verify';
import { cleanPolicy, effectivePolicy, getBackupDefaults } from '@/lib/server/backups/settings';
import { createServerBackup, deleteBackup, isBackupRunning, pruneBackups } from '@/lib/server/backups/service';
import type { IUser } from '@/lib/objects/User';

async function resolve(request: NextRequest, identifier: string | null | undefined) {
    await dbConnect();
    const user: IUser | null = await verificationService.getUserFromToken(request);
    if (!user || !user.isActive) return { response: NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 }) };
    if (!identifier) return { response: NextResponse.json({ message: 'A server identifier is required.' }, { status: 400 }) };
    const server = await findServerForUser(user, identifier);
    if (!server) return { response: NextResponse.json({ message: 'Server not found.' }, { status: 404 }) };
    return { user, server };
}

function adminOnly(user: IUser) {
    return user.isAdmin ? null : NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
}

/**
 * GET /api/server/backups?uniqueId=<id>  the backups of a server and the rule they follow. Owners and administrators
 * may list and download them; only administrators change the rule, make backups by hand and delete them.
 */
export async function GET(request: NextRequest) {
    try {
        const found = await resolve(request, new URL(request.url).searchParams.get('uniqueId'));
        if ('response' in found) return found.response;
        const { user, server } = found;

        const [defaults, backups] = await Promise.all([getBackupDefaults(), Backup.find({ serverId: server.uniqueId }).sort({ createdAt: -1 })]);
        const policy = effectivePolicy(server, defaults);
        const last = server.lastBackupAt ? new Date(server.lastBackupAt).getTime() : null;
        return NextResponse.json({
            success: true,
            isAdmin: user.isAdmin,
            running: isBackupRunning(server.uniqueId),
            policy,
            nextBackupAt: policy.enabled ? new Date((last ?? Date.now()) + policy.intervalHours * 3_600_000).toISOString() : null,
            lastBackupAt: server.lastBackupAt ?? null,
            // Why a backup failed can mention paths and hosts, so only administrators read it
            lastBackupError: user.isAdmin ? server.lastBackupError ?? null : null,
            ...(user.isAdmin ? { rawPolicy: server.backupPolicy ?? { mode: 'default' }, defaults } : {}),
            backups: backups.map(item => ({ id: String(item._id), kind: item.kind, fileName: item.fileName, sizeBytes: item.sizeBytes, createdAt: item.createdAt })),
        });
    } catch (error) {
        console.error('Backups list error:', error);
        return NextResponse.json({ message: 'Failed to read the backups.' }, { status: 500 });
    }
}

/**
 * POST /api/server/backups  administrators only
 *   { uniqueId, action: 'create' }                                   make a backup now
 *   { uniqueId, action: 'policy', mode, intervalHours?, keep? }      mode is default, custom or off
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const found = await resolve(request, body?.uniqueId);
        if ('response' in found) return found.response;
        const { user, server } = found;
        const denied = adminOnly(user);
        if (denied) return denied;

        if (body.action === 'policy') {
            const policy = cleanPolicy(body);
            if (!policy) return NextResponse.json({ message: 'The mode must be default, custom or off.' }, { status: 400 });
            await Server.updateOne({ _id: server._id }, { $set: { backupPolicy: policy } });
            const defaults = await getBackupDefaults();
            const applied = effectivePolicy({ backupPolicy: policy }, defaults);
            if (applied.enabled) await pruneBackups(server.uniqueId, applied.keep);
            return NextResponse.json({ success: true, policy: applied, rawPolicy: policy });
        }

        if (body.action === 'create') {
            const backup = await createServerBackup(server, 'manual');
            return NextResponse.json({ success: true, backup: { id: String(backup._id), kind: backup.kind, fileName: backup.fileName, sizeBytes: backup.sizeBytes, createdAt: backup.createdAt } });
        }

        return NextResponse.json({ message: 'Unknown action.' }, { status: 400 });
    } catch (error) {
        console.error('Backups action error:', error);
        return NextResponse.json({ message: error instanceof Error ? error.message : 'The backup failed.' }, { status: 500 });
    }
}

/** DELETE /api/server/backups?uniqueId=<id>&id=<backup>  administrators only */
export async function DELETE(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const found = await resolve(request, url.searchParams.get('uniqueId'));
        if ('response' in found) return found.response;
        const denied = adminOnly(found.user);
        if (denied) return denied;

        const id = url.searchParams.get('id') ?? '';
        const backup = /^[a-f0-9]{24}$/i.test(id) ? await Backup.findOne({ _id: id, serverId: found.server.uniqueId }) : null;
        if (!backup) return NextResponse.json({ message: 'Backup not found.' }, { status: 404 });
        await deleteBackup(backup);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Backup delete error:', error);
        return NextResponse.json({ message: 'Failed to delete the backup.' }, { status: 500 });
    }
}
