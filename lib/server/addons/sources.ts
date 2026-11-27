/**
 * Where plugins and mods come from. Links to Modrinth, Spigot, Bukkit and CurseForge are recognised: the name and
 * logo are read from the site and the newest release for the server is found, which is also what makes automatic
 * updates possible. Every other link is downloaded as it is, without any lookup.
 */
import { compareMinecraftVersions, isFloatingVersion } from '@/lib/data/itzg/versions';
import { getServerType } from '@/lib/data/itzg/serverTypes';
import { fetchJson, safeFetch } from './net';
import type { AddonKind } from './jar';

export type AddonSource = 'modrinth' | 'spigot' | 'bukkit' | 'curseforge' | 'other';

export interface LinkRef {
    source: AddonSource;
    /** Modrinth or Bukkit slug, Spigot resource id, CurseForge slug. The whole URL for other links */
    ref: string;
    url: string;
}

export interface AddonLookup {
    source: AddonSource;
    ref: string;
    url: string;
    name: string;
    description?: string;
    icon?: string;
    author?: string;
    /** What the project is for, as far as the site says */
    kinds: AddonKind[];
    /** Mod/plugin loaders listed by the source (when provided, e.g. Modrinth) */
    loaders?: string[];
    /** Whether the manager can download it (some Spigot resources and CurseForge files are not offered for download) */
    downloadable: boolean;
    /** The site confirmed that the project exists */
    verified: boolean;
    note?: string;
}

export const SOURCE_LABEL: Record<AddonSource, string> = {
    modrinth: 'Modrinth', spigot: 'SpigotMC', bukkit: 'Bukkit', curseforge: 'CurseForge', other: 'Direct link',
};

const curseForgeKey = () => process.env.CURSEFORGE_API_KEY?.trim() || '';

