/**
 * Finds proxies that exist already. Looks at three things and reports why it thinks something is a proxy:
 *  - folders: the storage folder, the import folders and the folder above the storage folder, with their subfolders
 *  - containers: every container (running or not) whose mounts hold a proxy configuration, or that looks like one
 *  - the old proxies.yaml
 */
import serverStorage from '@/lib/server/storage';
import portainer from '@/lib/server/portainer';
import { getImportRoots, getParentRoot, hostPathToAppPath } from '@/lib/server/importPaths';
import { parseBungeeYaml, parseVelocityToml } from './parse';
import type { ProxyKind } from './versions';

export interface ProxyFinding {
    kind: ProxyKind;
    /** Storage path of velocity.toml or config.yml */
    configPath: string;
    folder: string;
    containerName?: string;
    networkName?: string;
    /** Port players connect to, when a container publishes it */
    port?: number;
    /** What gave it away */
    evidence: string[];
}

const SKIPPED_FOLDERS = new Set([
    'world', 'world_nether', 'world_the_end', 'plugins', 'mods', 'logs', 'cache', 'libraries', 'versions', 'backups',
    'node_modules', '.git', 'crash-reports', 'region', 'playerdata', 'datapacks', 'dimensions', 'generated',
]);
const MAX_DEPTH = 4;
const MAX_FOLDERS = 1500;
const PROXY_WORDS = /(velocity|bungee|waterfall|mc-proxy|minecraft-proxy)/i;

function parentOf(filePath: string): string {
    const index = filePath.lastIndexOf('/');
    return index <= 0 ? '/' : filePath.slice(0, index);
}

function join(folder: string, name: string): string {
    return `${folder === '/' ? '' : folder}/${name}`;
}

async function readText(filePath: string, limit = 256 * 1024): Promise<string | null> {
    try {
        const buffer = await serverStorage.getFileContents(filePath);
        return buffer.subarray(0, limit).toString('utf-8');
    } catch {
        return null;
    }
}

/**
 * Decides whether a folder holds a proxy from the names of what is in it and, for config.yml, from what is inside.
 * Returns null when it does not.
 */
export async function inspectFolder(folder: string, names: string[]): Promise<ProxyFinding | null> {
    const lower = new Map(names.map(name => [name.toLowerCase(), name]));
    const evidence: string[] = [];

    if (lower.has('velocity.toml')) {
        evidence.push('velocity.toml');
        if (lower.has('forwarding.secret')) evidence.push('forwarding.secret');
        return { kind: 'velocity', configPath: join(folder, lower.get('velocity.toml') as string), folder, evidence };
    }

    const config = lower.get('config.yml');
    if (!config) return null;

    const jar = names.find(name => /\.jar$/i.test(name) && PROXY_WORDS.test(name));
    const hasWaterfallYml = lower.has('waterfall.yml');
    const hasModules = lower.has('modules.yml');
    const content = await readText(join(folder, config));
    if (!content) return null;
    const looksLikeBungee = /^listeners:/m.test(content) && /^servers:/m.test(content);
    if (!looksLikeBungee) return null;
    // A game server's own files never have ip_forward, so one of these is enough
    const proof = /^ip_forward:/m.test(content) || hasWaterfallYml || hasModules || Boolean(jar);
    if (!proof) return null;

    evidence.push('config.yml with listeners and servers');
    if (/^ip_forward:/m.test(content)) evidence.push('ip_forward');
    if (hasWaterfallYml) evidence.push('waterfall.yml');
    if (hasModules) evidence.push('modules.yml');
    if (jar) evidence.push(jar);
    const kind: ProxyKind = hasWaterfallYml || /waterfall/i.test(jar ?? '') ? 'waterfall' : 'bungeecord';
    return { kind, configPath: join(folder, config), folder, evidence };
}

