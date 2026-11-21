import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import Backup from '@/lib/objects/Backup';
import Server from '@/lib/objects/Server';
import { requireAdmin } from '@/lib/server/auth';
import { effectivePolicy, getBackupDefaults, setBackupDefaults } from '@/lib/server/backups/settings';
import { isBackupRunning } from '@/lib/server/backups/service';

/**
 * GET /api/admin/backups  the default backup rule and, for every server, the rule it follows and its backups
 * PUT /api/admin/backups  { enabled, intervalHours, keep }  changes the default rule
 *
 * The rules of single servers are changed through POST /api/server/backups, which is administrators only too.
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    await dbConnect();

    const [defaults, servers, totals] = await Promise.all([
        getBackupDefaults(),
        Server.find({ kind: { $ne: 'proxy' } }, 'uniqueId serverName email backupPolicy lastBackupAt lastBackupError').sort({ serverName: 1 }).lean(),
        Backup.aggregate<{ _id: string; count: number; bytes: number }>([{ $group: { _id: '$serverId', count: { $sum: 1 }, bytes: { $sum: '$sizeBytes' } } }]),
    ]);
    const byServer = new Map(totals.map(item => [item._id, item]));

    return NextResponse.json({
        success: true,
        defaults,
        servers: servers.map(server => ({
            uniqueId: server.uniqueId,
            serverName: server.serverName,
            owner: server.email,
            policy: effectivePolicy(server, defaults),
            rawPolicy: server.backupPolicy ?? { mode: 'default' },
            lastBackupAt: server.lastBackupAt ?? null,
            lastBackupError: server.lastBackupError ?? null,
            running: isBackupRunning(server.uniqueId),
            count: byServer.get(server.uniqueId)?.count ?? 0,
            bytes: byServer.get(server.uniqueId)?.bytes ?? 0,
        })),
    });
}

export async function PUT(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    await setBackupDefaults({ enabled: body?.enabled, intervalHours: body?.intervalHours, keep: body?.keep });
    return NextResponse.json({ success: true, defaults: await getBackupDefaults() });
}
