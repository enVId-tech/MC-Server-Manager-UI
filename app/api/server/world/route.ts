import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import portainer from '@/lib/server/portainer';
import { getContainerName } from '@/lib/server/containerNames';
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';
import { extractWorldZip, installWorld, MAX_WORLD_MB } from '@/lib/server/world/install';
import { DOWNGRADE_WARNING, judgeWorld } from '@/lib/server/world/analyze';

/**
 * POST /api/server/world   multipart: server, file (a .zip), acknowledgeDowngrade
 * Replaces the world of a stopped server. The old world is moved to backups/. Needs the uploads toggle of the
 * server (administrators always may), a version the server can load, and for a downgrade the acknowledgement.
 */
export async function POST(request: NextRequest) {
    let temp: string | null = null;
    try {
        const form = await request.formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') return NextResponse.json({ message: 'No world was sent.' }, { status: 400 });
        if (!/\.zip$/i.test(file.name)) return NextResponse.json({ message: 'Zip the world folder and upload the .zip file.' }, { status: 400 });
        if (file.size > MAX_WORLD_MB * 1024 * 1024) return NextResponse.json({ message: `The world is larger than ${MAX_WORLD_MB} MB.` }, { status: 413 });

        const access = await authorizeFile(request, String(form.get('server') ?? ''), 'upload', '/world');
        if (isDenied(access)) return access.response;

        // A running server keeps its world open
        try {
            const container = await portainer.getContainerByIdentifier(getContainerName(access.server));
            if (container && container.State === 'running') {
                return NextResponse.json({ message: 'Stop the server before replacing its world.' }, { status: 409 });
            }
        } catch {
            // Docker not reachable: the replacement itself only touches files
        }

        temp = path.join(os.tmpdir(), `mms-world-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
        await fs.writeFile(temp, Buffer.from(await file.arrayBuffer()));

        const extracted = await extractWorldZip(temp);
        try {
            if (form.get('checkOnly') === 'true') {
                // Only look: say whether the world fits, without touching the server
                const config = (access.server.serverConfig ?? {}) as { version?: string };
                const { info } = extracted;
                const judgement = judgeWorld(info, String(config.version ?? 'LATEST'));
                return NextResponse.json({
                    success: true, checked: true, judgement, found: info.found, levelName: info.levelName, versionName: info.versionName,
                    downgradeWarning: judgement.status === 'downgrade' ? DOWNGRADE_WARNING : undefined,
                });
            }
            const config = (access.server.serverConfig ?? {}) as { serverType?: string; version?: string };
            const result = await installWorld(extracted, {
                serverFolder: access.base,
                serverType: String(config.serverType ?? ''),
                serverVersion: String(config.version ?? 'LATEST'),
                acknowledgeDowngrade: form.get('acknowledgeDowngrade') === 'true',
            });
            if (!result.installed) {
                return NextResponse.json({ success: false, message: result.error, judgement: result.judgement }, { status: result.judgement?.status === 'blocked' ? 422 : 409 });
            }
            return NextResponse.json({
                success: true,
                message: `World imported (${result.files} files).${result.previous ? ' The previous world was moved to backups.' : ''}`,
                judgement: result.judgement,
                previous: result.previous ? result.previous.slice(access.base.length) : undefined,
            });
        } finally {
            await extracted.cleanup();
        }
    } catch (error) {
        console.error('World import failed:', error);
        return NextResponse.json({ message: error instanceof Error ? error.message : 'The world could not be imported.' }, { status: 500 });
    } finally {
        if (temp) await fs.rm(temp, { force: true }).catch(() => undefined);
    }
}
