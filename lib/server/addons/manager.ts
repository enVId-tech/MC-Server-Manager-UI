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
    findMatchingSources,
    identifyLink,
    listAddonVersions,
    loadersFor,
    lookupAddon,
    matchModrinthHashes,
    resolveDownload,
    type AddonLookup,
    type AddonSource,
    type AddonVersionOption,
    type HashMatchInfo,
    type LinkRef,
    type MatchedSource,
    type ResolvedDownload,
} from './sources';

export interface AddonRecord {
    id: string;
    kind: AddonKind;
    source: AddonSource | 'upload' | 'discovered';
    /** Where the jar originally came from (link, manual upload, pre-existing disk jar, or server setup) */
    origin?: 'link' | 'upload' | 'existing' | 'server';
    /** Slug, resource id or URL it was installed from. Empty for unlinked local jars */
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
    /** True when the user deliberately pinned an older/specific release */
    pinnedVersion?: boolean;
    /** Matching known repositories discovered for this plugin/mod */
    matchedSources?: MatchedSource[];
    sourcesCheckedAt?: Date;
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
    /** A newer release that is downloaded and waits for the next start/restart */
    staged?: { versionId: string; version?: string; file: string; targetFile?: string };
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

export function isTrackableSource(source: AddonRecord['source']): source is Exclude<AddonSource, 'other'> {
    return source !== 'upload' && source !== 'discovered' && source !== 'other';
}

function mergeMatchedSources(primary: MatchedSource[], secondary?: MatchedSource[]): MatchedSource[] {
    const out: MatchedSource[] = [];
    const seen = new Set<string>();
    for (const item of [...primary, ...(secondary ?? [])]) {
        const key = `${item.source}:${item.ref.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function specToMatchedSource(spec: KnownServerAddonSpec): MatchedSource {
    return {
        source: spec.source,
        ref: spec.ref,
        url: spec.url,
        name: spec.name,
        downloadable: true,
        kinds: [spec.kind],
    };
}

function lookupToMatchedSource(lookup: AddonLookup): MatchedSource | null {
    if (lookup.source === 'other') return null;
    return {
        source: lookup.source,
        ref: lookup.ref,
        url: lookup.url,
        name: lookup.name,
        description: lookup.description,
        icon: lookup.icon,
        author: lookup.author,
        downloadable: lookup.downloadable,
        kinds: lookup.kinds,
        loaders: lookup.loaders,
        note: lookup.note,
    };
}

function sha512Hex(data: Buffer): string {
    return crypto.createHash('sha512').update(data).digest('hex');
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

const MAX_DISCOVER_JARS = 60;

interface DiscoveredJarCandidate {
    dir: 'plugins' | 'mods';
    relFile: string;
    basename: string;
    spec: KnownServerAddonSpec | null;
    jar: JarInfo | null;
    raw?: Buffer;
    hash?: string;
    version?: string;
}

/**
 * Reconciles `server.addons` with all plugin/mod jars on disk (existing server jars, manually added jars,
 * and server-added plugins), removes records for jars deleted on disk, matches newly discovered jars against
 * Modrinth/SpigotMC/CurseForge, and backfills missing project icons.
 */
async function reconcileServerAddonsLocked(
    server: IServer,
    options: { skipRemoteMatch?: boolean; forceRematch?: boolean; targetId?: string } = {}
): Promise<AddonRecord[]> {
    const folder = await folderOf(server);
    const caps = capabilitiesOf(server);
    let current = [...addonsOf(server)];
    let changed = false;

    const listedDirs = new Set<'plugins' | 'mods'>();
    const filesOnDisk = new Set<string>();
    const diskEntries: Array<{ dir: 'plugins' | 'mods'; basename: string; relFile: string; size?: number }> = [];

    for (const dir of ['plugins', 'mods'] as const) {
        try {
            const entries = await serverStorage.getDirectoryContents(`${folder}/${dir}`);
            listedDirs.add(dir);
            for (const item of entries) {
                if (item.type !== 'file' || !/\.jar$/i.test(item.basename)) continue;
                const relFile = `${dir}/${item.basename}`;
                filesOnDisk.add(relFile.toLowerCase());
                diskEntries.push({ dir, basename: item.basename, relFile, size: item.size });
            }
        } catch {
            // Directory does not exist yet or cannot be read
        }
    }

    // Remove records whose jar disappeared from a readable plugins/ or mods/ directory and has no staged swap waiting
    const pruned = current.filter(entry => {
        if (entry.staged) return true;
        const dir = entry.file.startsWith('plugins/') ? 'plugins' : entry.file.startsWith('mods/') ? 'mods' : null;
        if (!dir || !listedDirs.has(dir)) return true;
        return filesOnDisk.has(entry.file.toLowerCase());
    });
    if (pruned.length !== current.length) {
        current = pruned;
        changed = true;
    }

    const knownByFile = new Set(current.map(entry => entry.file.toLowerCase()));
    const undiscoveredEntries = diskEntries
        .filter(item => !knownByFile.has(item.relFile.toLowerCase()))
        .slice(0, MAX_DISCOVER_JARS);

    if (undiscoveredEntries.length > 0) {
        const candidates: DiscoveredJarCandidate[] = [];
        for (let i = 0; i < undiscoveredEntries.length; i += 4) {
            const chunk = undiscoveredEntries.slice(i, i + 4);
            const loaded = await Promise.all(chunk.map(async item => {
                const spec = matchKnownServerAddon(item.dir, item.basename, server.managedFiles);
                let version = extractVersionFromFilename(item.basename);
                let jar: JarInfo | null = null;
                let raw: Buffer | undefined;
                let hash: string | undefined;
                try {
                    if (item.size === undefined || item.size <= 150 * 1024 * 1024) {
                        raw = await serverStorage.getFileContents(`${folder}/${item.relFile}`);
                        jar = inspectJar(raw);
                        if (jar?.version) version = jar.version;
                        hash = sha512Hex(raw);
                    }
                } catch {
                    // Keep filename fallback when jar cannot be read
                }
                return { dir: item.dir, relFile: item.relFile, basename: item.basename, spec, jar, raw, hash, version };
            }));
            candidates.push(...loaded);
        }

        const hashMatches: Record<string, HashMatchInfo> = options.skipRemoteMatch
            ? {}
            : await matchModrinthHashes(candidates.map(c => c.hash).filter((h): h is string => Boolean(h)));

        const serverModLoaders = caps.mods ? await modLoaders(server, caps).catch(() => []) : [];

        for (let i = 0; i < candidates.length; i += 3) {
            const batch = candidates.slice(i, i + 3);
            await Promise.all(batch.map(async item => {
                const kind: AddonKind = item.spec?.kind ?? item.jar?.kind ?? (item.dir === 'plugins' ? 'plugin' : 'mod');
                const stemName = item.basename.replace(/\.jar$/i, '');
                const displayName = item.spec?.name || (item.jar?.name && item.jar.name.trim()) || stemName;
                const hashMatch = item.hash ? hashMatches[item.hash] : undefined;

                let matchedSources: MatchedSource[] = item.spec ? [specToMatchedSource(item.spec)] : [];
                let sourcesCheckedAt: Date | undefined;

                if (!options.skipRemoteMatch) {
                    const found = await findMatchingSources({
                        name: displayName,
                        id: item.jar?.id,
                        filename: item.basename,
                        kind,
                        loaders: kind === 'mod' ? serverModLoaders : undefined,
                        exactModrinth: hashMatch?.matchedSource,
                    }).catch(() => []);
                    matchedSources = mergeMatchedSources(matchedSources, found);
                    sourcesCheckedAt = new Date();
                }

                const firstDownloadable = matchedSources.find(m => m.downloadable);
                if (item.spec) {
                    const specIcon = matchedSources.find(m => m.source === item.spec!.source && m.ref === item.spec!.ref)?.icon;
                    current.push({
                        id: crypto.randomUUID(),
                        kind: item.spec.kind,
                        origin: 'server',
                        source: item.spec.source,
                        ref: item.spec.ref,
                        url: item.spec.url,
                        name: item.spec.name,
                        icon: specIcon,
                        file: item.relFile,
                        version: hashMatch?.version ?? item.version,
                        versionId: hashMatch?.versionId,
                        auto: true,
                        installedByServer: true,
                        matchedSources: matchedSources.length > 0 ? matchedSources : undefined,
                        sourcesCheckedAt,
                        addedAt: new Date(),
                    });
                } else if (firstDownloadable) {
                    const exactForChosen = hashMatch && firstDownloadable.source === 'modrinth' && firstDownloadable.ref === hashMatch.matchedSource.ref;
                    current.push({
                        id: crypto.randomUUID(),
                        kind,
                        origin: 'existing',
                        source: firstDownloadable.source,
                        ref: firstDownloadable.ref,
                        url: firstDownloadable.url,
                        name: firstDownloadable.name || displayName,
                        icon: firstDownloadable.icon,
                        file: item.relFile,
                        version: exactForChosen ? (hashMatch.version ?? item.version) : item.version,
                        versionId: exactForChosen ? hashMatch.versionId : undefined,
                        auto: false,
                        matchedSources,
                        sourcesCheckedAt,
                        addedAt: new Date(),
                    });
                } else {
                    current.push({
                        id: crypto.randomUUID(),
                        kind,
                        origin: 'existing',
                        source: 'discovered',
                        ref: '',
                        name: displayName,
                        icon: matchedSources[0]?.icon,
                        file: item.relFile,
                        version: item.version,
                        auto: false,
                        matchedSources: matchedSources.length > 0 ? matchedSources : undefined,
                        sourcesCheckedAt,
                        addedAt: new Date(),
                    });
                }
                changed = true;
            }));
        }
    }

    // When explicit source rematch is requested, re-match existing/uploaded/tracked jars so all available sources appear
    if (options.forceRematch) {
        const serverModLoaders = caps.mods ? await modLoaders(server, caps).catch(() => []) : [];
        const targets = current
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => !options.targetId || entry.id === options.targetId);

        const hashToIndex = new Map<string, number>();
        const hashes: string[] = [];

        for (let i = 0; i < targets.length; i += 4) {
            const chunk = targets.slice(i, i + 4);
            await Promise.all(chunk.map(async ({ entry, index }) => {
                try {
                    const raw = await serverStorage.getFileContents(`${folder}/${entry.file}`);
                    const hash = sha512Hex(raw);
                    hashToIndex.set(hash, index);
                    hashes.push(hash);
                } catch {
                    // Non-fatal
                }
            }));
        }

        const hashMatches = await matchModrinthHashes(hashes);
        const hashMatchByIdx = new Map<number, HashMatchInfo>();
        for (const [hash, info] of Object.entries(hashMatches)) {
            const idx = hashToIndex.get(hash);
            if (idx !== undefined) hashMatchByIdx.set(idx, info);
        }

        for (let i = 0; i < targets.length; i += 3) {
            const batch = targets.slice(i, i + 3);
            await Promise.all(batch.map(async ({ entry, index }) => {
                const hashMatch = hashMatchByIdx.get(index);
                const filename = entry.file.split('/').pop() ?? entry.name;
                const found = await findMatchingSources({
                    name: entry.name,
                    filename,
                    kind: entry.kind,
                    loaders: entry.kind === 'mod' ? serverModLoaders : undefined,
                    exactModrinth: hashMatch?.matchedSource,
                }).catch(() => []);

                const currentAsMatch: MatchedSource[] = isTrackableSource(entry.source)
                    ? [{
                        source: entry.source,
                        ref: entry.ref,
                        url: entry.url ?? '',
                        name: entry.name,
                        icon: entry.icon,
                        downloadable: true,
                        kinds: [entry.kind],
                    }]
                    : [];

                const merged = mergeMatchedSources(
                    entry.matchedSources ?? [],
                    [...found, ...currentAsMatch]
                );
                const bestDownloadable = merged.find(m => m.downloadable);
                const shouldAttachLocal = (entry.source === 'upload' || entry.source === 'discovered') && Boolean(bestDownloadable);

                current[index] = {
                    ...entry,
                    matchedSources: merged.length > 0 ? merged : undefined,
                    sourcesCheckedAt: new Date(),
                    ...(shouldAttachLocal && bestDownloadable
                        ? {
                            source: bestDownloadable.source,
                            ref: bestDownloadable.ref,
                            url: bestDownloadable.url,
                            icon: entry.icon ?? bestDownloadable.icon,
                        }
                        : {
                            icon: entry.icon ?? merged[0]?.icon,
                        }),
                    ...(hashMatch && (!isTrackableSource(entry.source) || (entry.source === 'modrinth' && entry.ref === hashMatch.matchedSource.ref))
                        ? {
                            versionId: entry.versionId ?? hashMatch.versionId,
                            version: entry.version ?? hashMatch.version,
                        }
                        : {}),
                };
                changed = true;
            }));
        }
    }

    // Backfill icons (and missing URLs) for tracked known-source addons so UI rows display their project logos
    const missingIconIndices = current
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => isTrackableSource(entry.source) && (!entry.icon || !entry.url));

    if (missingIconIndices.length > 0) {
        await Promise.all(missingIconIndices.map(async ({ entry, index }) => {
            try {
                const looked = await lookupAddon({ source: entry.source as AddonSource, ref: entry.ref, url: entry.url ?? '' });
                if (looked.icon || (!entry.url && looked.url)) {
                    const asMatched = lookupToMatchedSource(looked);
                    current[index] = {
                        ...current[index],
                        icon: entry.icon ?? looked.icon,
                        url: entry.url || looked.url,
                        matchedSources: asMatched
                            ? mergeMatchedSources(current[index].matchedSources ?? [], [asMatched])
                            : current[index].matchedSources,
                    };
                    changed = true;
                }
            } catch {
                // Non-fatal: keep record without icon if the remote API is unreachable
            }
        }));
    }

    if (changed) {
        await save(server, current);
    }
    return current;
}

export function syncDiscoveredServerAddons(server: IServer, options: { skipRemoteMatch?: boolean } = {}): Promise<AddonRecord[]> {
    return exclusive(server.uniqueId, () => reconcileServerAddonsLocked(server, options));
}

export function scanAndMatchAddonSources(server: IServer, options: { id?: string } = {}): Promise<AddonRecord[]> {
    return exclusive(server.uniqueId, () => reconcileServerAddonsLocked(server, { forceRematch: true, targetId: options.id }));
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
    /** Pin to a specific remote version instead of the latest compatible release */
    versionId?: string;
    allowIncompatibleVersion?: boolean;
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
        const existing = await reconcileServerAddonsLocked(server, { skipRemoteMatch: true });
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
            versionId: options.versionId,
            allowIncompatibleVersion: options.allowIncompatibleVersion || allowIncompatible,
        }).catch(error => {
            throw new AddonError(error instanceof Error ? error.message : 'No release was found.', 422);
        });
        const downloaded = await downloadFile(resolved.url).catch(error => {
            throw new AddonError(`The download failed: ${error instanceof Error ? error.message : 'unknown error'}`, 502);
        });
        const jar = inspectJar(downloaded.data);
        if (!jar) throw new AddonError('The downloaded file is not a plugin or mod jar.', 422);
        pickKind({ requested: kind, offered: [kind], caps, jar, allowIncompatible });
        jarMatchesServer(jar, caps, resolveLoaders, allowIncompatible || options.allowIncompatibleVersion);

        // Place incompatible cross-kind addons in the server's active folder (plugins/ for plugin servers, mods/ for mod servers)
        const folderKind: AddonKind = caps.plugins && !caps.mods
            ? 'plugin'
            : !caps.plugins && caps.mods
                ? 'mod'
                : kind;

        const desiredName = downloaded.filename || resolved.filename || (folderKind === 'plugin' && jar.name ? `${jar.name}.jar` : 'addon.jar');
        const file = await placeJar(server, folderKind, desiredName, downloaded.data);
        const primaryMatch = lookupToMatchedSource(lookup);
        const extraMatches = lookup.source !== 'other'
            ? await findMatchingSources({
                name: lookup.name || jar.name || desiredName,
                id: jar.id,
                filename: desiredName,
                kind,
                loaders: kind === 'mod' ? resolveLoaders : undefined,
                exactModrinth: primaryMatch?.source === 'modrinth' ? primaryMatch : undefined,
            }).catch(() => [])
            : [];
        const matchedSources = primaryMatch ? mergeMatchedSources([primaryMatch], extraMatches) : undefined;
        const pinned = Boolean(options.versionId);

        const record: AddonRecord = {
            id: crypto.randomUUID(),
            kind,
            origin: 'link',
            source: lookup.source,
            ref: lookup.ref,
            url: lookup.url,
            name: lookup.name || jar.name || resolved.filename,
            icon: lookup.icon,
            file,
            version: resolved.version ?? jar.version,
            versionId: resolved.versionId === 'direct' ? (downloaded.etag ?? 'direct') : resolved.versionId,
            auto: options.auto ?? (!pinned && lookup.source !== 'other'),
            ...(pinned ? { pinnedVersion: true } : {}),
            ...(matchedSources && matchedSources.length > 0 ? { matchedSources, sourcesCheckedAt: new Date() } : {}),
            addedAt: new Date(),
            addedBy: options.addedBy,
            ...(compatibilityWarning ? { compatibilityWarning, sourceLoaders: resolveLoaders } : {}),
        };
        await save(server, [...existing, record]);
        await refreshMemory(server);
        return record;
    });
}

/** Installs a jar the user uploaded and attempts to match it with Modrinth/SpigotMC/CurseForge sources */
export function installUpload(server: IServer, filename: string, data: Buffer, addedBy?: string): Promise<AddonRecord> {
    return exclusive(server.uniqueId, async () => {
        const caps = capabilitiesOf(server);
        const jar = inspectJar(data);
        if (!jar) throw new AddonError(`${filename} is not a plugin or mod jar.`, 422);
        const kind = pickKind({ offered: [jar.kind], caps, jar });
        const loaders = kind === 'mod' ? await modLoaders(server, caps) : [];
        jarMatchesServer(jar, caps, loaders);

        const file = await placeJar(server, kind, filename, data);
        const existing = (await reconcileServerAddonsLocked(server, { skipRemoteMatch: true })).filter(entry => entry.file !== file);

        const hash = sha512Hex(data);
        const hashMatches = await matchModrinthHashes([hash]).catch(() => ({} as Record<string, HashMatchInfo>));
        const hashMatch = hashMatches[hash];
        const matchedSources = await findMatchingSources({
            name: jar.name || filename.replace(/\.jar$/i, ''),
            id: jar.id,
            filename,
            kind,
            loaders: kind === 'mod' ? loaders : undefined,
            exactModrinth: hashMatch?.matchedSource,
        }).catch(() => []);

        const firstDownloadable = matchedSources.find(m => m.downloadable);
        const exactForChosen = hashMatch && firstDownloadable?.source === 'modrinth' && firstDownloadable.ref === hashMatch.matchedSource.ref;

        const record: AddonRecord = {
            id: crypto.randomUUID(),
            kind,
            origin: 'upload',
            source: firstDownloadable ? firstDownloadable.source : 'upload',
            ref: firstDownloadable ? firstDownloadable.ref : '',
            url: firstDownloadable?.url,
            name: firstDownloadable?.name || jar.name || filename.replace(/\.jar$/i, ''),
            icon: firstDownloadable?.icon ?? matchedSources[0]?.icon,
            file,
            version: exactForChosen ? (hashMatch.version ?? jar.version) : (jar.version ?? extractVersionFromFilename(filename)),
            versionId: exactForChosen ? hashMatch.versionId : undefined,
            auto: false,
            ...(matchedSources.length > 0 ? { matchedSources, sourcesCheckedAt: new Date() } : {}),
            addedAt: new Date(),
            addedBy,
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
        const existing = await reconcileServerAddonsLocked(server, { skipRemoteMatch: true });
        const record = existing.find(entry => entry.id === id);
        if (!record) throw new AddonError('This plugin or mod is not installed.', 404);
        if (!isTrackableSource(record.source)) throw new AddonError('Only plugins and mods matched to Modrinth, SpigotMC, Bukkit or CurseForge can update automatically.');
        await save(server, existing.map(entry => entry.id === id ? { ...entry, auto, ...(auto ? { pinnedVersion: false } : {}) } : entry));
    });
}

/** Switches which source repository a plugin/mod uses for version checks and automatic updates (or switches to local-only). */
export function switchAddonSource(
    server: IServer,
    id: string,
    options: { source?: AddonSource | 'local'; ref?: string; link?: string }
): Promise<AddonRecord> {
    return exclusive(server.uniqueId, async () => {
        const existing = await reconcileServerAddonsLocked(server, { skipRemoteMatch: true });
        const record = existing.find(entry => entry.id === id);
        if (!record) throw new AddonError('This plugin or mod is not installed.', 404);

        if (options.source === 'local') {
            const localSource: AddonRecord['source'] = record.origin === 'upload' ? 'upload' : 'discovered';
            const updated: AddonRecord = {
                ...record,
                source: localSource,
                ref: '',
                url: undefined,
                auto: false,
                versionId: undefined,
                availableUpdate: undefined,
                compatibilityWarning: undefined,
                sourceLoaders: undefined,
            };
            await save(server, existing.map(entry => entry.id === id ? updated : entry));
            return updated;
        }

        let chosenMatch: MatchedSource | undefined;
        if (options.link) {
            const parsed = identifyLink(options.link);
            if (!parsed || parsed.source === 'other') {
                throw new AddonError('Please enter a valid Modrinth, SpigotMC, Bukkit, or CurseForge URL.');
            }
            const lookup = await lookupAddon(parsed);
            if (!lookup.downloadable) throw new AddonError(lookup.note ?? 'This source does not offer direct downloads.');
            chosenMatch = lookupToMatchedSource(lookup) ?? undefined;
        } else if (options.source) {
            const targetRef = options.ref?.toLowerCase();
            chosenMatch = (record.matchedSources ?? []).find(
                m => m.source === options.source && (!targetRef || m.ref.toLowerCase() === targetRef)
            );
            if (!chosenMatch && options.ref) {
                const url = options.source === 'modrinth'
                    ? `https://modrinth.com/${record.kind}/${options.ref}`
                    : options.source === 'spigot'
                        ? `https://www.spigotmc.org/resources/${options.ref}/`
                        : options.source === 'bukkit'
                            ? `https://dev.bukkit.org/projects/${options.ref}`
                            : `https://www.curseforge.com/minecraft/${record.kind === 'plugin' ? 'bukkit-plugins' : 'mc-mods'}/${options.ref}`;
                const lookup = await lookupAddon({ source: options.source, ref: options.ref, url });
                chosenMatch = lookupToMatchedSource(lookup) ?? undefined;
            }
        }

