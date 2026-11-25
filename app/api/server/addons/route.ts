import { NextRequest, NextResponse } from 'next/server';
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';
import { canUseFiles, isHiddenFromUsers } from '@/lib/server/accessPolicy';
import {
    addonsOf, AddonError, applyStagedAddons, capabilitiesOf, checkAddonUpdates, installFromLink, installUpload, removeAddon, setAutoUpdate, syncDiscoveredServerAddons, updateAddons,
} from '@/lib/server/addons/manager';
import { identifyLink } from '@/lib/server/addons/sources';
import type { IServer } from '@/lib/objects/Server';
import type { IUser } from '@/lib/objects/User';

const MAX_BULK = 50;
const MAX_JAR_MB = 200;

/** What a user may see of an add-on record: never hidden secret jars, managed-file bookkeeping or who added it */
function publicView(server: IServer, user: Pick<IUser, 'isAdmin'>) {
    return addonsOf(server)
        .filter(record => user.isAdmin || !isHiddenFromUsers(record.file))
        .map(record => ({
            id: record.id,
            kind: record.kind,
            source: record.source,
            url: record.url,
            name: record.name,
            icon: record.icon,
            file: record.file,
            version: record.version,
            auto: record.auto,
            installedByServer: Boolean(record.installedByServer),
            compatibilityWarning: record.compatibilityWarning,
            availableUpdate: record.availableUpdate
                ? { version: record.availableUpdate.version, checkedAt: record.availableUpdate.checkedAt }
                : undefined,
            updatable: record.source !== 'upload' && record.source !== 'other',
            updatePending: Boolean(record.staged),
            checkedAt: record.checkedAt,
        }));
}

function fail(error: unknown) {
    if (error instanceof AddonError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error('Add-on request failed:', error);
    return NextResponse.json({ message: 'The request failed.' }, { status: 500 });
}

/** GET ?server=<id>  The installed plugins and mods, and what this server can load */
export async function GET(request: NextRequest) {
    const access = await authorizeFile(request, request.nextUrl.searchParams.get('server'), 'read', '/');
    if (isDenied(access)) return access.response;
    await syncDiscoveredServerAddons(access.server).catch(() => undefined);
    const caps = capabilitiesOf(access.server);
    return NextResponse.json({
        success: true, addons: publicView(access.server, access.user), capabilities: caps,
        // Other links and jar uploads follow the uploads toggle of the server
        canUploadFiles: canUseFiles(access.user, access.server, 'upload'),
    });
}

/**
 * POST  JSON {server, link} or {server, links: string[]} (advanced mode), or multipart {server, file}
 * Known sources are open to everyone who owns the server. Other links and jar uploads need the uploads toggle.
 */
export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get('content-type') ?? '';
        if (contentType.includes('multipart/form-data')) {
            const form = await request.formData();
            const access = await authorizeFile(request, String(form.get('server') ?? ''), 'upload', '/');
            if (isDenied(access)) return access.response;
            const files = form.getAll('file').filter((entry): entry is File => typeof entry !== 'string');
            if (files.length === 0) return NextResponse.json({ message: 'No file was sent.' }, { status: 400 });
            const results: Array<{ file: string; ok: boolean; name?: string; message?: string }> = [];
            for (const file of files.slice(0, MAX_BULK)) {
                if (!/\.jar$/i.test(file.name)) { results.push({ file: file.name, ok: false, message: 'Only .jar files can be added.' }); continue; }
                if (file.size > MAX_JAR_MB * 1024 * 1024) { results.push({ file: file.name, ok: false, message: `Larger than ${MAX_JAR_MB} MB.` }); continue; }
                try {
                    const record = await installUpload(access.server, file.name, Buffer.from(await file.arrayBuffer()), access.user.email);
                    results.push({ file: file.name, ok: true, name: record.name });
                } catch (error) {
                    results.push({ file: file.name, ok: false, message: error instanceof Error ? error.message : 'Failed.' });
                }
            }
            return NextResponse.json({ success: results.some(r => r.ok), results, addons: publicView(access.server, access.user) });
        }

        const body = await request.json().catch(() => ({})) as { server?: string; link?: string; links?: string[]; auto?: boolean; kind?: 'plugin' | 'mod' };
        const access = await authorizeFile(request, body.server, 'read', '/');
        if (isDenied(access)) return access.response;
        const allowOther = canUseFiles(access.user, access.server, 'upload');
        const links = (Array.isArray(body.links) ? body.links : body.link ? [body.link] : []).map(entry => String(entry).trim()).filter(Boolean);
        if (links.length === 0) return NextResponse.json({ message: 'No link was given.' }, { status: 400 });
        if (links.length > 1 && !access.user.isAdmin && !allowOther && links.some(l => identifyLink(l)?.source === 'other')) {
            // Mixed lists still work: the "other" ones are reported as refused below
        }
        const results: Array<{ link: string; ok: boolean; name?: string; message?: string; warning?: string }> = [];
        for (const link of links.slice(0, MAX_BULK)) {
            try {
                const record = await installFromLink(access.server, link, { auto: body.auto, kind: body.kind, addedBy: access.user.email, allowOther });
                results.push({ link, ok: true, name: record.name, ...(record.compatibilityWarning ? { warning: record.compatibilityWarning } : {}) });
            } catch (error) {
                results.push({ link, ok: false, message: error instanceof Error ? error.message : 'Failed.' });
            }
        }
        const anyOk = results.some(r => r.ok);
        return NextResponse.json({ success: anyOk, results, addons: publicView(access.server, access.user) }, { status: anyOk ? 200 : (links.length === 1 ? 422 : 207) });
    } catch (error) {
        return fail(error);
    }
}

