import { randomUUID } from 'crypto';
import Server from '@/lib/objects/Server';
import { IUser } from '@/lib/objects/User';
import serverStorage from '@/lib/server/storage';
import portainer from '@/lib/server/portainer';
import PortManager from '@/lib/server/portManager';
import { getImportRoots, getParentRoot, hostPathToAppPath } from '@/lib/server/importPaths';
import { findForcedHosts, readProxyEntries, resolveAddress } from '@/lib/server/network/forcedHosts';
import { publicSubdomain } from '@/lib/server/subdomain';
import { getContainerName } from '@/lib/server/containerNames';
import { discoverVelocityInstances } from '@/lib/server/velocityDiscovery';
import { getServerType, isVelocityCompatible } from '@/lib/data/itzg/serverTypes';
import { isRestrictedPort } from '@/lib/config/portConfig';

/** A server that exists on this machine but is not in the dashboard yet. */
export interface ImportCandidate {
    /** Stable identifier: docker:<container name> or folder:<storage path> */
    key: string;
    name: string;
    source: 'docker' | 'folder' | 'both';
    containerName?: string;
    containerId?: string;
    state?: string;
    /** Where this app reads the server's files. Missing when the folder is not reachable from here */
    folderPath?: string;
    /** The same folder as Docker sees it */
    hostPath?: string;
    reachable: boolean;
    type: string;
    version: string;
    port?: number;
    memory?: string;
    networks: string[];
    velocityCompatible: boolean;
    notes: string[];
}

export interface ImportResult {
    key: string;
    success: boolean;
    uniqueId?: string;
    subdomain?: string;
    error?: string;
    notes: string[];
}

const SKIPPED_FOLDERS = new Set(['world', 'world_nether', 'world_the_end', 'plugins', 'mods', 'logs', 'cache', 'libraries', 'versions', 'backups', 'config', 'node_modules', '.git', 'crash-reports']);
const MAX_DEPTH = 3;
const MAX_FOLDERS = 800;

function parseProperties(text: string): Record<string, string> {
    const properties: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index > 0) properties[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
    return properties;
}

function parseEnvironment(list: string[] | undefined): Record<string, string> {
    const env: Record<string, string> = {};
    for (const entry of list ?? []) {
        const index = entry.indexOf('=');
        if (index > 0) env[entry.slice(0, index)] = entry.slice(index + 1);
    }
    return env;
}

/** Megabytes from values such as 4G, 2048M or 512m. */
function parseMemoryMb(value: string | undefined): number | undefined {
    const match = /^(\d+)\s*([gGmM]?)/.exec(value ?? '');
    if (!match) return undefined;
    const amount = Number(match[1]);
    return match[2].toLowerCase() === 'g' ? amount * 1024 : amount;
}

function slugify(value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return slug || 'server';
}

/** Server type from the files in a folder, for servers that are not (known to be) run by the itzg image. */
function detectTypeFromFiles(names: string[]): string {
    const has = (pattern: RegExp) => names.some(name => pattern.test(name));
    if (has(/^purpur.*\.jar$/i) || names.includes('purpur.yml')) return 'purpur';
    if (has(/^folia.*\.jar$/i)) return 'folia';
    if (has(/^paper.*\.jar$/i) || names.includes('paper.yml') || names.includes('paper-global.yml') || names.includes('.paper-remote')) return 'paper';
    if (names.includes('pufferfish.yml')) return 'pufferfish';
    if (names.includes('spigot.yml')) return 'spigot';
    if (has(/fabric/i)) return 'fabric';
    if (has(/neoforge/i)) return 'neoforge';
    if (has(/forge/i)) return 'forge';
    return 'vanilla';
}

function describeType(type: string): { type: string; velocityCompatible: boolean } {
    const normalized = type.trim().toLowerCase() || 'vanilla';
    return { type: normalized, velocityCompatible: Boolean(getServerType(normalized)) && isVelocityCompatible(normalized) };
}

async function readFolder(folderPath: string): Promise<{ names: string[]; properties: Record<string, string> } | null> {
    try {
        const entries = await serverStorage.getDirectoryContents(folderPath);
        const names = entries.map(entry => entry.basename);
        if (!names.includes('server.properties')) return null;
        const text = (await serverStorage.getFileContents(`${folderPath}/server.properties`)).toString('utf-8');
        return { names, properties: parseProperties(text) };
    } catch {
        return null;
    }
}

