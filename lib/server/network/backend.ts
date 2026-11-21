/**
 * Sets up a game server for the proxy it sits behind: server.properties, spigot.yml, Paper's config and the
 * plugins that make forwarding or older clients work.
 *
 * Players have to be identified by the proxy, so the server itself must not check accounts (online-mode=false)
 * and must trust the forwarded identity. For modern forwarding that trust is a shared secret, for BungeeGuard a
 * token, for legacy forwarding nothing at all, which is why legacy servers must not be reachable directly.
 */
import YAML from 'yaml';
import serverStorage from '@/lib/server/storage';
import { compareMinecraftVersions } from '@/lib/data/itzg/versions';
import { isPluginServer, type ForwardingMode } from './versions';
import type { PluginFlags } from './parse';

export interface BackendSettings {
    folder: string;
    forwarding: ForwardingMode;
    /** Shared secret of modern forwarding */
    secret?: string;
    /** BungeeGuard tokens, one per proxy that may send players here */
    tokens?: string[];
    version?: string;
    type?: string;
}

async function readText(filePath: string): Promise<string | null> {
    try {
        if (!(await serverStorage.exists(filePath))) return null;
        return (await serverStorage.getFileContents(filePath)).toString('utf-8');
    } catch {
        return null;
    }
}

/** Sets or adds `key=value` lines of server.properties, keeping the rest of the file as it is */
export function setProperties(content: string, values: Record<string, string>): string {
    const lines = content.split(/\r?\n/);
    const pending = new Map(Object.entries(values));
    const next = lines.map(line => {
        const match = line.match(/^\s*([^#=\s][^=]*?)\s*=/);
        if (match && pending.has(match[1])) {
            const value = pending.get(match[1]) as string;
            pending.delete(match[1]);
            return `${match[1]}=${value}`;
        }
        return line;
    });
    while (next.length > 0 && next[next.length - 1] === '') next.pop();
    for (const [key, value] of pending) next.push(`${key}=${value}`);
    return `${next.join('\n')}\n`;
}

function editYaml(content: string, changes: Array<[string[], unknown]>): string {
    const doc = YAML.parseDocument(content);
    for (const [path, value] of changes) doc.setIn(path, value);
    return doc.toString();
}

/**
 * Writes the proxy settings into the server's files. Files that do not exist yet (the server has never run) are
 * skipped and reported: they are created at the first start, and the setup is applied again then.
 */
export async function applyBackendForwarding(settings: BackendSettings): Promise<{ details: string[]; missing: string[]; restartNeeded: boolean }> {
    const { folder, forwarding, secret } = settings;
    const details: string[] = [];
    const missing: string[] = [];
    let changed = false;

    // server.properties: the proxy checks the accounts, not the server
    if (forwarding !== 'none') {
        const path = `${folder}/server.properties`;
        const content = await readText(path);
        if (content === null) {
            missing.push('server.properties');
        } else {
            const next = setProperties(content, { 'online-mode': 'false', 'prevent-proxy-connections': 'false', 'enforce-secure-profile': 'false' });
            if (next !== content) {
                await serverStorage.uploadFile(path, next, true);
                changed = true;
            }
            details.push('server.properties: online-mode off, the proxy checks accounts');
        }
    }

    const modern = forwarding === 'modern';
    const bungeeStyle = forwarding === 'legacy' || forwarding === 'bungeeguard';

    // spigot.yml: BungeeCord style forwarding
    {
        const path = `${folder}/spigot.yml`;
        const content = await readText(path);
        if (content === null) {
            missing.push('spigot.yml');
        } else {
            const next = editYaml(content, [[['settings', 'bungeecord'], bungeeStyle]]);
            if (next !== content) {
                await serverStorage.uploadFile(path, next, true);
                changed = true;
            }
            details.push(`spigot.yml: bungeecord ${bungeeStyle ? 'on' : 'off'}`);
        }
    }

    // Paper 1.19+ keeps the proxy settings in config/paper-global.yml, older versions in paper.yml
    if (isPluginServer(settings.type) || settings.type === undefined) {
        const globalPath = `${folder}/config/paper-global.yml`;
        const legacyPath = `${folder}/paper.yml`;
        const globalContent = await readText(globalPath);
        const legacyContent = globalContent === null ? await readText(legacyPath) : null;

        if (globalContent !== null) {
            const next = editYaml(globalContent, [
                [['proxies', 'velocity', 'enabled'], modern],
                [['proxies', 'velocity', 'online-mode'], true],
                [['proxies', 'velocity', 'secret'], modern ? (secret ?? '') : ''],
                [['proxies', 'bungee-cord', 'online-mode'], !bungeeStyle],
            ]);
            if (next !== globalContent) {
                await serverStorage.uploadFile(globalPath, next, true);
                changed = true;
            }
            details.push(`paper-global.yml: velocity forwarding ${modern ? 'on' : 'off'}`);
        } else if (legacyContent !== null) {
            const next = editYaml(legacyContent, [
                [['settings', 'velocity-support', 'enabled'], modern],
                [['settings', 'velocity-support', 'online-mode'], true],
                [['settings', 'velocity-support', 'secret'], modern ? (secret ?? '') : ''],
            ]);
            if (next !== legacyContent) {
                await serverStorage.uploadFile(legacyPath, next, true);
                changed = true;
            }
            details.push(`paper.yml: velocity forwarding ${modern ? 'on' : 'off'}`);
        } else {
            missing.push('paper-global.yml');
        }
    }

    // BungeeGuard on the server: only connections that carry the proxy's token are let in
    if (forwarding === 'bungeeguard' && settings.tokens && settings.tokens.length > 0) {
        const path = `${folder}/plugins/BungeeGuard/config.yml`;
        const content = (await readText(path)) ?? '';
        const next = editYaml(content, [[['allowed-tokens'], settings.tokens]]);
        if (next !== content) {
            try {
                await serverStorage.createDirectory(`${folder}/plugins/BungeeGuard`);
            } catch {
                // exists
            }
            await serverStorage.uploadFile(path, next, true);
            changed = true;
        }
        details.push('BungeeGuard: token written');
    }

    return { details, missing, restartNeeded: changed };
}

// ------------------------------------------------------------------ plugin downloads

const USER_AGENT = 'enVId-tech/MC-Server-Manager-UI (server network setup)';
const MAX_JAR_BYTES = 150 * 1024 * 1024;

async function download(url: string): Promise<Buffer> {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000), redirect: 'follow' });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_JAR_BYTES) throw new Error('The downloaded file has an unexpected size');
    return bytes;
}

