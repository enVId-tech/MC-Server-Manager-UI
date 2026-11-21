import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { getPlatformSettings, savePlatformSettings, computeMemoryMb } from '@/lib/server/memory';
import { getBackupDefaults, setBackupDefaults } from '@/lib/server/backups/settings';
import { getBlockServerSwitching, setBlockServerSwitching } from '@/lib/server/consoleCommands';
import { getFolderNaming, isFolderNaming, setFolderNaming } from '@/lib/server/folderNaming';

async function backupFields() {
    const defaults = await getBackupDefaults();
    return { backupEnabled: defaults.enabled, backupIntervalHours: defaults.intervalHours, backupKeep: defaults.keep };
}

/** GET /api/admin/platform  limits and memory rules. PUT changes them */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const settings = await getPlatformSettings();
    return NextResponse.json({ success: true, settings: { ...settings, folderNaming: await getFolderNaming(), blockServerSwitching: await getBlockServerSwitching(), ...(await backupFields()) }, example: computeMemoryMb({ serverType: 'paper', plugins: 10, players: 20 }, settings) });
}

export async function PUT(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    const settings = await savePlatformSettings(body ?? {});
    if (isFolderNaming(body?.folderNaming)) await setFolderNaming(body.folderNaming);
    await setBackupDefaults({ enabled: body?.backupEnabled, intervalHours: body?.backupIntervalHours, keep: body?.backupKeep });
    if (body?.blockServerSwitching !== undefined) await setBlockServerSwitching(body.blockServerSwitching === true || body.blockServerSwitching === 'true');
    return NextResponse.json({ success: true, settings: { ...settings, folderNaming: await getFolderNaming(), blockServerSwitching: await getBlockServerSwitching(), ...(await backupFields()) } });
}