        if (!chosenMatch) throw new AddonError('The chosen source match was not found.', 404);
        if (!chosenMatch.downloadable) {
            throw new AddonError(chosenMatch.note ?? `${chosenMatch.name} on ${chosenMatch.source} does not allow automatic downloads.`);
        }

        const caps = capabilitiesOf(server);
        const serverModLoaders = caps.mods ? await modLoaders(server, caps).catch(() => []) : [];
        const compatibilityWarning = checkAddonCompatibility(
            { name: chosenMatch.name, source: chosenMatch.source, kinds: chosenMatch.kinds, loaders: chosenMatch.loaders },
            { plugins: caps.plugins, mods: caps.mods, type: caps.type, typeName: caps.typeName, loaders: serverModLoaders }
        );

        const nextMatches = mergeMatchedSources([chosenMatch], record.matchedSources);
        const updated: AddonRecord = {
            ...record,
            source: chosenMatch.source,
            ref: chosenMatch.ref,
            url: chosenMatch.url,
            icon: record.icon ?? chosenMatch.icon,
            matchedSources: nextMatches,
            versionId: undefined,
            availableUpdate: undefined,
            compatibilityWarning: compatibilityWarning ?? undefined,
            checkedAt: undefined,
        };
        await save(server, existing.map(entry => entry.id === id ? updated : entry));
        return updated;
    });
}