/** Works out where a pasted link points. Returns null for text that is not a link */
export function identifyLink(input: string): LinkRef | null {
    let url: URL;
    try {
        url = new URL(input.trim().match(/^https?:\/\//i) ? input.trim() : `https://${input.trim()}`);
    } catch {
        return null;
    }
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);

    if (host === 'modrinth.com' && parts.length >= 2 && ['mod', 'plugin', 'datapack', 'modpack', 'resourcepack', 'shader'].includes(parts[0])) {
        return { source: 'modrinth', ref: parts[1].toLowerCase(), url: `https://modrinth.com/${parts[0]}/${parts[1]}` };
    }
    if (host === 'spigotmc.org' && parts[0] === 'resources' && parts[1]) {
        const id = parts[1].match(/(\d+)$/)?.[1];
        if (id) return { source: 'spigot', ref: id, url: `https://www.spigotmc.org/resources/${parts[1]}/` };
    }
    if (host === 'dev.bukkit.org' && parts[0] === 'projects' && parts[1]) {
        return { source: 'bukkit', ref: parts[1].toLowerCase(), url: `https://dev.bukkit.org/projects/${parts[1]}` };
    }
    if (host === 'curseforge.com' && parts[0] === 'minecraft' && parts[1] && parts[2]) {
        return { source: 'curseforge', ref: parts[2].toLowerCase(), url: `https://www.curseforge.com/minecraft/${parts[1]}/${parts[2]}` };
    }
    return { source: 'other', ref: url.toString(), url: url.toString() };
}

/** Modrinth loader names that fit a server type, for plugins or mods */
export function loadersFor(typeId: string | undefined | null, kind: AddonKind, detectedLoader?: string | null): string[] {
    const id = getServerType(typeId)?.id ?? '';
    if (kind === 'plugin') return ['paper', 'spigot', 'bukkit', 'purpur', 'folia'];
    if (['forge', 'mohist', 'magma', 'magma_maintained', 'ketting', 'crucible'].includes(id)) return ['forge'];
    if (['neoforge', 'youer'].includes(id)) return ['neoforge'];
    if (['fabric', 'banner'].includes(id)) return ['fabric'];
    if (id === 'quilt') return ['quilt', 'fabric'];
    if (id === 'arclight') return ['forge', 'neoforge', 'fabric'];
    if (detectedLoader) return detectedLoader === 'quilt' ? ['quilt', 'fabric'] : [detectedLoader];
    return [];
}

const BUKKIT_LOADERS = ['paper', 'spigot', 'bukkit', 'purpur', 'folia', 'sponge'];
const MOD_LOADERS = ['fabric', 'forge', 'neoforge', 'quilt', 'liteloader', 'rift'];

// ------------------------------------------------------------------------------------------------ lookup

interface ModrinthProject {
    id: string; slug: string; title: string; description: string; icon_url?: string | null; project_type: string; loaders?: string[]; team?: string;
}

async function lookupModrinth(link: LinkRef): Promise<AddonLookup> {
    const project = await fetchJson<ModrinthProject>(`https://api.modrinth.com/v2/project/${encodeURIComponent(link.ref)}`);
    const loaders = project.loaders ?? [];
    const kinds: AddonKind[] = [];
    if (loaders.some(loader => BUKKIT_LOADERS.includes(loader)) || project.project_type === 'plugin') kinds.push('plugin');
    if (loaders.some(loader => MOD_LOADERS.includes(loader)) || project.project_type === 'mod') kinds.push('mod');
    const downloadable = ['mod', 'plugin'].includes(project.project_type);
    return {
        source: 'modrinth', ref: project.slug, url: link.url, name: project.title, description: project.description, icon: project.icon_url ?? undefined,
        kinds: kinds.length > 0 ? kinds : ['mod'], loaders, downloadable, verified: true,
        note: downloadable ? undefined : `This is a ${project.project_type}, not a plugin or a mod.`,
    };
}

interface SpigetResource {
    id: number; name: string; tag?: string; premium?: boolean; external?: boolean; file?: { type?: string };
    icon?: { url?: string }; author?: { id: number };
}

async function lookupSpigot(link: LinkRef): Promise<AddonLookup> {
    const resource = await fetchJson<SpigetResource>(`https://api.spiget.org/v2/resources/${link.ref}`);
    const external = resource.external === true || resource.file?.type === 'external';
    const blocked = resource.premium === true || external;
    return {
        source: 'spigot', ref: String(resource.id), url: link.url, name: resource.name, description: resource.tag,
        icon: resource.icon?.url ? `https://api.spiget.org/v2/resources/${resource.id}/icon` : undefined,
        kinds: ['plugin'], downloadable: !blocked, verified: true,
        note: resource.premium ? 'This is a paid resource, it has to be downloaded from SpigotMC and uploaded here.' : external ? 'The author hosts the download on another site, upload the file here instead.' : undefined,
    };
}

function metaTag(html: string, property: string): string | undefined {
    const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
    return match?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() || undefined;
}

/** Reads the title, description and logo of a page from its Open Graph tags */
async function lookupPage(link: LinkRef, source: 'bukkit' | 'curseforge', kinds: AddonKind[]): Promise<AddonLookup> {
    const fallbackName = link.ref.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
    try {
        const { response } = await safeFetch(link.url, { headers: { Accept: 'text/html' } }, 15_000);
        if (response.status === 404) throw new Error('This project does not exist.');
        if (response.ok) {
            const html = (await response.text()).slice(0, 400_000);
            const title = metaTag(html, 'og:title')?.replace(/\s*[-|–]\s*(Bukkit Plugins|Minecraft Mods|Minecraft Bukkit Plugins|Projects|CurseForge).*$/i, '');
            if (title) return { source, ref: link.ref, url: link.url, name: title, description: metaTag(html, 'og:description'), icon: metaTag(html, 'og:image'), kinds, downloadable: true, verified: true };
        }
    } catch (error) {
        if (error instanceof Error && /does not exist/.test(error.message)) throw error;
    }
    return { source, ref: link.ref, url: link.url, name: fallbackName, kinds, downloadable: true, verified: false, note: 'The page could not be read, so the name comes from the link.' };
}

interface CurseForgeMod { id: number; name: string; summary: string; slug: string; logo?: { url?: string }; classId?: number; allowModDistribution?: boolean | null; authors?: Array<{ name: string }> }

async function lookupCurseForge(link: LinkRef): Promise<AddonLookup> {
    const kinds: AddonKind[] = link.url.includes('/bukkit-plugins/') ? ['plugin'] : ['mod'];
    const key = curseForgeKey();
    if (!key) {
        const page = await lookupPage(link, 'curseforge', kinds);
        return { ...page, downloadable: false, note: 'CurseForge downloads need an API key (CURSEFORGE_API_KEY) set by an administrator. You can upload the file instead.' };
    }
    const found = await fetchJson<{ data: CurseForgeMod[] }>(`https://api.curseforge.com/v1/mods/search?gameId=432&slug=${encodeURIComponent(link.ref)}`, { 'x-api-key': key });
    const mod = found.data.find(entry => entry.slug === link.ref) ?? found.data[0];
    if (!mod) throw new Error('This project does not exist on CurseForge.');
    return {
        source: 'curseforge', ref: String(mod.id), url: link.url, name: mod.name, description: mod.summary, icon: mod.logo?.url, author: mod.authors?.[0]?.name,
        kinds: mod.classId === 5 ? ['plugin'] : kinds, downloadable: mod.allowModDistribution !== false, verified: true,
        note: mod.allowModDistribution === false ? 'The author does not allow downloads through other tools. Upload the file instead.' : undefined,
    };
}

/** Name of a file from a direct link, as a title */
function nameFromUrl(url: string): string {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'download');
    return last.replace(/\.jar$/i, '').replace(/[-_]+/g, ' ').trim() || 'Download';
}