interface ModrinthVersion {
    files?: Array<{ url: string; filename: string; primary?: boolean }>;
}

/** Newest release of a Modrinth plugin that works on this Minecraft version, or on any version when none matches */
async function modrinthJar(slug: string, version?: string, loaderNames: string[] = ['paper', 'spigot', 'bukkit']): Promise<{ url: string; filename: string } | null> {
    const loaders = encodeURIComponent(JSON.stringify(loaderNames));
    const attempts = version && compareMinecraftVersions(version, '1.0') > 0 && !/^(LATEST|SNAPSHOT)$/i.test(version)
        ? [`&game_versions=${encodeURIComponent(JSON.stringify([version]))}`, '']
        : [''];

    for (const filter of attempts) {
        try {
            const response = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=${loaders}${filter}`, {
                headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000),
            });
            if (!response.ok) continue;
            const versions = (await response.json()) as ModrinthVersion[];
            const file = versions[0]?.files?.find(candidate => candidate.primary) ?? versions[0]?.files?.[0];
            if (file) return { url: file.url, filename: file.filename };
        } catch {
            // try the next filter
        }
    }
    return null;
}

/** The ViaVersion family on the proxy is mirrored on the server, so players can choose to use it there too */
export async function installViaPlugins(folder: string, onProxy: PluginFlags, version?: string): Promise<string[]> {
    const wanted = (['viaversion', 'viabackwards', 'viarewind'] as const).filter(name => onProxy[name]);
    const details: string[] = [];
    if (wanted.length === 0) return details;

    let existing: string[] = [];
    try {
        existing = (await serverStorage.getDirectoryContents(`${folder}/plugins`)).map(entry => entry.basename.toLowerCase());
    } catch {
        try {
            await serverStorage.createDirectory(`${folder}/plugins`);
        } catch {
            // exists
        }
    }

    for (const name of wanted) {
        if (existing.some(file => file.startsWith(name))) {
            details.push(`${name} is already installed`);
            continue;
        }
        try {
            const jar = await modrinthJar(name, version);
            if (!jar) {
                details.push(`${name}: no release found for ${version ?? 'this version'}`);
                continue;
            }
            await serverStorage.uploadFile(`${folder}/plugins/${jar.filename.replace(/[^\w.\-+]/g, '_')}`, await download(jar.url), true);
            details.push(`${name} installed (${jar.filename})`);
        } catch (error) {
            details.push(`${name}: ${error instanceof Error ? error.message : 'install failed'}`);
        }
    }
    return details;
}

/** BungeeGuard has to run on the server to check the token. It is a Spigot plugin, downloaded from Spiget */
export async function installBungeeGuard(folder: string): Promise<string> {
    try {
        const existing = (await serverStorage.getDirectoryContents(`${folder}/plugins`)).map(entry => entry.basename.toLowerCase());
        if (existing.some(file => file.startsWith('bungeeguard'))) return 'BungeeGuard is already installed';
    } catch {
        try {
            await serverStorage.createDirectory(`${folder}/plugins`);
        } catch {
            // exists
        }
    }
    try {
        await serverStorage.uploadFile(`${folder}/plugins/BungeeGuard.jar`, await download('https://api.spiget.org/v2/resources/79601/download'), true);
        return 'BungeeGuard installed';
    } catch (error) {
        return `BungeeGuard could not be installed: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
}

/** Plugins of a proxy that can be installed when it is created, downloaded from Modrinth */
export const PROXY_PLUGIN_SLUGS = {
    viaversion: 'viaversion',
    viabackwards: 'viabackwards',
    viarewind: 'viarewind',
    geyser: 'geyser',
    floodgate: 'floodgate',
} as const;
export type ProxyPluginName = keyof typeof PROXY_PLUGIN_SLUGS;

export async function installProxyPlugins(folder: string, kind: 'velocity' | 'bungeecord' | 'waterfall', names: ProxyPluginName[]): Promise<string[]> {
    const details: string[] = [];
    if (names.length === 0) return details;
    try {
        await serverStorage.createDirectory(`${folder}/plugins`);
    } catch {
        // exists
    }
    const existing = (await serverStorage.getDirectoryContents(`${folder}/plugins`).catch(() => [])).map(entry => entry.basename.toLowerCase());
    // Geyser and Floodgate publish their BungeeCord build for Waterfall too
    const loaders = kind === 'velocity' ? ['velocity'] : ['bungeecord', 'waterfall'];

    for (const name of names) {
        if (existing.some(file => file.startsWith(name))) {
            details.push(`${name} is already installed`);
            continue;
        }
        try {
            const jar = await modrinthJar(PROXY_PLUGIN_SLUGS[name], undefined, loaders);
            if (!jar) {
                details.push(`${name}: no ${kind} release found`);
                continue;
            }
            await serverStorage.uploadFile(`${folder}/plugins/${jar.filename.replace(/[^\w.\-+]/g, '_')}`, await download(jar.url), true);
            details.push(`${name} installed (${jar.filename})`);
        } catch (error) {
            details.push(`${name}: ${error instanceof Error ? error.message : 'install failed'}`);
        }
    }
    return details;
}