/** Lists selectable versions for an installed addon or a remote preview on a given server. */
export async function getAddonVersionsForServer(
    server: IServer,
    query: { id?: string; source?: AddonSource; ref?: string; kind?: AddonKind }
): Promise<{ versions: AddonVersionOption[]; strictModMatching: boolean; mcVersion: string; loaders: string[] }> {
    const caps = capabilitiesOf(server);
    let source = query.source;
    let ref = query.ref;
    let kind: AddonKind = query.kind ?? (caps.mods && !caps.plugins ? 'mod' : 'plugin');
    let loadersOverride: string[] | undefined;

    if (query.id) {
        const record = addonsOf(server).find(entry => entry.id === query.id);
        if (!record) throw new AddonError('This plugin or mod is not installed.', 404);
        if (!isTrackableSource(record.source)) {
            throw new AddonError('Match this plugin or mod to a known source first to browse versions.');
        }
        source = record.source;
        ref = record.ref;
        kind = record.kind;
        loadersOverride = record.sourceLoaders;
    }

    if (!source || !ref || source === 'other') {
        throw new AddonError('A known source and project id are required.');
    }

    const loaders = loadersOverride && loadersOverride.length > 0
        ? loadersOverride
        : (kind === 'mod'
            ? (await modLoaders(server, caps).catch(() => []))
            : loadersFor(caps.type, 'plugin'));

    const versions = await listAddonVersions(
        { source, ref, url: '' },
        { kind, loaders, mcVersion: caps.version }
    );

    return {
        versions,
        strictModMatching: kind === 'mod',
        mcVersion: caps.version,
        loaders,
    };
}