export async function lookupAddon(link: LinkRef): Promise<AddonLookup> {
    switch (link.source) {
        case 'modrinth': return lookupModrinth(link);
        case 'spigot': return lookupSpigot(link);
        case 'bukkit': return lookupPage(link, 'bukkit', ['plugin']);
        case 'curseforge': return lookupCurseForge(link);
        default: return { source: 'other', ref: link.ref, url: link.url, name: nameFromUrl(link.url), kinds: [], downloadable: true, verified: false };
    }
}

// ------------------------------------------------------------------------------------------------ download

export interface ResolvedDownload {
    url: string;
    filename: string;
    /** Changes with every release, to tell whether something newer exists */
    versionId: string;
    version?: string;
    headers?: Record<string, string>;
}

export interface ResolveContext {
    kind: AddonKind;
    /** Modrinth loader names that fit the server */
    loaders: string[];
    /** Minecraft version of the server. LATEST and similar mean any */
    mcVersion?: string;
    /** Pin resolution to a specific remote version/file id instead of newest */
    versionId?: string;
    /** When true for mods, allows picking an incompatible version selected manually in UI */
    allowIncompatibleVersion?: boolean;
}

export interface AddonVersionOption {
    versionId: string;
    version: string;
    name?: string;
    releaseType?: 'release' | 'beta' | 'alpha';
    publishedAt?: string;
    gameVersions?: string[];
    loaders?: string[];
    filename?: string;
    downloadable: boolean;
    compatible: boolean;
    compatibilityNote?: string;
}

export interface MatchedSource {
    source: AddonSource;
    ref: string;
    url: string;
    name: string;
    description?: string;
    icon?: string;
    author?: string;
    downloadable: boolean;
    exactHashMatch?: boolean;
    kinds: AddonKind[];
    loaders?: string[];
    note?: string;
}

interface ModrinthVersion {
    id: string;
    project_id?: string;
    name?: string;
    version_number: string;
    version_type?: 'release' | 'beta' | 'alpha';
    date_published: string;
    game_versions?: string[];
    loaders?: string[];
    files: Array<{ url: string; filename: string; primary?: boolean }>;
}

/** Normalizes `1.21.0` -> `1.21` while keeping distinct patch/minor versions (`1.21.1` vs `1.21.4`) exact. */
export function normalizeMcVersionTag(version: string): string {
    const trimmed = version.trim().toLowerCase();
    const threePartZero = /^(\d+\.\d+)\.0$/.exec(trimmed);
    return threePartZero ? threePartZero[1] : trimmed;
}

/** True when `candidateVersions` contains an exact (1-to-1) match for the server's concrete Minecraft version. */
export function isExactMcVersionMatch(serverVersion: string, candidateVersions: string[] = []): boolean {
    const target = normalizeMcVersionTag(serverVersion);
    return candidateVersions.some(candidate => normalizeMcVersionTag(candidate) === target);
}

/**
 * Evaluates whether a specific addon release works on the server.
 * Mods require strict 1-to-1 Minecraft version and loader matching; plugins have broader Bukkit API compatibility.
 */