/** Name of a server found in a folder. Folders such as .../creative/data are named after the folder above */
function friendlyFolderName(folder: string): string {
    const parts = folder.split('/').filter(Boolean);
    const last = parts.pop() ?? 'server';
    return ['data', 'server', 'minecraft', 'mc', 'app'].includes(last.toLowerCase()) && parts.length > 0 ? parts[parts.length - 1] : last;
}

/** Folders with a server.properties in the storage folder and in every import folder. */
export async function scanFolders(managedFolders: Set<string>): Promise<ImportCandidate[]> {
    // The storage folder, the import folders, and the folder next to the storage folder (servers are often set up beside it)
    const parent = getParentRoot();
    const roots = [...new Set(['/', ...getImportRoots().map(root => root.appPath), ...(parent ? [parent.appPath] : [])])];
    const candidates = new Map<string, ImportCandidate>();
    let visited = 0;

    // The folder above the storage folder contains the storage folder, which is walked as '/' already
    const storageRoot = process.env.LOCAL_STORAGE_PATH?.trim().replace(/\/+$/, '');

    const walk = async (folder: string, depth: number): Promise<void> => {
        if (visited++ >= MAX_FOLDERS) return;
        if (managedFolders.has(folder)) return;
        if (storageRoot && folder === storageRoot && depth > 0) return;

        let entries;
        try {
            entries = await serverStorage.getDirectoryContents(folder);
        } catch {
            return;
        }
        const names = entries.map(entry => entry.basename);

        // A proxy is not a server
        if (names.includes('velocity.toml')) return;

        if (names.includes('server.properties')) {
            const info = await readFolder(folder);
            if (info) {
                const detected = describeType(detectTypeFromFiles(names));
                const port = Number(info.properties['server-port']);
                candidates.set(folder, {
                    key: `folder:${folder}`,
                    name: friendlyFolderName(folder),
                    source: 'folder',
                    folderPath: folder,
                    reachable: true,
                    type: detected.type,
                    version: 'LATEST',
                    port: Number.isFinite(port) && port > 0 ? port : undefined,
                    networks: [],
                    velocityCompatible: detected.velocityCompatible,
                    notes: [],
                });
            }
            return; // servers do not contain servers
        }

        if (depth >= MAX_DEPTH) return;
        for (const entry of entries) {
            if (entry.type === 'directory' && !SKIPPED_FOLDERS.has(entry.basename) && !entry.basename.startsWith('DELETED')) {
                await walk(entry.filename, depth + 1);
            }
        }
    };

    for (const root of roots) {
        await walk(root, 0);
    }
    return [...candidates.values()];
}

