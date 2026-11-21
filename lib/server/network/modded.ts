/**
 * Makes mod loader servers work behind a proxy.
 *
 * Plugins servers read the proxy's forwarding from spigot.yml and Paper's config; Forge, NeoForge, Fabric and Quilt
 * have no such thing, so a forwarding mod has to be installed and given the proxy's secret:
 *   Fabric, Quilt   FabricProxy-Lite (needs Fabric API) and CrossStitch for modded command arguments
 *   Forge, NeoForge Proxy Compatible Forge, which also wraps modded command arguments
 * These only speak Velocity's modern forwarding, so modded servers only join modern forwarding Velocity proxies.
 * Forge 1.13 to 1.20.1 players also need the Ambassador plugin on Velocity for the Forge handshake.
 *
 * The mods are downloaded from Modrinth. They are recorded as managed files: users cannot remove them, and the ones
 * that carry the proxy secret are hidden from users completely (lib/server/accessPolicy.ts).
 */
import serverStorage from '@/lib/server/storage';
import { compareMinecraftVersions } from '@/lib/data/itzg/versions';
import { getServerType } from '@/lib/data/itzg/serverTypes';
import { download, modrinthJar } from './backend';

export type ModLoader = 'fabric' | 'quilt' | 'forge' | 'neoforge';

export interface ManagedFile {
    /** Path inside the server folder, for example mods/fabric-api-0.1.jar */
    path: string;
    /** Modrinth project it came from */
    slug: string;
    reason: string;
}

export interface ModdedSetupResult {
    loader: ModLoader | null;
    details: string[];
    managed: ManagedFile[];
    /** The server has to restart to load the mods or the new config */
    restartNeeded: boolean;
    /** The proxy needs the Ambassador plugin (and a restart to load it) */
    needsAmbassador: boolean;
    /** Forge 1.12 and older announce themselves to the client through the proxy */
    announceForge: boolean;
}

/** Loader a type id stands for. Modpack installers pick their own, so those are detected from the server files */
export function loaderForType(type: string | undefined | null): ModLoader | null {
    const id = getServerType(type)?.id;
    return id === 'fabric' || id === 'quilt' || id === 'forge' || id === 'neoforge' ? id : null;
}

async function exists(path: string): Promise<boolean> {
    try {
        return await serverStorage.exists(path);
    } catch {
        return false;
    }
}

/** Which loader an installed server runs, looked up from the files its first start leaves behind */
export async function detectLoader(folder: string): Promise<ModLoader | null> {
    if (await exists(`${folder}/libraries/net/neoforged`)) return 'neoforge';
    if (await exists(`${folder}/libraries/net/minecraftforge`)) return 'forge';
    try {
        const names = (await serverStorage.getDirectoryContents(folder)).map(entry => entry.basename.toLowerCase());
        if (names.some(name => /^quilt.*\.jar$/.test(name) || name === '.quilt')) return 'quilt';
        if (names.some(name => /^fabric.*\.jar$/.test(name) || name === '.fabric')) return 'fabric';
        if (names.some(name => /^(neoforge|forge)-.*\.jar$/.test(name) || /^(run|unix_args)\./.test(name))) {
            return names.some(name => name.startsWith('neoforge')) ? 'neoforge' : 'forge';
        }
    } catch {
        // folder not readable yet
    }
    return null;
}