export function evaluateVersionCompatibility(
    version: { gameVersions?: string[]; loaders?: string[] },
    context: Pick<ResolveContext, 'kind' | 'loaders' | 'mcVersion'>
): { compatible: boolean; note?: string } {
    const loaders = (version.loaders ?? []).map(l => l.toLowerCase());
    const gameVersions = version.gameVersions ?? [];
    const expectedLoaders = context.loaders.map(l => l.toLowerCase());
    const hasConcreteMc = Boolean(
        context.mcVersion && !isFloatingVersion(context.mcVersion) && compareMinecraftVersions(context.mcVersion, '1.0') > 0
    );

    if (context.kind === 'mod') {
        if (loaders.length > 0 && expectedLoaders.length > 0 && !loaders.some(l => expectedLoaders.includes(l))) {
            return {
                compatible: false,
                note: `Targets ${loaders.join('/')} (server uses ${expectedLoaders.join('/')})`,
            };
        }
        if (hasConcreteMc && context.mcVersion) {
            if (gameVersions.length === 0) {
                return { compatible: false, note: `Does not specify Minecraft ${context.mcVersion}` };
            }
            if (!isExactMcVersionMatch(context.mcVersion, gameVersions)) {
                const listed = gameVersions.slice(-4).join(', ');
                return {
                    compatible: false,
                    note: `Made for Minecraft ${listed} (server runs ${context.mcVersion})`,
                };
            }
        }
        return { compatible: true };
    }

    // Plugins (Bukkit/Spigot/Paper/Purpur/Folia) generally retain cross-version compatibility
    if (loaders.length > 0 && expectedLoaders.length > 0 && !loaders.some(l => expectedLoaders.includes(l))) {
        return {
            compatible: false,
            note: `Built for ${loaders.join('/')} (not a ${expectedLoaders.join('/')} plugin build)`,
        };
    }
    if (hasConcreteMc && context.mcVersion && gameVersions.length > 0 && !isExactMcVersionMatch(context.mcVersion, gameVersions)) {
        return {
            compatible: true,
            note: `Tagged for ${gameVersions.slice(-3).join(', ')} (usually compatible on ${context.mcVersion})`,
        };
    }
    return { compatible: true };
}

function modrinthFileOf(version: ModrinthVersion | undefined) {
    return version?.files.find(candidate => candidate.primary) ?? version?.files[0];
}

async function resolveModrinth(link: LinkRef, context: ResolveContext): Promise<ResolvedDownload> {
    if (context.versionId) {
        const chosen = await fetchJson<ModrinthVersion>(`https://api.modrinth.com/v2/version/${encodeURIComponent(context.versionId)}`);
        const file = modrinthFileOf(chosen);
        if (!file) throw new Error('The selected Modrinth version has no downloadable file.');
        if (context.kind === 'mod' && !context.allowIncompatibleVersion) {
            const check = evaluateVersionCompatibility(
                { gameVersions: chosen.game_versions, loaders: chosen.loaders },
                context
            );
            if (!check.compatible) {
                throw new Error(check.note ?? 'The selected mod version does not match this server version or loader.');
            }
        }
        return { url: file.url, filename: file.filename, versionId: chosen.id, version: chosen.version_number };
    }

    const loaders = encodeURIComponent(JSON.stringify(context.loaders));
    const hasConcreteMc = Boolean(
        context.mcVersion && !isFloatingVersion(context.mcVersion) && compareMinecraftVersions(context.mcVersion, '1.0') > 0
    );

    // Mods require strict 1-to-1 Minecraft version matching; plugins can fall back across Bukkit versions.
    const attempts = hasConcreteMc
        ? (context.kind === 'mod'
            ? [`&game_versions=${encodeURIComponent(JSON.stringify([context.mcVersion]))}`]
            : [`&game_versions=${encodeURIComponent(JSON.stringify([context.mcVersion]))}`, ''])
        : [''];

    for (const filter of attempts) {
        const versions = await fetchJson<ModrinthVersion[]>(`https://api.modrinth.com/v2/project/${encodeURIComponent(link.ref)}/version?loaders=${loaders}${filter}`);
        const candidate = context.kind === 'mod' && hasConcreteMc && context.mcVersion
            ? versions.find(v => isExactMcVersionMatch(context.mcVersion as string, v.game_versions ?? []))
            : versions[0];
        const file = modrinthFileOf(candidate);
        if (candidate && file) {
            return { url: file.url, filename: file.filename, versionId: candidate.id, version: candidate.version_number };
        }
    }
    throw new Error(`No release of this ${context.kind} works with ${context.loaders.join('/')}${hasConcreteMc ? ` on ${context.mcVersion}` : ''}.`);
}