/** Running or stopped itzg Minecraft containers, with what their configuration says. */
async function scanContainers(environmentId: number, managedContainers: Set<string>): Promise<ImportCandidate[]> {
    const candidates: ImportCandidate[] = [];
    const containers = await portainer.getContainers(environmentId, true);

    for (const container of containers) {
        const name = container.Names[0]?.replace(/^\//, '') ?? container.Id;
        if (managedContainers.has(name)) continue;
        // An image that was updated shows up as a bare id, so the name is also looked up in the container's own config
        let imageName = container.Image;
        if (/^(sha256:)?[0-9a-f]{12,}$/i.test(imageName)) {
            try {
                imageName = (await portainer.getContainerDetails(container.Id, environmentId)).Config?.Image ?? imageName;
            } catch {
                // keep what the list says
            }
        }
        const looksLikeServer = /minecraft|papermc|purpur|spigot|itzg\/mc-/i.test(imageName) && !/proxy|velocity|bungee|waterfall|bedrock/i.test(imageName);
        if (!looksLikeServer) continue;

        const notes: string[] = [];
        let env: Record<string, string> = {};
        let mounts = container.Mounts ?? [];
        let networks = Object.keys(container.NetworkSettings?.Networks ?? {});
        try {
            const details = await portainer.getContainerDetails(container.Id, environmentId);
            env = parseEnvironment(details.Config?.Env);
            mounts = details.Mounts ?? mounts;
            networks = Object.keys(details.NetworkSettings?.Networks ?? {});
        } catch {
            notes.push('The container could not be inspected, so its settings are unknown');
        }

        const data = mounts.find(mount => mount.Destination === '/data');
        const hostPath = data?.Source;
        const folderPath = hostPath ? hostPathToAppPath(hostPath) ?? undefined : undefined;
        if (!hostPath) notes.push('Its /data folder is not a bind mount, so its files cannot be reached from here');
        else if (!folderPath) notes.push(`This app cannot see ${hostPath}. Add the folder to IMPORT_SCAN_PATHS to manage its files`);

        const internalPort = Number(env.SERVER_PORT) || 25565;
        const published = container.Ports?.find(port => port.PrivatePort === internalPort && port.PublicPort)?.PublicPort;
        const described = describeType(env.TYPE || 'vanilla');

        candidates.push({
            key: `docker:${name}`,
            name,
            source: 'docker',
            containerName: name,
            containerId: container.Id,
            state: container.State,
            folderPath,
            hostPath,
            reachable: Boolean(folderPath),
            type: described.type,
            version: env.VERSION || 'LATEST',
            port: published,
            memory: env.MEMORY || env.MAX_MEMORY,
            networks,
            velocityCompatible: described.velocityCompatible,
            notes,
        });
    }
    return candidates;
}

/**
 * Everything on this machine that looks like a Minecraft server and is not managed yet: itzg containers
 * (running or stopped) and folders that hold a server.properties. A container and its folder become one entry.
 */
export async function discoverImportCandidates(environmentId: number): Promise<ImportCandidate[]> {
    const managed = await Server.find({}, 'uniqueId containerName folderPath').lean();
    const managedFolders = new Set<string>(managed.map((server: { folderPath?: string }) => server.folderPath).filter(Boolean) as string[]);
    const managedContainers = new Set<string>(managed.map((server: { uniqueId: string; containerName?: string }) => getContainerName(server)));

    let containers: ImportCandidate[] = [];
    try {
        containers = await scanContainers(environmentId, managedContainers);
    } catch (error) {
        console.warn('Import: could not list containers:', error instanceof Error ? error.message : error);
    }
    const folders = await scanFolders(managedFolders);

    const merged: ImportCandidate[] = [];
    for (const container of containers) {
        const folder = container.folderPath ? folders.find(candidate => candidate.folderPath === container.folderPath) : undefined;
        if (folder) {
            container.source = 'both';
            // The files tell what the image is not told (server-port, the jar that is really there)
            if (container.type === 'vanilla' && folder.type !== 'vanilla' && !container.notes.length) container.type = folder.type;
            if (container.port === undefined) container.port = folder.port;
        }
        merged.push(container);
    }
    // Folders that no container uses (yet)
    for (const folder of folders) {
        if (!containers.some(container => container.folderPath === folder.folderPath)) merged.push(folder);
    }

    // Servers that already point at a Velocity network are worth a hint
    try {
        const velocity = await discoverVelocityInstances({ environmentId });
        if (velocity.length > 0) {
            for (const candidate of merged) {
                if (candidate.networks.some(network => /velocity/i.test(network))) candidate.notes.push('Already connected to a Velocity network');
            }
        }
    } catch {
        // purely informational
    }

    return merged.sort((a, b) => a.name.localeCompare(b.name));
}

/** Add the chosen candidates to the dashboard under `owner`. Their files and containers are not changed. */
export async function importCandidates(keys: string[], owner: IUser, environmentId: number): Promise<ImportResult[]> {
    const candidates = await discoverImportCandidates(environmentId);
    const results: ImportResult[] = [];
    // The addresses these servers already have are the forced hosts of the proxies they sit behind
    const proxies = await readProxyEntries(environmentId).catch(() => []);

    for (const key of keys) {
        const notes: string[] = [];
        const candidate = candidates.find(entry => entry.key === key);
        if (!candidate) {
            results.push({ key, success: false, error: 'This server was not found any more, or is already in the dashboard.', notes });
            continue;
        }
        if (!candidate.folderPath) {
            results.push({ key, success: false, error: 'This app cannot reach its files. Add its parent folder to IMPORT_SCAN_PATHS and try again.', notes });
            continue;
        }

        try {
            const folder = await readFolder(candidate.folderPath);
            const properties = folder?.properties ?? {};

            // The record's port is unique and must not sit on a restricted or colliding port.
            let port = candidate.port;
            const conflict = port
                ? isRestrictedPort(port) || Boolean(await Server.exists({ $or: [{ port }, { rconPort: port }] }))
                : true;
            if (!port || conflict) {
                const allocation = await PortManager.allocatePort(owner.email, false, environmentId);
                if (!allocation.success || !allocation.port) {
                    throw new Error(allocation.error || 'No free port is left for this server.');
                }
                port = allocation.port;
                notes.push(`Recorded under port ${port}; the container keeps its own port settings`);
            }

            const forcedHosts = findForcedHosts(proxies, { name: candidate.name, containerName: candidate.containerName });
            const address = await resolveAddress(forcedHosts);
            const subdomainName = address.subdomainName;
            notes.push(address.found
                ? `Address ${subdomainName} taken from the proxy${address.extraHostnames.length > 0 ? `, also reachable as ${address.extraHostnames.join(', ')}` : ''}`
                : forcedHosts.length > 0
                    ? 'The proxy hosts of this server are already used by another server; set an address on its page'
                    : 'No proxy has a forced host for this server, so it has no address yet; set one on its page');
            const uniqueId = randomUUID();
            const bool = (value: string | undefined, fallback: boolean) => (value === undefined ? fallback : value === 'true');
            const number = (value: string | undefined, fallback: number) => (Number.isFinite(Number(value)) && value !== undefined && value !== '' ? Number(value) : fallback);

            const server = new Server({
                uniqueId,
                email: owner.email,
                subdomainName,
                extraHostnames: address.extraHostnames.length > 0 ? address.extraHostnames : undefined,
                subdomainSource: address.found ? 'forced-host' : 'guessed',
                isOnline: candidate.state === 'running',
                folderPath: candidate.folderPath,
                serverName: candidate.name.slice(0, 50),
                port,
                environmentId,
                proxyIds: [],
                containerName: candidate.containerName,
                imported: true,
                importedFrom: { source: candidate.source === 'folder' ? 'folder' : 'docker', hostPath: candidate.hostPath },
                serverConfig: {
                    name: candidate.name.slice(0, 50),
                    serverType: candidate.type,
                    version: candidate.version,
                    description: '',
                    seed: properties['level-seed'] ?? '',
                    gameMode: properties.gamemode ?? 'survival',
                    difficulty: properties.difficulty ?? 'normal',
                    worldType: properties['level-type'] ?? 'minecraft:normal',
                    worldGeneration: 'default',
                    maxPlayers: number(properties['max-players'], 20),
                    whitelistEnabled: bool(properties['white-list'], false),
                    onlineMode: bool(properties['online-mode'], true),
                    pvpEnabled: bool(properties.pvp, true),
                    commandBlocksEnabled: bool(properties['enable-command-block'], false),
                    flightEnabled: bool(properties['allow-flight'], false),
                    spawnAnimalsEnabled: bool(properties['spawn-animals'], true),
                    spawnMonstersEnabled: bool(properties['spawn-monsters'], true),
                    spawnNpcsEnabled: bool(properties['spawn-npcs'], true),
                    generateStructuresEnabled: bool(properties['generate-structures'], true),
                    port,
                    viewDistance: number(properties['view-distance'], 10),
                    simulationDistance: number(properties['simulation-distance'], 10),
                    spawnProtection: number(properties['spawn-protection'], 16),
                    rconEnabled: bool(properties['enable-rcon'], false),
                    rconPassword: '',
                    motd: properties.motd ?? candidate.name,
                    forceResourcePack: false,
                    enableJmxMonitoring: false,
                    syncChunkWrites: true,
                    enforceWhitelist: bool(properties['enforce-whitelist'], false),
                    preventProxyConnections: false,
                    hideOnlinePlayers: false,
                    broadcastRconToOps: true,
                    broadcastConsoleToOps: true,
                    serverMemory: parseMemoryMb(candidate.memory) ?? 2048,
                    subdomain: address.subdomainLabel,
                    plugins: [],
                    mods: [],
                },
            });
            await server.save();

            if (!candidate.velocityCompatible) {
                notes.push(`Server type "${candidate.type}" cannot be connected to Velocity by this app`);
            }
            results.push({ key, success: true, uniqueId, subdomain: publicSubdomain(subdomainName), notes });
        } catch (error) {
            results.push({ key, success: false, error: error instanceof Error ? error.message : 'Import failed.', notes });
        }
    }
    return results;
}