/** Sets `key = value` of a TOML file, inside `[section]` or at the top. Adds the key or the section when missing */
export function setTomlKey(content: string, section: string | null, key: string, value: string | boolean): string {
    const rendered = typeof value === 'boolean' ? String(value) : JSON.stringify(value);
    const lines = content.split(/\r?\n/);
    const header = (line: string) => line.match(/^\s*\[([^\]]+)\]\s*$/)?.[1].trim();

    let start = -1;
    let end = lines.length;
    if (section === null) {
        start = 0;
        const first = lines.findIndex(line => header(line) !== undefined);
        end = first === -1 ? lines.length : first;
    } else {
        for (let i = 0; i < lines.length; i++) {
            const name = header(lines[i]);
            if (name === undefined) continue;
            if (start === -1 && name === section) start = i + 1;
            else if (start !== -1) { end = i; break; }
        }
    }

    if (start === -1) {
        const trimmed = lines.filter((line, index) => index < lines.length - 1 || line !== '');
        return `${[...trimmed, '', `[${section}]`, `\t${key} = ${rendered}`].join('\n')}\n`;
    }

    const pattern = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
    for (let i = start; i < end; i++) {
        const match = lines[i].match(pattern);
        if (match) {
            lines[i] = `${match[1]}${key} = ${rendered}`;
            return lines.join('\n');
        }
    }
    // Insert after the last non blank line of the section, so blank lines before the next header stay
    let at = end;
    while (at > start && lines[at - 1].trim() === '') at--;
    lines.splice(at, 0, `${section === null ? '' : '\t'}${key} = ${rendered}`);
    return lines.join('\n');
}

async function writeConfig(path: string, create: (secret: string) => string, update: (content: string, secret: string) => string, secret: string): Promise<boolean> {
    const dir = path.slice(0, path.lastIndexOf('/'));
    let current: string | null = null;
    try {
        if (await serverStorage.exists(path)) current = (await serverStorage.getFileContents(path)).toString('utf-8');
    } catch {
        current = null;
    }
    const next = current === null ? create(secret) : update(current, secret);
    if (next === current) return false;
    try {
        await serverStorage.createDirectory(dir);
    } catch {
        // exists
    }
    await serverStorage.uploadFile(path, next, true);
    return true;
}

/** Downloads a mod into mods/ unless a file with that prefix is there already */
async function installMod(folder: string, slug: string, loaders: string[], version: string | undefined, reason: string, prefixes: string[], managed: ManagedFile[], details: string[]): Promise<boolean> {
    let existing: string[] = [];
    try {
        existing = (await serverStorage.getDirectoryContents(`${folder}/mods`)).map(entry => entry.basename);
    } catch {
        try {
            await serverStorage.createDirectory(`${folder}/mods`);
        } catch {
            // exists
        }
    }
    const present = existing.find(file => prefixes.some(prefix => file.toLowerCase().startsWith(prefix)));
    if (present) {
        if (!managed.some(entry => entry.path === `mods/${present}`)) managed.push({ path: `mods/${present}`, slug, reason });
        return false;
    }
    try {
        const jar = await modrinthJar(slug, version, loaders);
        if (!jar) {
            details.push(`${slug}: no release found for ${version ?? 'this version'}`);
            return false;
        }
        const filename = jar.filename.replace(/[^\w.\-+]/g, '_');
        await serverStorage.uploadFile(`${folder}/mods/${filename}`, await download(jar.url), true);
        managed.push({ path: `mods/${filename}`, slug, reason });
        details.push(`${slug} installed (${jar.filename})`);
        return true;
    } catch (error) {
        details.push(`${slug}: ${error instanceof Error ? error.message : 'install failed'}`);
        return false;
    }
}

export interface ModdedSetupInput {
    folder: string;
    type: string;
    version?: string;
    secret?: string;
}

/**
 * Installs the forwarding mod for the server's loader and puts the proxy secret into its config.
 * Safe to run again: existing mods are kept and only the secret is rewritten.
 */