async function resolveSpigot(link: LinkRef, context: ResolveContext): Promise<ResolvedDownload> {
    if (context.versionId) {
        const chosen = await fetchJson<{ id: number; name?: string }>(
            `https://api.spiget.org/v2/resources/${encodeURIComponent(link.ref)}/versions/${encodeURIComponent(context.versionId)}`
        ).catch(() => ({ id: Number(context.versionId), name: undefined }));
        return {
            url: `https://api.spiget.org/v2/resources/${link.ref}/versions/${encodeURIComponent(context.versionId)}/download`,
            filename: `spigot-${link.ref}.jar`,
            versionId: String(chosen.id || context.versionId),
            version: chosen.name,
        };
    }
    const latest = await fetchJson<{ id: number; name?: string }>(`https://api.spiget.org/v2/resources/${link.ref}/versions/latest`);
    return { url: `https://api.spiget.org/v2/resources/${link.ref}/download`, filename: `spigot-${link.ref}.jar`, versionId: String(latest.id), version: latest.name };
}

async function resolveBukkit(link: LinkRef): Promise<ResolvedDownload> {
    // /files/latest redirects to the newest file; the redirect target carries the file id
    const { response, finalUrl } = await safeFetch(`https://dev.bukkit.org/projects/${link.ref}/files/latest`, { method: 'GET' }, 20_000);
    await response.body?.cancel().catch(() => undefined);
    const id = finalUrl.match(/\/files\/(\d+)/)?.[1];
    if (!response.ok && !id) throw new Error('No download was found on the Bukkit page.');
    return { url: finalUrl, filename: `${link.ref}.jar`, versionId: id ?? finalUrl };
}

interface CurseForgeFile {
    id: number;
    fileName: string;
    displayName: string;
    downloadUrl: string | null;
    fileDate: string;
    releaseType?: number;
    gameVersions?: string[];
}

async function resolveCurseForge(link: LinkRef, context: ResolveContext): Promise<ResolvedDownload> {
    const key = curseForgeKey();
    if (!key) throw new Error('CurseForge downloads need an API key (CURSEFORGE_API_KEY).');

    if (context.versionId) {
        const res = await fetchJson<{ data: CurseForgeFile }>(
            `https://api.curseforge.com/v1/mods/${link.ref}/files/${encodeURIComponent(context.versionId)}`,
            { 'x-api-key': key }
        );
        const file = res.data;
        if (!file?.downloadUrl) throw new Error('CurseForge has no downloadable file for this version.');
        if (context.kind === 'mod' && !context.allowIncompatibleVersion) {
            const check = evaluateVersionCompatibility(
                { gameVersions: file.gameVersions },
                { kind: 'mod', loaders: context.loaders, mcVersion: context.mcVersion }
            );
            if (!check.compatible) {
                throw new Error(check.note ?? 'The selected mod file does not match this server Minecraft version.');
            }
        }
        return { url: file.downloadUrl, filename: file.fileName, versionId: String(file.id), version: file.displayName };
    }

    const loaderType: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
    const params = new URLSearchParams({ pageSize: '25' });
    const hasConcreteMc = Boolean(
        context.mcVersion && !isFloatingVersion(context.mcVersion) && compareMinecraftVersions(context.mcVersion, '1.0') > 0
    );
    if (hasConcreteMc && context.mcVersion) params.set('gameVersion', context.mcVersion);
    const wanted = context.kind === 'mod' ? loaderType[context.loaders[0]] : undefined;
    if (wanted) params.set('modLoaderType', String(wanted));

    const files = await fetchJson<{ data: CurseForgeFile[] }>(
        `https://api.curseforge.com/v1/mods/${link.ref}/files?${params}`,
        { 'x-api-key': key }
    );

    const candidates = files.data
        .filter(file => {
            if (!file.downloadUrl) return false;
            if (context.kind === 'mod' && hasConcreteMc && context.mcVersion) {
                return isExactMcVersionMatch(context.mcVersion, file.gameVersions ?? []);
            }
            return true;
        })
        .sort((a, b) => b.fileDate.localeCompare(a.fileDate));

    const newest = candidates[0];
    if (!newest?.downloadUrl) throw new Error('CurseForge has no downloadable file for this server. Upload the file instead.');
    return { url: newest.downloadUrl, filename: newest.fileName, versionId: String(newest.id), version: newest.displayName };
}

export async function resolveDownload(link: LinkRef, context: ResolveContext): Promise<ResolvedDownload> {
    switch (link.source) {
        case 'modrinth': return resolveModrinth(link, context);
        case 'spigot': return resolveSpigot(link, context);
        case 'bukkit': return resolveBukkit(link);
        case 'curseforge': return resolveCurseForge(link, context);
        default: return { url: link.url, filename: nameFromUrl(link.url).replace(/\s+/g, '-') + '.jar', versionId: 'direct' };
    }
}