async function isRunning(server: IServer): Promise<boolean> {
    try {
        const environmentId = await portainer.getValidEnvironmentId(server.environmentId ?? null).catch(() => undefined);
        const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId);
        return container?.State === 'running' || container?.State === 'restarting' || container?.State === 'paused';
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
            if (!isTrackableSource(record.source)) {
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

/** Installs or stages a downloaded addon release cleanly (in-place when stopped; staged under .mms/staged when running). */
async function applyOrStageDownload(
    server: IServer,
    record: AddonRecord,
    resolved: ResolvedDownload,
    running: boolean,
    caps: AddonCapabilities,
    loaders: string[],
    options: { allowIncompatibleVersion?: boolean; pinnedVersion?: boolean; forceAutoOff?: boolean } = {}
): Promise<{ record: AddonRecord; outcome: UpdateOutcome }> {
    const base = { id: record.id, name: record.name };
    const downloaded = await downloadFile(resolved.url);
    const jar = inspectJar(downloaded.data);
    if (!jar) throw new Error('The new file is not a plugin or mod jar.');
    jarMatchesServer(jar, caps, loaders, Boolean(record.compatibilityWarning || options.allowIncompatibleVersion));

    const folder = await folderOf(server);
    const currentFolderKind: AddonKind = record.file.startsWith('plugins/') ? 'plugin' : 'mod';
    const currentDir = currentFolderKind === 'plugin' ? 'plugins' : 'mods';
    const oldBaseName = record.file.split('/').pop() as string;
    const newName = safeJarName(resolved.filename || downloaded.filename || oldBaseName);
    const newFile = `${currentDir}/${newName}`;
    const checkedAt = new Date();
    const version = resolved.version ?? jar.version;
    const nextAuto = options.forceAutoOff ? false : record.auto;
    const nextPinned = options.pinnedVersion ?? record.pinnedVersion;

    if (!running) {
        const file = await placeJar(server, currentFolderKind, newName, downloaded.data);
        if (file !== record.file) await removeFile(server, record.file);
        if (record.staged) await removeFile(server, record.staged.file);
        await removeFile(server, `plugins/update/${oldBaseName}`);
        return {
            record: {
                ...record,
                checkedAt,
                file,
                version,
                versionId: resolved.versionId,
                auto: nextAuto,
                ...(nextPinned !== undefined ? { pinnedVersion: nextPinned } : {}),
                availableUpdate: undefined,
                staged: undefined,
            },
            outcome: { ...base, status: 'updated', version },
        };
    }

    if (record.staged && record.staged.file !== `.mms/staged/${newName}`) {
        await removeFile(server, record.staged.file);
    }
    await removeFile(server, `plugins/update/${oldBaseName}`);

    const stagedFile = `.mms/staged/${newName}`;
    try { await serverStorage.createDirectory(`${folder}/.mms`); } catch { /* exists */ }
    try { await serverStorage.createDirectory(`${folder}/.mms/staged`); } catch { /* exists */ }
    await serverStorage.uploadFile(`${folder}/${stagedFile}`, downloaded.data, true);
    return {
        record: {
            ...record,
            checkedAt,
            auto: nextAuto,
            ...(nextPinned !== undefined ? { pinnedVersion: nextPinned } : {}),
            availableUpdate: undefined,
            staged: { versionId: resolved.versionId, version, file: stagedFile, targetFile: newFile },
        },
        outcome: { ...base, status: 'staged', version },
    };
}

/** Looks for a newer release of one add-on and installs it (or stages it while the server runs) */
async function updateRecord(server: IServer, record: AddonRecord, running: boolean): Promise<{ record: AddonRecord; outcome: UpdateOutcome }> {
    const base = { id: record.id, name: record.name };
    if (!isTrackableSource(record.source)) return { record, outcome: { ...base, status: 'skipped' } };
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

    return applyOrStageDownload(server, checked, resolved, running, caps, loaders, { pinnedVersion: false });
}

/** Switches an installed plugin or mod to a specific remote version (staged on running servers, immediate when stopped). */
export function switchAddonVersion(
    server: IServer,
    id: string,
    versionId: string,
    options: { allowIncompatibleVersion?: boolean } = {}
): Promise<UpdateOutcome> {
    return exclusive(server.uniqueId, async () => {
        const existing = await reconcileServerAddonsLocked(server, { skipRemoteMatch: true });
        const index = existing.findIndex(entry => entry.id === id);
        if (index === -1) throw new AddonError('This plugin or mod is not installed.', 404);

        const record = existing[index];
        if (!isTrackableSource(record.source)) {
            throw new AddonError('Match this plugin or mod to a known source first to change its version.');
        }

        const caps = capabilitiesOf(server);
        const loaders = await resolveLoadersForRecord(server, record, caps);
        const link: LinkRef = { source: record.source, ref: record.ref, url: record.url ?? '' };
        const resolved = await resolveDownload(link, {
            kind: record.kind,
            loaders,
            mcVersion: caps.version,
            versionId,
            allowIncompatibleVersion: options.allowIncompatibleVersion || Boolean(record.compatibilityWarning),
        });

        // Determine if user selected an older/custom version rather than newest compatible release
        let isLatestCompatible = false;
        try {
            const latest = await resolveDownload(link, { kind: record.kind, loaders, mcVersion: caps.version });
            isLatestCompatible = latest.versionId === resolved.versionId;
        } catch {
            isLatestCompatible = false;
        }

        const running = await isRunning(server);
        const applied = await applyOrStageDownload(server, record, resolved, running, caps, loaders, {
            allowIncompatibleVersion: options.allowIncompatibleVersion,
            pinnedVersion: !isLatestCompatible,
            forceAutoOff: !isLatestCompatible,
        });

        existing[index] = applied.record;
        await save(server, existing);
        return applied.outcome;
    });
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

/** Applies staged plugin and mod updates while the server is stopped: writes the new file, deletes the old version, and removes the staged copy. */
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
                const folderKind: AddonKind = record.file.startsWith('plugins/') ? 'plugin' : 'mod';
                const targetName = safeJarName((staged.targetFile ?? staged.file).split('/').pop() as string);
                const file = await placeJar(server, folderKind, targetName, data);
                if (file !== record.file) await removeFile(server, record.file);
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