export async function applyModdedSetup(input: ModdedSetupInput): Promise<ModdedSetupResult> {
    const { folder, version, secret } = input;
    const result: ModdedSetupResult = { loader: null, details: [], managed: [], restartNeeded: false, needsAmbassador: false, announceForge: false };

    const loader = loaderForType(input.type) ?? await detectLoader(folder);
    result.loader = loader;
    if (!loader) {
        result.details.push('The mod loader of this modpack is not known yet. The proxy mods are added at the next sync, after the server has started once');
        return result;
    }
    if (!secret) {
        result.details.push('The proxy has no forwarding secret, so the forwarding mod was not set up');
        return result;
    }

    if (loader === 'fabric' || loader === 'quilt') {
        // Quilt loads Fabric mods
        const loaders = loader === 'quilt' ? ['quilt', 'fabric'] : ['fabric'];
        if (await installMod(folder, 'fabric-api', loaders, version, 'Required by the proxy forwarding mod', ['fabric-api'], result.managed, result.details)) result.restartNeeded = true;
        if (await installMod(folder, 'fabricproxy-lite', loaders, version, 'Proxy forwarding', ['fabricproxy-lite', 'fabricproxy_lite'], result.managed, result.details)) result.restartNeeded = true;
        if (await installMod(folder, 'crossstitch', loaders, version, 'Modded commands through the proxy', ['crossstitch'], result.managed, result.details)) result.restartNeeded = true;

        const changed = await writeConfig(
            `${folder}/config/FabricProxy-Lite.toml`,
            value => `hackOnlineMode = true\nhackEarlySend = false\nhackMessageChain = true\ndisconnectMessage = "This server requires you to connect through the proxy."\nsecret = ${JSON.stringify(value)}\n`,
            (content, value) => setTomlKey(content, null, 'secret', value),
            secret,
        );
        if (changed) { result.restartNeeded = true; result.details.push('FabricProxy-Lite: secret written'); }
    } else {
        const loaders = [loader];
        if (await installMod(folder, 'proxy-compatible-forge', loaders, version, 'Proxy forwarding', ['proxy-compatible-forge', 'proxycompatibleforge', 'pcf-'], result.managed, result.details)) result.restartNeeded = true;

        const changed = await writeConfig(
            `${folder}/config/proxy-compatible-forge.toml`,
            value => `[forwarding]\n\tenabled = true\n\tmode = "MODERN"\n\tsecret = ${JSON.stringify(value)}\n`,
            (content, value) => setTomlKey(setTomlKey(content, 'forwarding', 'enabled', true), 'forwarding', 'secret', value),
            secret,
        );
        if (changed) { result.restartNeeded = true; result.details.push('Proxy Compatible Forge: secret written'); }

        if (loader === 'forge' && version && /^\d/.test(version)) {
            if (compareMinecraftVersions(version, '1.13') >= 0 && compareMinecraftVersions(version, '1.20.1') <= 0) result.needsAmbassador = true;
            if (compareMinecraftVersions(version, '1.12.2') <= 0) {
                result.announceForge = true;
                result.details.push('Forge 1.12 and older need a modified Velocity build for modern forwarding (see the Proxy Compatible Forge page)');
            }
        }
    }
    return result;
}

/** Installs a Velocity plugin that modded servers need on the proxy. True when it was newly added (the proxy must restart) */
export async function installProxyAddon(proxyFolder: string, slug: string, prefixes: string[], details: string[]): Promise<boolean> {
    try {
        await serverStorage.createDirectory(`${proxyFolder}/plugins`);
    } catch {
        // exists
    }
    const existing = (await serverStorage.getDirectoryContents(`${proxyFolder}/plugins`).catch(() => [])).map(entry => entry.basename.toLowerCase());
    if (existing.some(file => prefixes.some(prefix => file.startsWith(prefix)))) return false;
    try {
        const jar = await modrinthJar(slug, undefined, ['velocity']);
        if (!jar) {
            details.push(`${slug}: no Velocity release found`);
            return false;
        }
        await serverStorage.uploadFile(`${proxyFolder}/plugins/${jar.filename.replace(/[^\w.\-+]/g, '_')}`, await download(jar.url), true);
        details.push(`${slug} installed on the proxy (${jar.filename})`);
        return true;
    } catch (error) {
        details.push(`${slug}: ${error instanceof Error ? error.message : 'install failed'}`);
        return false;
    }
}
