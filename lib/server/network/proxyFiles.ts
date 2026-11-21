/**
 * Reads and writes the files of a proxy and works out what the proxy is set up as.
 *
 * The proxy's own files are the source of truth: somebody may have switched the forwarding mode by hand, added
 * Geyser or installed ViaVersion, and the manager has to notice that instead of trusting what it stored once.
 */
import serverStorage from '@/lib/server/storage';
import type { ProxySettings } from '@/lib/objects/Server';
import {
    detectPlugins, parseBungeeGuardToken, parseBungeeYaml, parseEducationFiles, parseGeyserConfig, parseVelocityToml, publicBedrockAddress,
    type EducationFiles, type GeyserSettings, type PluginFlags,
} from './parse';
import type { ForwardingMode } from './versions';

export interface ProxyRef {
    uniqueId: string;
    serverName: string;
    containerName?: string;
    folderPath: string;
    port: number;
    proxy: ProxySettings;
}

export interface ProxyInspection {
    readable: boolean;
    forwarding: ForwardingMode;
    /** velocity forwarding secret, or the BungeeGuard token. Never sent to browsers */
    secret?: string;
    plugins: PluginFlags;
    bedrockPort?: number;
    /** Geyser reuses the Java port for Bedrock */
    bedrockClonesPort?: boolean;
    /** The port Geyser advertises, when it differs from the one it listens on */
    bedrockBroadcastPort?: number;
    /** The address Geyser is set to, when it is one players could use */
    bedrockAddress?: string;
    motd: string;
    maxPlayers: number;
    bind: string;
    servers: Record<string, string>;
    error?: string;
}

const NO_PLUGINS: PluginFlags = { viaversion: false, viabackwards: false, viarewind: false, geyser: false, floodgate: false, edugeyser: false, bungeeguard: false };

function dirnameOf(filePath: string): string {
    const index = filePath.lastIndexOf('/');
    return index <= 0 ? '/' : filePath.slice(0, index);
}

const locks = new Map<string, Promise<unknown>>();

/** Runs edits of the same file one after the other, so two servers added at once do not overwrite each other */
export async function withFileLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    locks.set(key, run);
    try {
        return await run;
    } finally {
        if (locks.get(key) === run) locks.delete(key);
    }
}

async function readText(filePath: string): Promise<string | null> {
    try {
        if (!(await serverStorage.exists(filePath))) return null;
        return (await serverStorage.getFileContents(filePath)).toString('utf-8');
    } catch {
        return null;
    }
}

export async function listPluginFiles(folder: string): Promise<string[]> {
    try {
        const entries = await serverStorage.getDirectoryContents(`${folder}/plugins`);
        return entries.map(entry => entry.basename);
    } catch {
        return [];
    }
}

const GEYSER_FOLDERS = ['geyser', 'Geyser-Velocity', 'Geyser-BungeeCord', 'EduGeyser-Velocity', 'EduGeyser-BungeeCord', 'edugeyser'];

/** Geyser keeps its config in a folder named after the platform; check the usual ones */
async function findGeyserFolder(folder: string): Promise<string | undefined> {
    for (const name of GEYSER_FOLDERS) {
        if (await readText(`${folder}/plugins/${name}/config.yml`)) return `${folder}/plugins/${name}`;
    }
    return undefined;
}

async function readGeyserSettings(folder: string): Promise<GeyserSettings | undefined> {
    const geyser = await findGeyserFolder(folder);
    const content = geyser ? await readText(`${geyser}/config.yml`) : null;
    if (!content) return undefined;
    try {
        return parseGeyserConfig(content);
    } catch {
        return undefined;
    }
}

/** What EduGeyser keeps in its files. The join codes themselves are not among them, only the connection IDs */
export async function readEducationFiles(proxyFolder: string): Promise<EducationFiles> {
    const geyser = await findGeyserFolder(proxyFolder);
    if (!geyser) return { connectionIds: [] };
    return parseEducationFiles({
        joinCode: (await readText(`${geyser}/extensions/edu/joincode_config.yml`)) ?? undefined,
        nethernet: (await readText(`${geyser}/nethernet/connection-id.yml`)) ?? undefined,
        serverList: (await readText(`${geyser}/extensions/edu/serverlist_config.yml`)) ?? undefined,
    });
}

export async function inspectProxy(ref: ProxyRef): Promise<ProxyInspection> {
    const folder = dirnameOf(ref.proxy.configPath);
    const pluginFiles = await listPluginFiles(folder);
    const plugins = pluginFiles.length > 0 ? detectPlugins(pluginFiles) : NO_PLUGINS;
    const geyserSettings = plugins.geyser ? await readGeyserSettings(folder) : undefined;
    const bedrockPort = plugins.geyser ? (geyserSettings?.bedrockPort ?? ref.proxy.bedrockPort ?? 19132) : undefined;
    const bedrock = { bedrockClonesPort: geyserSettings?.clonesRemotePort, bedrockBroadcastPort: geyserSettings?.broadcastPort, bedrockAddress: publicBedrockAddress(geyserSettings?.bedrockAddress) };

    const content = await readText(ref.proxy.configPath);
    if (content === null) {
        return {
            readable: false, forwarding: ref.proxy.forwarding, plugins, bedrockPort, ...bedrock, motd: '', maxPlayers: 0, bind: '',
            servers: {}, error: `The configuration file ${ref.proxy.configPath} was not found`,
        };
    }

    try {
        if (ref.proxy.type === 'velocity') {
            const summary = parseVelocityToml(content);
            let secret = summary.inlineSecret;
            const secretText = await readText(`${folder}/${summary.secretFile}`);
            if (secretText) secret = secretText.trim() || secret;
            return {
                readable: true, forwarding: summary.forwarding, secret, plugins, bedrockPort, ...bedrock, motd: summary.motd,
                maxPlayers: summary.maxPlayers, bind: summary.bind, servers: summary.servers,
            };
        }

        // BungeeCord and Waterfall: legacy forwarding, BungeeGuard when its plugin is installed
        const summary = parseBungeeYaml(content, plugins.bungeeguard);
        let token: string | undefined;
        if (plugins.bungeeguard) {
            for (const file of ['token.yml', 'config.yml']) {
                const text = await readText(`${folder}/plugins/BungeeGuard/${file}`);
                token = text ? parseBungeeGuardToken(text) : undefined;
                if (token) break;
            }
        }
        return {
            readable: true, forwarding: summary.forwarding, secret: token, plugins, bedrockPort, ...bedrock, motd: summary.motd,
            maxPlayers: summary.maxPlayers, bind: summary.host, servers: summary.servers,
        };
    } catch (error) {
        return {
            readable: false, forwarding: ref.proxy.forwarding, plugins, bedrockPort, ...bedrock, motd: '', maxPlayers: 0, bind: '',
            servers: {}, error: `The configuration could not be read: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
    }
}

/** Reads, changes and writes the proxy configuration while no other change to it is running */
export async function editProxyConfig(ref: ProxyRef, change: (content: string) => string): Promise<void> {
    await withFileLock(ref.proxy.configPath, async () => {
        const content = await readText(ref.proxy.configPath);
        if (content === null) throw new Error(`The configuration file ${ref.proxy.configPath} was not found`);
        const next = change(content);
        if (next !== content) await serverStorage.uploadFile(ref.proxy.configPath, next, true);
    });
}