/** Lists selectable versions for an addon on Modrinth, SpigotMC, or CurseForge with compatibility metadata. */
export async function listAddonVersions(
    link: LinkRef,
    context: Pick<ResolveContext, 'kind' | 'loaders' | 'mcVersion'>
): Promise<AddonVersionOption[]> {
    if (link.source === 'modrinth') {
        const versions = await fetchJson<ModrinthVersion[]>(
            `https://api.modrinth.com/v2/project/${encodeURIComponent(link.ref)}/version`
        );
        return versions.map(v => {
            const file = modrinthFileOf(v);
            const compat = evaluateVersionCompatibility(
                { gameVersions: v.game_versions, loaders: v.loaders },
                context
            );
            return {
                versionId: v.id,
                version: v.version_number,
                name: v.name && v.name !== v.version_number ? v.name : undefined,
                releaseType: v.version_type,
                publishedAt: v.date_published,
                gameVersions: v.game_versions,
                loaders: v.loaders,
                filename: file?.filename,
                downloadable: Boolean(file?.url),
                compatible: compat.compatible,
                compatibilityNote: compat.note,
            };
        });
    }

    if (link.source === 'spigot') {
        const [resource, versions] = await Promise.all([
            fetchJson<SpigetResource>(`https://api.spiget.org/v2/resources/${encodeURIComponent(link.ref)}`).catch(() => null),
            fetchJson<Array<{ id: number; name?: string; releaseDate?: number }>>(
                `https://api.spiget.org/v2/resources/${encodeURIComponent(link.ref)}/versions?size=50&sort=-releaseDate`
            ),
        ]);
        const blocked = resource ? (resource.premium === true || resource.external === true || resource.file?.type === 'external') : false;
        const compat = context.kind === 'plugin'
            ? { compatible: true }
            : { compatible: false, note: 'SpigotMC hosts plugins, not mods' };
        return versions.map(v => ({
            versionId: String(v.id),
            version: v.name || String(v.id),
            publishedAt: v.releaseDate ? new Date(v.releaseDate * 1000).toISOString() : undefined,
            downloadable: !blocked,
            compatible: compat.compatible,
            compatibilityNote: blocked ? 'External/paid SpigotMC download' : compat.note,
        }));
    }

    if (link.source === 'curseforge') {
        const key = curseForgeKey();
        if (!key) return [];
        const files = await fetchJson<{ data: CurseForgeFile[] }>(
            `https://api.curseforge.com/v1/mods/${encodeURIComponent(link.ref)}/files?pageSize=50`,
            { 'x-api-key': key }
        );
        const releaseMap: Record<number, 'release' | 'beta' | 'alpha'> = { 1: 'release', 2: 'beta', 3: 'alpha' };
        return files.data
            .sort((a, b) => b.fileDate.localeCompare(a.fileDate))
            .map(file => {
                const mcTags = (file.gameVersions ?? []).filter(v => /^\d+\.\d+/.test(v));
                const loaderTags = (file.gameVersions ?? [])
                    .map(v => v.toLowerCase())
                    .filter(v => [...MOD_LOADERS, ...BUKKIT_LOADERS].includes(v));
                const compat = evaluateVersionCompatibility(
                    { gameVersions: mcTags, loaders: loaderTags.length > 0 ? loaderTags : undefined },
                    context
                );
                return {
                    versionId: String(file.id),
                    version: file.displayName || file.fileName,
                    releaseType: file.releaseType ? releaseMap[file.releaseType] : undefined,
                    publishedAt: file.fileDate,
                    gameVersions: mcTags,
                    loaders: loaderTags,
                    filename: file.fileName,
                    downloadable: Boolean(file.downloadUrl),
                    compatible: compat.compatible,
                    compatibilityNote: compat.note,
                };
            });
    }

    return [];
}

// ------------------------------------------------------------------------------------------------ discovery & source matching

function normalizeAddonName(input: string): string {
    return input
        .toLowerCase()
        .replace(/\.jar$/i, '')
        .replace(/[-_ ](?:v?\d+\.\d+[^]*|bukkit|spigot|paper|purpur|folia|fabric|forge|neoforge|quilt|bungee|velocity|universal|mc\d[\d.]*)$/i, '')
        .replace(/[^a-z0-9]/g, '');
}

