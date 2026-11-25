/**
 * Installs, removes, checks for updates, and updates the plugins and mods of a server.
 *
 * What is installed is recorded on the server (`addons`), including both user-linked addons and server-added
 * plugins/mods (such as ViaVersion, ViaBackwards, ViaRewind, Fabric API, etc.), so users can see available
 * updates and update them in one click. Updates of a running server are staged: plugins go into plugins/update
 * (Bukkit swaps them at the next start), mods wait in .mms/staged and are put in place before the server starts.
 */
import crypto from 'node:crypto';
import Server, { type IServer } from '@/lib/objects/Server';
import serverStorage from '@/lib/server/storage';
import portainer from '@/lib/server/portainer';
import { getContainerName } from '@/lib/server/containerNames';
import { getServerFolderPath } from '@/lib/server/serverPaths';
import { getServerType } from '@/lib/data/itzg/serverTypes';
import { computeMemoryMb, getPlatformSettings } from '@/lib/server/memory';
import { isHiddenFromUsers } from '@/lib/server/accessPolicy';
import { detectLoader, loaderForType } from '@/lib/server/network/modded';
import { safeJarName } from '@/lib/server/uploadsDir';
import { downloadFile } from './net';
import { inspectJar, type AddonKind, type JarInfo } from './jar';
import { checkAddonCompatibility } from './compatibility';
import {
    identifyLink,
    loadersFor,
    lookupAddon,
    resolveDownload,
    type AddonLookup,
    type AddonSource,
    type LinkRef,
    type ResolvedDownload,
} from './sources';

export interface AddonRecord {
    id: string;
    kind: AddonKind;
    source: AddonSource | 'upload';
    /** Slug, resource id or URL it was installed from. Empty for uploads */
    ref: string;
    url?: string;
    name: string;
    icon?: string;
    /** Path of the jar inside the server folder, for example plugins/EssentialsX.jar */
    file: string;
    version?: string;
    versionId?: string;
    /** Newer releases are installed automatically */
    auto: boolean;
    addedAt: Date;
    addedBy?: string;
    checkedAt?: Date;
    /** Installed automatically by the platform/proxy network (e.g. ViaVersion, ViaBackwards, ViaRewind) */
    installedByServer?: boolean;
    /** Warning recorded when the user intentionally added an incompatible link (e.g. a mod on a plugin server) */
    compatibilityWarning?: string;
    /** Loaders supported by the remote project when it differs from the server's native loaders */
    sourceLoaders?: string[];
    /** Set when an update check found a newer remote release */
    availableUpdate?: { versionId: string; version?: string; checkedAt: Date };
    /** A newer release that is downloaded and waits for the next start */
    staged?: { versionId: string; version?: string; file: string };
}

interface KnownServerAddonSpec {
    kind: AddonKind;
    source: AddonSource;
    ref: string;
    name: string;
    url: string;
    prefixes: string[];
}

const KNOWN_SERVER_ADDONS: KnownServerAddonSpec[] = [
    { kind: 'plugin', source: 'modrinth', ref: 'viaversion', name: 'ViaVersion', url: 'https://modrinth.com/plugin/viaversion', prefixes: ['viaversion'] },
    { kind: 'plugin', source: 'modrinth', ref: 'viabackwards', name: 'ViaBackwards', url: 'https://modrinth.com/plugin/viabackwards', prefixes: ['viabackwards'] },
    { kind: 'plugin', source: 'modrinth', ref: 'viarewind', name: 'ViaRewind', url: 'https://modrinth.com/plugin/viarewind', prefixes: ['viarewind'] },
    { kind: 'plugin', source: 'spigot', ref: '79601', name: 'BungeeGuard', url: 'https://www.spigotmc.org/resources/bungeeguard.79601/', prefixes: ['bungeeguard'] },
    { kind: 'mod', source: 'modrinth', ref: 'fabric-api', name: 'Fabric API', url: 'https://modrinth.com/mod/fabric-api', prefixes: ['fabric-api'] },
    { kind: 'mod', source: 'modrinth', ref: 'fabricproxy-lite', name: 'FabricProxy-Lite', url: 'https://modrinth.com/mod/fabricproxy-lite', prefixes: ['fabricproxy-lite', 'fabricproxy_lite'] },
    { kind: 'mod', source: 'modrinth', ref: 'crossstitch', name: 'CrossStitch', url: 'https://modrinth.com/mod/crossstitch', prefixes: ['crossstitch'] },
    { kind: 'mod', source: 'modrinth', ref: 'proxy-compatible-forge', name: 'Proxy Compatible Forge', url: 'https://modrinth.com/mod/proxy-compatible-forge', prefixes: ['proxy-compatible-forge', 'proxycompatibleforge', 'pcf-'] },
];