async function scanFolders(): Promise<ProxyFinding[]> {
    const roots = ['/', ...getImportRoots().map(root => root.appPath)];
    const parent = getParentRoot();
    if (parent) roots.push(parent.appPath);

    const found = new Map<string, ProxyFinding>();
    const seen = new Set<string>();
    let visited = 0;

    const walk = async (folder: string, depth: number): Promise<void> => {
        if (visited >= MAX_FOLDERS || seen.has(folder)) return;
        seen.add(folder);
        visited++;

        let entries;
        try {
            entries = await serverStorage.getDirectoryContents(folder);
        } catch {
            return;
        }

        const finding = await inspectFolder(folder, entries.filter(entry => entry.type === 'file').map(entry => entry.basename));
        if (finding) found.set(finding.configPath, finding);
        if (depth >= MAX_DEPTH) return;

        for (const entry of entries) {
            if (entry.type !== 'directory') continue;
            if (SKIPPED_FOLDERS.has(entry.basename.toLowerCase()) || entry.basename.startsWith('DELETED_') || entry.basename.startsWith('.')) continue;
            await walk(entry.filename, depth + 1);
        }
    };

    for (const root of roots) await walk(root, 0);
    return [...found.values()];
}

async function scanContainers(environmentId: number): Promise<ProxyFinding[]> {
    const findings: ProxyFinding[] = [];
    const containers = (await portainer.getContainers(environmentId)).slice(0, 300);

    for (const container of containers) {
        const name = container.Names[0]?.replace(/^\//, '') ?? container.Id;
        const hinted = PROXY_WORDS.test(container.Image) || PROXY_WORDS.test(name);
        const networks = Object.keys(container.NetworkSettings?.Networks ?? {}).filter(network => network !== 'bridge');

        for (const mount of container.Mounts ?? []) {
            if (!mount.Source) continue;
            const source = mount.Source.replace(/\/+$/, '');
            // A mounted single file (velocity.toml, config.yml) or a mounted folder
            const asFile = /\.(toml|yml)$/i.test(mount.Destination);
            const folderHost = asFile ? parentOf(source) : source;
            const appFolder = hostPathToAppPath(folderHost);
            if (!appFolder) continue;

            let names: string[];
            try {
                names = (await serverStorage.getDirectoryContents(appFolder)).filter(entry => entry.type === 'file').map(entry => entry.basename);
            } catch {
                continue;
            }
            const finding = await inspectFolder(appFolder, names);
            if (!finding) continue;

            const bind = await readBind(finding);
            const published = (container.Ports ?? []).find(port => port.PublicPort && port.Type === 'tcp' && port.PrivatePort === bind)
                ?? (container.Ports ?? []).find(port => port.PublicPort && port.Type === 'tcp');
            findings.push({
                ...finding,
                containerName: name,
                networkName: networks[0],
                port: published?.PublicPort,
                evidence: [`container ${name} (${container.Image}) mounts this folder`, ...(hinted ? [] : ['the container name does not say it is a proxy']), ...finding.evidence],
            });
            break;
        }
    }
    return findings;
}

async function readBind(finding: ProxyFinding): Promise<number | undefined> {
    const content = await readText(finding.configPath);
    if (!content) return undefined;
    try {
        const bind = finding.kind === 'velocity' ? parseVelocityToml(content).bind : parseBungeeYaml(content).host;
        const port = parseInt(bind.split(':').pop() ?? '', 10);
        return Number.isFinite(port) ? port : undefined;
    } catch {
        return undefined;
    }
}

let cache: { at: number; findings: ProxyFinding[] } | null = null;
const CACHE_MS = 30_000;

/** Every proxy this app can find, merged by configuration file. Containers add what they know to a folder finding. */
export async function scanForProxies(environmentId?: number, options: { force?: boolean } = {}): Promise<ProxyFinding[]> {
    if (!options.force && cache && Date.now() - cache.at < CACHE_MS) return cache.findings;
    const merged = new Map<string, ProxyFinding>();

    for (const finding of await scanFolders().catch(() => [])) merged.set(finding.configPath, finding);

    if (environmentId !== undefined) {
        for (const finding of await scanContainers(environmentId).catch(() => [])) {
            const existing = merged.get(finding.configPath);
            merged.set(finding.configPath, existing ? { ...existing, ...finding, evidence: [...finding.evidence, ...existing.evidence.filter(item => !finding.evidence.includes(item))] } : finding);
        }
    }

    const configured = process.env.VELOCITY_CONFIG_PATH?.trim();
    if (configured && !merged.has(configured) && await serverStorage.exists(configured).catch(() => false)) {
        merged.set(configured, { kind: 'velocity', configPath: configured, folder: parentOf(configured), evidence: ['VELOCITY_CONFIG_PATH'] });
    }
    cache = { at: Date.now(), findings: [...merged.values()] };
    return cache.findings;
}