/** Extracts clean candidate query strings for searching remote repositories by jar descriptor or filename. */
export function buildSearchQueries(input: { name?: string; id?: string; filename: string }): string[] {
    const stem = input.filename
        .replace(/\.jar$/i, '')
        .replace(/[-_ ]+(?:v?\d+(?:\.\d+)+.*|bukkit|spigot|paper|purpur|folia|fabric|forge|neoforge|quilt|mc\d[\d.]*)$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
    const candidates = [input.name?.trim(), input.id?.trim(), stem].filter((v): v is string => Boolean(v && v.length >= 2));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of candidates) {
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function namesMatchStrongly(queryNorms: Set<string>, candidateTitle: string, candidateSlug?: string): boolean {
    const titleNorm = normalizeAddonName(candidateTitle);
    const slugNorm = candidateSlug ? normalizeAddonName(candidateSlug) : '';
    for (const q of queryNorms) {
        if (!q || q.length < 3) continue;
        if (titleNorm === q || slugNorm === q) return true;
    }
    return false;
}

export interface HashMatchInfo {
    matchedSource: MatchedSource;
    versionId: string;
    version?: string;
}

/** Batch matches jar SHA-512 hashes against Modrinth's file hash index in two API calls. */
export async function matchModrinthHashes(hashes: string[]): Promise<Record<string, HashMatchInfo>> {
    const unique = [...new Set(hashes.filter(Boolean))];
    if (unique.length === 0) return {};

    let byHash: Record<string, ModrinthVersion>;
    try {
        const { response } = await safeFetch(
            'https://api.modrinth.com/v2/version_files',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ hashes: unique, algorithm: 'sha512' }),
            },
            20_000
        );
        if (!response.ok) return {};
        byHash = (await response.json()) as Record<string, ModrinthVersion>;
    } catch {
        return {};
    }

    const projectIds = [...new Set(Object.values(byHash).map(v => v.project_id).filter((id): id is string => Boolean(id)))];
    if (projectIds.length === 0) return {};

    const projectsById = new Map<string, ModrinthProject>();
    try {
        const projects = await fetchJson<ModrinthProject[]>(
            `https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`
        );
        for (const p of projects) projectsById.set(p.id, p);
    } catch {
        return {};
    }

    const out: Record<string, HashMatchInfo> = {};
    for (const [hash, ver] of Object.entries(byHash)) {
        if (!ver.project_id) continue;
        const proj = projectsById.get(ver.project_id);
        if (!proj) continue;
        const loaders = proj.loaders ?? [];
        const kinds: AddonKind[] = [];
        if (loaders.some(l => BUKKIT_LOADERS.includes(l)) || proj.project_type === 'plugin') kinds.push('plugin');
        if (loaders.some(l => MOD_LOADERS.includes(l)) || proj.project_type === 'mod') kinds.push('mod');
        const downloadable = ['mod', 'plugin'].includes(proj.project_type);
        const typePath = proj.project_type === 'plugin' ? 'plugin' : 'mod';
        out[hash] = {
            versionId: ver.id,
            version: ver.version_number,
            matchedSource: {
                source: 'modrinth',
                ref: proj.slug,
                url: `https://modrinth.com/${typePath}/${proj.slug}`,
                name: proj.title,
                description: proj.description,
                icon: proj.icon_url ?? undefined,
                downloadable,
                exactHashMatch: true,
                kinds: kinds.length > 0 ? kinds : ['mod'],
                loaders,
            },
        };
    }
    return out;
}

interface ModrinthSearchResponse {
    hits: Array<{
        slug: string;
        title: string;
        description?: string;
        icon_url?: string | null;
        author?: string;
        project_type: string;
        categories?: string[];
        downloads?: number;
    }>;
}

