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
}

interface ModrinthVersion { id: string; version_number: string; date_published: string; files: Array<{ url: string; filename: string; primary?: boolean }> }

async function resolveModrinth(link: LinkRef, context: ResolveContext): Promise<ResolvedDownload> {
    const loaders = encodeURIComponent(JSON.stringify(context.loaders));
    const attempts = context.mcVersion && !isFloatingVersion(context.mcVersion) && compareMinecraftVersions(context.mcVersion, '1.0') > 0
        ? [`&game_versions=${encodeURIComponent(JSON.stringify([context.mcVersion]))}`, ''] : [''];
    for (const filter of attempts) {
        const versions = await fetchJson<ModrinthVersion[]>(`https://api.modrinth.com/v2/project/${encodeURIComponent(link.ref)}/version?loaders=${loaders}${filter}`);
        const best = versions[0];
        const file = best?.files.find(candidate => candidate.primary) ?? best?.files[0];
        if (best && file) {
            if (filter === '' && attempts.length > 1) {
                // No release for this exact version: the newest one is used, the caller shows the version it got
            }
            return { url: file.url, filename: file.filename, versionId: best.id, version: best.version_number };
        }
    }
    throw new Error(`No release of this project works with ${context.loaders.join('/')}${context.mcVersion && !isFloatingVersion(context.mcVersion) ? ` on ${context.mcVersion}` : ''}.`);
}

async function resolveSpigot(link: LinkRef): Promise<ResolvedDownload> {
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

async function resolveCurseForge(link: LinkRef, context: ResolveContext): Promise<ResolvedDownload> {
    const key = curseForgeKey();
    if (!key) throw new Error('CurseForge downloads need an API key (CURSEFORGE_API_KEY).');
    const loaderType: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
    const params = new URLSearchParams({ pageSize: '10' });
    if (context.mcVersion && !isFloatingVersion(context.mcVersion)) params.set('gameVersion', context.mcVersion);
    const wanted = context.kind === 'mod' ? loaderType[context.loaders[0]] : undefined;
    if (wanted) params.set('modLoaderType', String(wanted));
    const files = await fetchJson<{ data: Array<{ id: number; fileName: string; displayName: string; downloadUrl: string | null; fileDate: string }> }>(
        `https://api.curseforge.com/v1/mods/${link.ref}/files?${params}`, { 'x-api-key': key });
    const newest = files.data.filter(file => file.downloadUrl).sort((a, b) => b.fileDate.localeCompare(a.fileDate))[0];
    if (!newest?.downloadUrl) throw new Error('CurseForge has no downloadable file for this server. Upload the file instead.');
    return { url: newest.downloadUrl, filename: newest.fileName, versionId: String(newest.id), version: newest.displayName };
}

export async function resolveDownload(link: LinkRef, context: ResolveContext): Promise<ResolvedDownload> {
    switch (link.source) {
        case 'modrinth': return resolveModrinth(link, context);
        case 'spigot': return resolveSpigot(link);
        case 'bukkit': return resolveBukkit(link);
        case 'curseforge': return resolveCurseForge(link, context);
        default: return { url: link.url, filename: nameFromUrl(link.url).replace(/\s+/g, '-') + '.jar', versionId: 'direct' };
    }
}