/** DELETE ?server=<id>&id=<addon id> */
export async function DELETE(request: NextRequest) {
    try {
        const access = await authorizeFile(request, request.nextUrl.searchParams.get('server'), 'read', '/');
        if (isDenied(access)) return access.response;
        const id = request.nextUrl.searchParams.get('id');
        if (!id) return NextResponse.json({ message: 'An id is required.' }, { status: 400 });
        const record = addonsOf(access.server).find(entry => entry.id === id);
        // Add-ons the manager installed for the network (proxy support mods) cannot be removed by users
        const managed = (access.server.managedFiles ?? []).some(entry => entry.path.replace(/^\/+/, '').toLowerCase() === record?.file.toLowerCase());
        if (managed && !access.user.isAdmin) return NextResponse.json({ message: 'This is managed by the server and cannot be removed.' }, { status: 403 });
        await removeAddon(access.server, id);
        return NextResponse.json({ success: true, addons: publicView(access.server, access.user) });
    } catch (error) {
        return fail(error);
    }
}

/** PATCH {server, id, auto} toggles automatic updates. {server, checkUpdates: true, id?} checks for available updates. {server, update: true, id?} updates/stages. {server, apply: true} applies staged mods */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({})) as { server?: string; id?: string; auto?: boolean; checkUpdates?: boolean; update?: boolean; apply?: boolean };
        const access = await authorizeFile(request, body.server, 'read', '/');
        if (isDenied(access)) return access.response;
        if (body.apply) {
            return NextResponse.json({ success: true, applied: await applyStagedAddons(access.server), addons: publicView(access.server, access.user) });
        }
        if (body.checkUpdates) {
            const checkOutcomes = await checkAddonUpdates(access.server, { id: body.id });
            return NextResponse.json({ success: true, checkOutcomes, addons: publicView(access.server, access.user) });
        }
        if (body.update) {
            const outcomes = await updateAddons(access.server, { id: body.id });
            return NextResponse.json({ success: true, outcomes, addons: publicView(access.server, access.user) });
        }
        if (!body.id || typeof body.auto !== 'boolean') return NextResponse.json({ message: 'An id and auto are required.' }, { status: 400 });
        await setAutoUpdate(access.server, body.id, body.auto);
        return NextResponse.json({ success: true, addons: publicView(access.server, access.user) });
    } catch (error) {
        return fail(error);
    }
}