/** Searches Modrinth, SpigotMC (plugins), and CurseForge (if configured) to find matching known sources for a local jar. */
export async function findMatchingSources(input: {
    name?: string;
    id?: string;
    filename: string;
    kind: AddonKind;
    loaders?: string[];
    exactModrinth?: MatchedSource;
}): Promise<MatchedSource[]> {
    const queries = buildSearchQueries(input);
    const queryNorms = new Set(queries.map(normalizeAddonName).filter(Boolean));
    const primaryQuery = queries[0];
    if (!primaryQuery) return input.exactModrinth ? [input.exactModrinth] : [];

    const results: MatchedSource[] = [];
    const seen = new Set<string>();
    const addUnique = (item: MatchedSource) => {
        const key = `${item.source}:${item.ref.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push(item);
    };

    if (input.exactModrinth) addUnique(input.exactModrinth);

    const modrinthSearch = async (): Promise<void> => {
        const facets = encodeURIComponent(JSON.stringify([['project_type:plugin', 'project_type:mod']]));
        const res = await fetchJson<ModrinthSearchResponse>(
            `https://api.modrinth.com/v2/search?query=${encodeURIComponent(primaryQuery)}&limit=8&facets=${facets}`
        );
        for (const hit of res.hits ?? []) {
            if (!namesMatchStrongly(queryNorms, hit.title, hit.slug)) continue;
            const cats = (hit.categories ?? []).map(c => c.toLowerCase());
            const loaders = cats.filter(c => BUKKIT_LOADERS.includes(c) || MOD_LOADERS.includes(c));
            const kinds: AddonKind[] = [];
            if (loaders.some(l => BUKKIT_LOADERS.includes(l)) || hit.project_type === 'plugin') kinds.push('plugin');
            if (loaders.some(l => MOD_LOADERS.includes(l)) || hit.project_type === 'mod') kinds.push('mod');
            const effectiveKinds: AddonKind[] = kinds.length > 0 ? kinds : [hit.project_type === 'plugin' ? 'plugin' : 'mod'];
            if (!effectiveKinds.includes(input.kind)) continue;
            if (input.kind === 'mod' && input.loaders?.length && loaders.length > 0) {
                if (!loaders.some(l => input.loaders!.includes(l))) continue;
            }
            const typePath = hit.project_type === 'plugin' ? 'plugin' : 'mod';
            addUnique({
                source: 'modrinth',
                ref: hit.slug,
                url: `https://modrinth.com/${typePath}/${hit.slug}`,
                name: hit.title,
                description: hit.description,
                icon: hit.icon_url ?? undefined,
                author: hit.author,
                downloadable: true,
                kinds: effectiveKinds,
                loaders,
            });
        }
    };

    const spigotSearch = async (): Promise<void> => {
        if (input.kind !== 'plugin') return;
        const hits = await fetchJson<SpigetResource[]>(
            `https://api.spiget.org/v2/search/resources/${encodeURIComponent(primaryQuery)}?size=8&field=name&sort=-downloads`
        );
        for (const res of hits ?? []) {
            if (!namesMatchStrongly(queryNorms, res.name)) continue;
            const external = res.external === true || res.file?.type === 'external';
            const blocked = res.premium === true || external;
            addUnique({
                source: 'spigot',
                ref: String(res.id),
                url: `https://www.spigotmc.org/resources/${res.id}/`,
                name: res.name,
                description: res.tag,
                icon: res.icon?.url ? `https://api.spiget.org/v2/resources/${res.id}/icon` : undefined,
                downloadable: !blocked,
                kinds: ['plugin'],
                note: res.premium
                    ? 'Paid resource on SpigotMC (cannot download automatically)'
                    : external
                        ? 'External download on SpigotMC (cannot download automatically)'
                        : undefined,
            });
        }
    };

    const curseForgeSearch = async (): Promise<void> => {
        const key = curseForgeKey();
        if (!key) return;
        const classId = input.kind === 'plugin' ? 5 : 6;
        const found = await fetchJson<{ data: CurseForgeMod[] }>(
            `https://api.curseforge.com/v1/mods/search?gameId=432&classId=${classId}&searchFilter=${encodeURIComponent(primaryQuery)}&pageSize=8`,
            { 'x-api-key': key }
        );
        for (const mod of found.data ?? []) {
            if (!namesMatchStrongly(queryNorms, mod.name, mod.slug)) continue;
            const categoryPath = input.kind === 'plugin' ? 'bukkit-plugins' : 'mc-mods';
            addUnique({
                source: 'curseforge',
                ref: String(mod.id),
                url: `https://www.curseforge.com/minecraft/${categoryPath}/${mod.slug}`,
                name: mod.name,
                description: mod.summary,
                icon: mod.logo?.url,
                author: mod.authors?.[0]?.name,
                downloadable: mod.allowModDistribution !== false,
                kinds: [input.kind],
                note: mod.allowModDistribution === false ? 'Author disables automated downloads on CurseForge' : undefined,
            });
        }
    };

    await Promise.allSettled([modrinthSearch(), spigotSearch(), curseForgeSearch()]);

    // Order exact hash match & downloadable sources ahead of external/non-downloadable ones
    return results.sort((a, b) => {
        if (Boolean(a.exactHashMatch) !== Boolean(b.exactHashMatch)) return a.exactHashMatch ? -1 : 1;
        if (a.downloadable !== b.downloadable) return a.downloadable ? -1 : 1;
        return 0;
    });
}