export class AddonError extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
    }
}

const locks = new Map<string, Promise<unknown>>();

/** Runs jobs of one server one after another, so two installs cannot overwrite each other's record */
async function exclusive<T>(uniqueId: string, job: () => Promise<T>): Promise<T> {
    const previous = locks.get(uniqueId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(job);
    locks.set(uniqueId, next);
    try {
        return await next;
    } finally {
        if (locks.get(uniqueId) === next) locks.delete(uniqueId);
    }
}

export interface AddonCapabilities {
    plugins: boolean;
    mods: boolean;
    type: string;
    typeName?: string;
    version: string;
}

export function capabilitiesOf(server: Pick<IServer, 'serverConfig'>): AddonCapabilities {
    const type = String(server.serverConfig?.serverType ?? '');
    const definition = getServerType(type);
    return {
        plugins: definition?.supportsPlugins ?? false,
        mods: definition?.supportsMods ?? false,
        type,
        typeName: definition?.name,
        version: String(server.serverConfig?.version ?? 'LATEST'),
    };
}

export function addonsOf(server: Pick<IServer, 'addons'>): AddonRecord[] {
    return (server.addons ?? []) as unknown as AddonRecord[];
}

async function save(server: IServer, addons: AddonRecord[]): Promise<void> {
    await Server.updateOne({ _id: server._id }, { $set: { addons } });
    server.addons = addons as unknown as IServer['addons'];
}

async function folderOf(server: IServer): Promise<string> {
    return getServerFolderPath(server, server.email ?? '');
}

export function normalizeVersionString(value: string | null | undefined): string {
    return (value ?? '').trim().replace(/^v(?=\d)/i, '').toLowerCase();
}

export function extractVersionFromFilename(filename: string): string | undefined {
    const stem = filename.replace(/\.jar$/i, '');
    const match = stem.match(/[-_](v?\d+(?:\.\d+)+(?:[+-][A-Za-z0-9._-]+)?)$/);
    return match?.[1];
}

export function isNewerVersionAvailable(
    record: Pick<AddonRecord, 'versionId' | 'version' | 'staged'>,
    resolved: Pick<ResolvedDownload, 'versionId' | 'version'>
): boolean {
    if (record.staged?.versionId && resolved.versionId === record.staged.versionId) return false;
    if (record.versionId && record.versionId !== 'direct') {
        return resolved.versionId !== record.versionId;
    }
    if (record.version && resolved.version) {
        return normalizeVersionString(record.version) !== normalizeVersionString(resolved.version);
    }
    return false;
}

function matchKnownServerAddon(dir: 'plugins' | 'mods', filename: string, managedFiles?: Array<{ path: string; slug: string }>): KnownServerAddonSpec | null {
    const lowerName = filename.toLowerCase();
    const relPath = `${dir}/${lowerName}`;
    const managed = managedFiles?.find(entry => entry.path.replace(/^\/+/, '').toLowerCase() === relPath);
    if (managed) {
        const bySlug = KNOWN_SERVER_ADDONS.find(spec => spec.ref === managed.slug);
        if (bySlug) return bySlug;
    }
    return KNOWN_SERVER_ADDONS.find(spec =>
        spec.kind === (dir === 'plugins' ? 'plugin' : 'mod')
        && spec.prefixes.some(prefix => lowerName.startsWith(prefix))
    ) ?? null;
}

/**
 * Reconciles `server.addons` with server-added jars on disk (ViaVersion, ViaBackwards, ViaRewind, etc.)
 * and promotes completed `plugins/update/` staged plugin updates once Bukkit consumes them on restart.
 */
async function reconcileServerAddonsLocked(server: IServer): Promise<AddonRecord[]> {
    const folder = await folderOf(server);
    const current = [...addonsOf(server)];
    let changed = false;

    // 1. Promote plugin updates if Bukkit has already consumed `plugins/update/<jar>`
    for (let i = 0; i < current.length; i++) {
        const entry = current[i];
        if (!entry.staged || entry.kind !== 'plugin') continue;
        const stagedExists = await serverStorage.exists(`${folder}/${entry.staged.file}`).catch(() => true);
        if (!stagedExists) {
            current[i] = {
                ...entry,
                version: entry.staged.version ?? entry.version,
                versionId: entry.staged.versionId,
                availableUpdate: undefined,
                staged: undefined,
            };
            changed = true;
        }
    }

    // 2. Discover known server-added plugins & mods installed in `plugins/` or `mods/`
    const knownByRef = new Set(
        current
            .filter(entry => entry.source !== 'upload' && entry.source !== 'other')
            .map(entry => `${entry.source}:${entry.ref.toLowerCase()}`)
    );
    const knownByFile = new Set(current.map(entry => entry.file.toLowerCase()));

    for (const dir of ['plugins', 'mods'] as const) {
        let entries;
        try {
            entries = await serverStorage.getDirectoryContents(`${folder}/${dir}`);
        } catch {
            continue;
        }

        for (const item of entries) {
            if (item.type !== 'file' || !/\.jar$/i.test(item.basename)) continue;
            const relFile = `${dir}/${item.basename}`;
            if (knownByFile.has(relFile.toLowerCase())) continue;

            const spec = matchKnownServerAddon(dir, item.basename, server.managedFiles);
            if (!spec) continue;
            const sourceKey = `${spec.source}:${spec.ref.toLowerCase()}`;
            if (knownByRef.has(sourceKey)) continue;

            let version = extractVersionFromFilename(item.basename);
            try {
                const raw = await serverStorage.getFileContents(`${folder}/${relFile}`);
                const jar = inspectJar(raw);
                if (jar?.version) version = jar.version;
            } catch {
                // Keep filename version fallback
            }

            current.push({
                id: crypto.randomUUID(),
                kind: spec.kind,
                source: spec.source,
                ref: spec.ref,
                url: spec.url,
                name: spec.name,
                file: relFile,
                version,
                auto: true,
                installedByServer: true,
                addedAt: new Date(),
            });
            knownByRef.add(sourceKey);
            knownByFile.add(relFile.toLowerCase());
            changed = true;
        }
    }

    if (changed) {
        await save(server, current);
    }
    return current;
}

export function syncDiscoveredServerAddons(server: IServer): Promise<AddonRecord[]> {
    return exclusive(server.uniqueId, () => reconcileServerAddonsLocked(server));
}

function pickKind(options: { requested?: AddonKind; offered: AddonKind[]; caps: AddonCapabilities; jar?: JarInfo | null; allowIncompatible?: boolean }): AddonKind {
    const { requested, offered, caps, jar, allowIncompatible } = options;
    const allowed = (kind: AddonKind) => (kind === 'plugin' ? caps.plugins : caps.mods);
    if (jar) {
        if (!allowIncompatible && !allowed(jar.kind)) {
            throw new AddonError(`This is a ${jar.kind}, and ${getServerType(caps.type)?.name ?? 'this server'} does not load ${jar.kind}s.`);
        }
        return jar.kind;
    }
    if (requested) {
        if (!allowIncompatible && !allowed(requested)) {
            throw new AddonError(`${getServerType(caps.type)?.name ?? 'This server'} does not load ${requested}s.`);
        }
        return requested;
    }
    const fits = offered.filter(allowed);
    if (fits.length > 0) return fits[0];
    if (allowIncompatible && offered.length > 0) return offered[0];
    if (allowIncompatible && (caps.plugins || caps.mods)) return caps.plugins ? 'plugin' : 'mod';

    throw new AddonError(offered.length > 0
        ? `This is a ${offered.join(' and ')}, and ${getServerType(caps.type)?.name ?? 'this server'} does not load ${offered.length > 1 ? 'those' : `${offered[0]}s`}.`
        : `${getServerType(caps.type)?.name ?? 'This server'} does not load plugins or mods.`);
}

async function modLoaders(server: IServer, caps: AddonCapabilities): Promise<string[]> {
    const loader = loaderForType(caps.type) ?? await detectLoader(await folderOf(server));
    return loadersFor(caps.type, 'mod', loader);
}

function jarMatchesServer(jar: JarInfo, caps: AddonCapabilities, loaders: string[], allowIncompatible = false): void {
    if (allowIncompatible) return;
    if (jar.platform === 'velocity' || jar.platform === 'bungee') throw new AddonError('This is a proxy plugin. It cannot run on a game server.');
    if (jar.platform === 'sponge' && getServerType(caps.type)?.id !== 'spongevanilla') throw new AddonError('This is a Sponge plugin, which this server cannot load.');
    if (jar.kind === 'mod' && loaders.length > 0 && !loaders.includes(jar.platform)) {
        throw new AddonError(`This mod is made for ${jar.platform}, but the server runs ${loaders[0]}.`);
    }
}

async function placeJar(server: IServer, kind: AddonKind, desired: string, data: Buffer): Promise<string> {
    const folder = await folderOf(server);
    const dir = kind === 'plugin' ? 'plugins' : 'mods';
    try { await serverStorage.createDirectory(`${folder}/${dir}`); } catch { /* exists */ }
    const file = `${dir}/${safeJarName(desired)}`;
    await serverStorage.uploadFile(`${folder}/${file}`, data, true);
    return file;
}

async function removeFile(server: IServer, file: string): Promise<void> {
    const folder = await folderOf(server);
    try {
        if (await serverStorage.exists(`${folder}/${file}`)) await serverStorage.deleteFile(`${folder}/${file}`);
    } catch {
        // already gone
    }
}

export interface InstallOptions {
    auto?: boolean;
    kind?: AddonKind;
    addedBy?: string;
    /** Known sources are always fine; other links only when this is true */
    allowOther?: boolean;
}

/** Installs a plugin or mod from a link (warns rather than blocking when a mod/plugin link has no compatible server version) */
export function installFromLink(server: IServer, input: string, options: InstallOptions = {}): Promise<AddonRecord> {
    return exclusive(server.uniqueId, async () => {
        const link = identifyLink(input);
        if (!link) throw new AddonError('That is not a valid link.');
        if (link.source === 'other' && !options.allowOther) {
            throw new AddonError('Only links to Modrinth, SpigotMC, Bukkit and CurseForge can be used here. Turn on file uploads for this server to add other links.', 403);
        }
        const caps = capabilitiesOf(server);
        const existing = await reconcileServerAddonsLocked(server);
        if (existing.some(entry => entry.source === link.source && entry.ref.toLowerCase() === link.ref.toLowerCase())) throw new AddonError('This is installed already.');

        let lookup: AddonLookup;
        try {
            lookup = await lookupAddon(link);
        } catch (error) {
            throw new AddonError(error instanceof Error ? error.message : 'The link could not be read.', 422);
        }
        if (!lookup.downloadable) throw new AddonError(lookup.note ?? 'This cannot be downloaded automatically.', 422);
        if (existing.some(entry => entry.source === lookup.source && entry.ref.toLowerCase() === lookup.ref.toLowerCase())) throw new AddonError('This is installed already.');

        const serverModLoaders = caps.mods ? await modLoaders(server, caps) : [];
        const compatibilityWarning = checkAddonCompatibility(lookup, {
            plugins: caps.plugins,
            mods: caps.mods,
            type: caps.type,
            typeName: caps.typeName,
            loaders: serverModLoaders,
        });
        const allowIncompatible = compatibilityWarning !== null;

        const kind = pickKind({ requested: options.kind, offered: lookup.kinds, caps, allowIncompatible });
        const resolveLoaders = allowIncompatible
            ? (kind === 'mod'
                ? (lookup.loaders?.filter(loader => ['fabric', 'forge', 'neoforge', 'quilt', 'liteloader', 'rift'].includes(loader)) ?? ['fabric', 'forge', 'neoforge', 'quilt'])
                : loadersFor('PAPER', 'plugin'))
            : (kind === 'mod' ? serverModLoaders : loadersFor(caps.type, 'plugin'));

        if (!allowIncompatible && kind === 'mod' && resolveLoaders.length === 0) {
            throw new AddonError('The mod loader of this server is not known yet. Start the server once, then add mods.');
        }

        const resolved = await resolveDownload({ ...link, ref: lookup.ref } as LinkRef, {
            kind,
            loaders: resolveLoaders,
            mcVersion: caps.version,
        }).catch(error => {
            throw new AddonError(error instanceof Error ? error.message : 'No release was found.', 422);
        });
        const downloaded = await downloadFile(resolved.url).catch(error => {
            throw new AddonError(`The download failed: ${error instanceof Error ? error.message : 'unknown error'}`, 502);
        });
        const jar = inspectJar(downloaded.data);
        if (!jar) throw new AddonError('The downloaded file is not a plugin or mod jar.', 422);
        pickKind({ requested: kind, offered: [kind], caps, jar, allowIncompatible });
        jarMatchesServer(jar, caps, resolveLoaders, allowIncompatible);

        // Place incompatible cross-kind addons in the server's active folder (plugins/ for plugin servers, mods/ for mod servers)
        const folderKind: AddonKind = caps.plugins && !caps.mods
            ? 'plugin'
            : !caps.plugins && caps.mods
                ? 'mod'
                : kind;

        const desiredName = folderKind === 'plugin' && jar.name ? `${jar.name}.jar` : (downloaded.filename ?? resolved.filename);
        const file = await placeJar(server, folderKind, desiredName, downloaded.data);
        const record: AddonRecord = {
            id: crypto.randomUUID(),
            kind,
            source: lookup.source,
            ref: lookup.ref,
            url: lookup.url,
            name: lookup.name || jar.name || resolved.filename,
            icon: lookup.icon,
            file,
            version: resolved.version ?? jar.version,
            versionId: resolved.versionId === 'direct' ? (downloaded.etag ?? 'direct') : resolved.versionId,
            auto: options.auto ?? lookup.source !== 'other',
            addedAt: new Date(),
            addedBy: options.addedBy,
            ...(compatibilityWarning ? { compatibilityWarning, sourceLoaders: resolveLoaders } : {}),
        };
        await save(server, [...existing, record]);
        await refreshMemory(server);
        return record;
    });
}

/** Installs a jar the user uploaded */
export function installUpload(server: IServer, filename: string, data: Buffer, addedBy?: string): Promise<AddonRecord> {
    return exclusive(server.uniqueId, async () => {
        const caps = capabilitiesOf(server);
        const jar = inspectJar(data);
        if (!jar) throw new AddonError(`${filename} is not a plugin or mod jar.`, 422);
        const kind = pickKind({ offered: [jar.kind], caps, jar });
        const loaders = kind === 'mod' ? await modLoaders(server, caps) : [];
        jarMatchesServer(jar, caps, loaders);

        const file = await placeJar(server, kind, filename, data);
        const existing = (await reconcileServerAddonsLocked(server)).filter(entry => entry.file !== file);
        const record: AddonRecord = {
            id: crypto.randomUUID(), kind, source: 'upload', ref: '', name: jar.name || filename.replace(/\.jar$/i, ''), file,
            version: jar.version, auto: false, addedAt: new Date(), addedBy,
        };
        await save(server, [...existing, record]);
        await refreshMemory(server);
        return record;
    });
}

export function removeAddon(server: IServer, id: string): Promise<void> {
    return exclusive(server.uniqueId, async () => {
        const existing = await reconcileServerAddonsLocked(server);
        const record = existing.find(entry => entry.id === id);
        if (!record) throw new AddonError('This plugin or mod is not installed.', 404);
        await removeFile(server, record.file);
        if (record.staged) await removeFile(server, record.staged.file);
        await save(server, existing.filter(entry => entry.id !== id));
        await refreshMemory(server);
    });
}

export function setAutoUpdate(server: IServer, id: string, auto: boolean): Promise<void> {
    return exclusive(server.uniqueId, async () => {
        const existing = await reconcileServerAddonsLocked(server);
        const record = existing.find(entry => entry.id === id);
        if (!record) throw new AddonError('This plugin or mod is not installed.', 404);
        if (record.source === 'upload' || record.source === 'other') throw new AddonError('Only plugins and mods from Modrinth, SpigotMC, Bukkit and CurseForge can update themselves.');
        await save(server, existing.map(entry => entry.id === id ? { ...entry, auto } : entry));
    });
}

async function isRunning(server: IServer): Promise<boolean> {
    try {
        const container = await portainer.getContainerByIdentifier(getContainerName(server));
        return container?.State === 'running';
    } catch {
        return false;
    }
}

export interface UpdateOutcome {
    id: string;
    name: string;
    status: 'current' | 'updated' | 'staged' | 'failed' | 'skipped';
    version?: string;
    error?: string;
}

export interface CheckUpdateOutcome {
    id: string;
    name: string;
    status: 'update-available' | 'current' | 'skipped' | 'failed';
    currentVersion?: string;
    latestVersion?: string;
    error?: string;
}

async function resolveLoadersForRecord(server: IServer, record: AddonRecord, caps: AddonCapabilities): Promise<string[]> {
    if (record.sourceLoaders && record.sourceLoaders.length > 0) return record.sourceLoaders;
    if (record.kind === 'mod') {
        const loaders = await modLoaders(server, caps);
        return loaders.length > 0 ? loaders : ['fabric', 'forge', 'neoforge', 'quilt'];
    }
    return loadersFor(caps.type, 'plugin');
}

/** Checks known-source and server-added addons for newer releases without modifying files. */
export function checkAddonUpdates(server: IServer, options: { id?: string } = {}): Promise<CheckUpdateOutcome[]> {
    return exclusive(server.uniqueId, async () => {
        const existing = await reconcileServerAddonsLocked(server);
        const caps = capabilitiesOf(server);
        const outcomes: CheckUpdateOutcome[] = [];
        const next: AddonRecord[] = [];

        for (const record of existing) {
            if (options.id && record.id !== options.id) {
                next.push(record);
                continue;
            }
            if (record.source === 'upload' || record.source === 'other') {
                next.push(record);
                outcomes.push({ id: record.id, name: record.name, status: 'skipped', currentVersion: record.version });
                continue;
            }

            try {
                const loaders = await resolveLoadersForRecord(server, record, caps);
                const resolved = await resolveDownload(
                    { source: record.source, ref: record.ref, url: record.url ?? '' },
                    { kind: record.kind, loaders, mcVersion: caps.version }
                );
                const checkedAt = new Date();
                const hasUpdate = isNewerVersionAvailable(record, resolved);

                // Backfill versionId for pre-existing disk jars when normalized version already matches latest
                const syncedVersionId = !record.versionId && !hasUpdate ? resolved.versionId : record.versionId;
                next.push({
                    ...record,
                    versionId: syncedVersionId,
                    checkedAt,
                    availableUpdate: hasUpdate
                        ? { versionId: resolved.versionId, version: resolved.version, checkedAt }
                        : undefined,
                });
                outcomes.push({
                    id: record.id,
                    name: record.name,
                    status: hasUpdate ? 'update-available' : 'current',
                    currentVersion: record.version,
                    latestVersion: resolved.version,
                });
            } catch (error) {
                next.push(record);
                outcomes.push({
                    id: record.id,
                    name: record.name,
                    status: 'failed',
                    currentVersion: record.version,
                    error: error instanceof Error ? error.message : 'unknown error',
                });
            }
        }

        await save(server, next);
        return outcomes;
    });
}

/** Looks for a newer release of one add-on and installs it (or stages it while the server runs) */
async function updateRecord(server: IServer, record: AddonRecord, running: boolean): Promise<{ record: AddonRecord; outcome: UpdateOutcome }> {
    const base = { id: record.id, name: record.name };
    if (record.source === 'upload' || record.source === 'other') return { record, outcome: { ...base, status: 'skipped' } };
    const caps = capabilitiesOf(server);
    const loaders = await resolveLoadersForRecord(server, record, caps);
    const link: LinkRef = { source: record.source, ref: record.ref, url: record.url ?? '' };
    const resolved = await resolveDownload(link, { kind: record.kind, loaders, mcVersion: caps.version });
    const checkedAt = new Date();
    const checked: AddonRecord = { ...record, checkedAt };

    if (!isNewerVersionAvailable(record, resolved)) {
        const syncedVersionId = !record.versionId ? resolved.versionId : record.versionId;
        return {
            record: { ...checked, versionId: syncedVersionId, availableUpdate: undefined },
            outcome: { ...base, status: 'current', version: record.version },
        };
    }

    const downloaded = await downloadFile(resolved.url);
    const jar = inspectJar(downloaded.data);
    if (!jar) throw new Error('The new file is not a plugin or mod jar.');
    jarMatchesServer(jar, caps, loaders, Boolean(record.compatibilityWarning));

    const folder = await folderOf(server);
    const currentFolderKind: AddonKind = record.file.startsWith('plugins/') ? 'plugin' : 'mod';
    const newName = currentFolderKind === 'plugin'
        ? (record.file.split('/').pop() as string)
        : safeJarName(downloaded.filename ?? resolved.filename);

    if (!running) {
        if (currentFolderKind === 'mod' && `mods/${newName}` !== record.file) await removeFile(server, record.file);
        const file = await placeJar(server, currentFolderKind, newName, downloaded.data);
        if (record.staged) await removeFile(server, record.staged.file);
        return {
            record: {
                ...checked,
                file,
                version: resolved.version ?? jar.version,
                versionId: resolved.versionId,
                availableUpdate: undefined,
                staged: undefined,
            },
            outcome: { ...base, status: 'updated', version: resolved.version ?? jar.version },
        };
    }

    // Running: plugins go to Bukkit's update folder under the same name, mods wait outside the mods folder
    const stagedFile = currentFolderKind === 'plugin' ? `plugins/update/${newName}` : `.mms/staged/${newName}`;
    try { await serverStorage.createDirectory(`${folder}/${currentFolderKind === 'plugin' ? 'plugins/update' : '.mms'}`); } catch { /* exists */ }
    if (currentFolderKind === 'mod') { try { await serverStorage.createDirectory(`${folder}/.mms/staged`); } catch { /* exists */ } }
    await serverStorage.uploadFile(`${folder}/${stagedFile}`, downloaded.data, true);
    return {
        record: {
            ...checked,
            availableUpdate: undefined,
            staged: { versionId: resolved.versionId, version: resolved.version ?? jar.version, file: stagedFile },
        },
        outcome: { ...base, status: 'staged', version: resolved.version ?? jar.version },
    };
}

/** Updates one add-on, or every add-on with automatic updates when `id` is missing */
export function updateAddons(server: IServer, options: { id?: string; onlyAuto?: boolean } = {}): Promise<UpdateOutcome[]> {
    return exclusive(server.uniqueId, async () => {
        const running = await isRunning(server);
        const outcomes: UpdateOutcome[] = [];
        const next: AddonRecord[] = [];
        for (const record of await reconcileServerAddonsLocked(server)) {
            const wanted = options.id ? record.id === options.id : options.onlyAuto ? record.auto : true;
            if (!wanted) { next.push(record); continue; }
            try {
                const result = await updateRecord(server, record, running);
                next.push(result.record);
                outcomes.push(result.outcome);
            } catch (error) {
                next.push(record);
                outcomes.push({ id: record.id, name: record.name, status: 'failed', error: error instanceof Error ? error.message : 'unknown error' });
            }
        }
        await save(server, next);
        return outcomes;
    });
}

/** Puts staged mods in place. Run while the server is stopped, right before it starts */
export function applyStagedAddons(server: IServer): Promise<number> {
    return exclusive(server.uniqueId, async () => {
        const folder = await folderOf(server);
        let applied = 0;
        const next: AddonRecord[] = [];
        for (const record of addonsOf(server)) {
            if (!record.staged) { next.push(record); continue; }
            const staged = record.staged;
            try {
                const data = await serverStorage.getFileContents(`${folder}/${staged.file}`);
                if (record.kind === 'plugin') {
                    // Bukkit moves plugins/update itself at the next start
                    next.push(record);
                    continue;
                }
                const name = staged.file.split('/').pop() as string;
                if (`mods/${name}` !== record.file) await removeFile(server, record.file);
                const file = await placeJar(server, 'mod', name, data);
                await removeFile(server, staged.file);
                next.push({ ...record, file, version: staged.version, versionId: staged.versionId, availableUpdate: undefined, staged: undefined });
                applied++;
            } catch {
                next.push({ ...record, staged: undefined });
            }
        }
        if (applied > 0) await save(server, next);
        return applied;
    });
}

/** Counts the jars of a server and sizes its memory again, unless an administrator set it by hand */
export async function refreshMemory(server: IServer): Promise<{ mb: number; changed: boolean } | null> {
    if (server.serverConfig?.memoryMode === 'manual') return null;
    const folder = await folderOf(server);
    const count = async (dir: string) => {
        try {
            return (await serverStorage.getDirectoryContents(`${folder}/${dir}`)).filter(entry => entry.type === 'file' && /\.jar$/i.test(entry.basename) && !isHiddenFromUsers(`${dir}/${entry.basename}`)).length;
        } catch {
            return 0;
        }
    };
    const mb = computeMemoryMb({
        serverType: String(server.serverConfig?.serverType ?? ''),
        plugins: await count('plugins'), mods: await count('mods'), players: Number(server.serverConfig?.maxPlayers) || 0,
    }, await getPlatformSettings());
    const changed = mb !== Number(server.serverConfig?.serverMemory);
    if (changed) {
        await Server.updateOne({ _id: server._id }, { $set: { 'serverConfig.serverMemory': mb } });
        if (server.serverConfig) server.serverConfig.serverMemory = mb;
    }
    return { mb, changed };
}

/** Automatic updates for every server. Called by the background job */
export async function runAddonUpdates(): Promise<{ servers: number; updated: number; staged: number }> {
    const servers = await Server.find({ kind: { $ne: 'proxy' }, 'addons.auto': true });
    let updated = 0;
    let staged = 0;
    for (const server of servers) {
        try {
            const outcomes = await updateAddons(server, { onlyAuto: true });
            updated += outcomes.filter(outcome => outcome.status === 'updated').length;
            staged += outcomes.filter(outcome => outcome.status === 'staged').length;
        } catch (error) {
            console.warn(`[addons] ${server.uniqueId}:`, error instanceof Error ? error.message : error);
        }
    }
    return { servers: servers.length, updated, staged };
}
