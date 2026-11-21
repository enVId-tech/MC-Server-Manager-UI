/**
 * Creating, changing, adopting and removing proxies. Administrators only; the API routes check that.
 */
import crypto from 'crypto';
import Server, { type IServer, type ProxySettings } from '@/lib/objects/Server';
import portainer from '@/lib/server/portainer';
import serverStorage from '@/lib/server/storage';
import { getProxyAbsolutePath, getDefinedProxies } from '@/lib/config/proxies';
import { getServerBasePath } from '@/lib/server/serverPaths';
import { buildServerHostname, getServerDomain } from '@/lib/config/domain';
import { scanForProxies, type ProxyFinding } from './discovery';
import { installProxyPlugins, type ProxyPluginName } from './backend';
import { parseBungeeYaml, parseVelocityToml, setBungeeForwarding, setVelocityForwarding, disableVelocityFallback } from './parse';
import { editProxyConfig, inspectProxy, type ProxyRef } from './proxyFiles';
import { bungeeYamlTemplate, defaultProxyImage, proxyCompose, velocityTomlTemplate } from './proxyTemplates';
import { getEnvironmentId, getNetworkSettings, listProxies, reloadProxy, syncAllServers } from './service';
import { setTomlValue } from './toml';
import { forwardingModesFor, isForwardingMode, type ForwardingMode, type ProxyKind } from './versions';
import YAML from 'yaml';

export interface CreateProxyInput {
    name: string;
    kind: ProxyKind;
    forwarding: ForwardingMode;
    /** Port players connect to, for example 25565 */
    port: number;
    memory?: string;
    networkName?: string;
    publicHost?: string;
    motd?: string;
    maxPlayers?: number;
    priority?: number;
    image?: string;
    plugins?: ProxyPluginName[];
    /** UDP port for Geyser. Published when Geyser is installed */
    bedrockPort?: number;
    /** Give a second proxy the secret of the first, which servers behind both of them need */
    shareSecret?: boolean;
}

export interface ProxyOperationResult {
    proxyId: string;
    details: string[];
    restartRequired: boolean;
}

const KINDS: ProxyKind[] = ['velocity', 'bungeecord', 'waterfall'];

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

function newSecret(): string {
    return crypto.randomBytes(12).toString('base64url');
}

function configFileName(kind: ProxyKind): string {
    return kind === 'velocity' ? 'velocity.toml' : 'config.yml';
}

/** Containers in the environment that publish this host port */
async function portInUse(port: number, environmentId: number): Promise<boolean> {
    try {
        return (await portainer.getUsedPorts(environmentId)).includes(port);
    } catch {
        return false;
    }
}

export async function createProxy(input: CreateProxyInput, ownerEmail: string): Promise<ProxyOperationResult> {
    const details: string[] = [];
    const kind = input.kind;
    if (!KINDS.includes(kind)) throw new Error('The proxy type must be velocity, bungeecord or waterfall.');
    if (!isForwardingMode(input.forwarding) || input.forwarding === 'none' || !forwardingModesFor(kind).includes(input.forwarding)) {
        throw new Error(`${kind} cannot use ${input.forwarding} forwarding.`);
    }
    const name = input.name?.trim();
    if (!name || name.length > 50) throw new Error('Give the proxy a name of up to 50 characters.');
    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('The port must be between 1024 and 65535.');
    if (await Server.exists({ port })) throw new Error(`Port ${port} is already used by another server or proxy.`);

    const environmentId = await getEnvironmentId();
    if (await portInUse(port, environmentId)) throw new Error(`Port ${port} is already published by a container.`);

    const memory = /^\d+[MG]$/i.test(input.memory ?? '') ? (input.memory as string).toUpperCase() : '512M';
    const idSuffix = crypto.randomBytes(4).toString('hex');
    const uniqueId = `px${idSuffix}`;
    const containerName = `${kind}-${slug(name) || idSuffix}-${idSuffix}`;
    const networkName = input.networkName?.trim() || 'proxy-network';
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(networkName)) throw new Error('The network name may only contain letters, digits, dots, dashes and underscores.');
    const image = input.image?.trim() || defaultProxyImage(kind);
    const relative = `proxies/${uniqueId}`;
    const folder = `${getServerBasePath()}/${relative}`.replace(/\/+/g, '/');
    const configPath = `${folder}/${configFileName(kind)}`;
    const hostFolder = getProxyAbsolutePath(relative);
    const plugins = [...new Set(input.plugins ?? [])];
    const wantsGeyser = plugins.includes('geyser');
    const bedrockPort = wantsGeyser ? Number(input.bedrockPort) || 19132 : undefined;
    const motd = input.motd?.trim() || name;
    const maxPlayers = Number(input.maxPlayers) > 0 ? Number(input.maxPlayers) : 500;

    // The secret of the other proxies of this kind is reused, because a server can only know one
    let secret = newSecret();
    if (input.shareSecret !== false && (input.forwarding === 'modern' || input.forwarding === 'bungeeguard')) {
        const sibling = (await listProxies()).find(proxy => proxy.kind === 'velocity' && proxy.forwarding === input.forwarding && proxy.secret);
        if (sibling?.secret && kind === 'velocity') {
            secret = sibling.secret;
            details.push(`Using the forwarding secret of ${sibling.name}, so servers work behind both proxies`);
        }
    }

    const cleanup: Array<() => Promise<void>> = [];
    try {
        await portainer.ensureNetwork(networkName, environmentId);

        try { await serverStorage.createDirectory(`${getServerBasePath()}/proxies`); } catch { /* exists */ }
        await serverStorage.createDirectory(folder);
        cleanup.push(() => serverStorage.deleteDirectoryRecursively(folder));
        try { await serverStorage.createDirectory(`${folder}/plugins`); } catch { /* exists */ }

        const template = { motd, maxPlayers, forwarding: input.forwarding };
        await serverStorage.uploadFile(configPath, kind === 'velocity' ? velocityTomlTemplate(template) : bungeeYamlTemplate(template), true);
        if (kind === 'velocity') await serverStorage.uploadFile(`${folder}/forwarding.secret`, secret, true);
        details.push(`Created ${configFileName(kind)}${kind === 'velocity' ? ' and forwarding.secret' : ''}`);

        details.push(...await installProxyPlugins(folder, kind, plugins));

        const stackName = `${kind}-${slug(name) || idSuffix}-${idSuffix}`;
        const compose = proxyCompose({ kind, name, containerName, image, hostPort: port, hostFolder, networkName, memory, udpPorts: bedrockPort ? [bedrockPort] : [] });
        await portainer.createStack({ Name: stackName, ComposeFile: compose, Env: [] }, environmentId);
        details.push(`Started ${stackName} on port ${port}`);

        const proxy: ProxySettings = {
            type: kind, forwarding: input.forwarding, enabled: input.priority !== -1, priority: Number(input.priority) || 0,
            networkName, memory, image, configPath, stackName, publicHost: input.publicHost?.trim() || undefined, bedrockPort,
        };
        await Server.create({
            uniqueId, email: ownerEmail, kind: 'proxy', proxy,
            subdomainName: `proxy-${idSuffix}.${getServerDomain()}`,
            serverName: name, folderPath: folder, port, containerName,
            environmentId, lastDeploymentStatus: 'success', deployedAt: new Date(), isOnline: false,
            serverConfig: { name, serverType: kind, version: 'LATEST', motd, maxPlayers },
        });
    } catch (error) {
        for (const undo of cleanup.reverse()) await undo().catch(() => undefined);
        throw error;
    }

    // Servers that were waiting for a proxy join it now
    const sync = await syncAllServers({ environmentId });
    details.push(`Checked ${sync.servers} server${sync.servers === 1 ? '' : 's'} for this proxy`);
    return { proxyId: uniqueId, details, restartRequired: false };
}

export interface UpdateProxyInput {
    name?: string;
    enabled?: boolean;
    priority?: number;
    forwarding?: ForwardingMode;
    motd?: string;
    maxPlayers?: number;
    publicHost?: string;
    /** Entry name of the server players without a host name are sent to. Empty clears it */
    defaultEntry?: string;
    memory?: string;
    image?: string;
    installPlugins?: ProxyPluginName[];
    /** Pull the image again and recreate the container, even when memory and image are unchanged */
    pullImage?: boolean;
}

function proxyRefOf(record: IServer): ProxyRef {
    return { uniqueId: record.uniqueId, serverName: record.serverName, folderPath: record.folderPath, port: record.port, proxy: record.proxy as ProxySettings };
}

export async function updateProxy(id: string, patch: UpdateProxyInput): Promise<ProxyOperationResult> {
    const record = await Server.findOne({ uniqueId: id, kind: 'proxy' });
    if (!record) throw new Error('Proxy not found.');
    const settings = { ...(record.proxy as ProxySettings) };
    const ref = proxyRefOf(record);
    const details: string[] = [];
    let restartRequired = false;
    let resync = false;
    const folder = record.folderPath;

    if (patch.forwarding !== undefined && patch.forwarding !== settings.forwarding) {
        if (!isForwardingMode(patch.forwarding) || patch.forwarding === 'none' || !forwardingModesFor(settings.type).includes(patch.forwarding)) {
            throw new Error(`${settings.type} cannot use ${patch.forwarding} forwarding.`);
        }
        await editProxyConfig(ref, content => settings.type === 'velocity' ? setVelocityForwarding(content, patch.forwarding as ForwardingMode) : setBungeeForwarding(content, patch.forwarding as ForwardingMode));
        if (settings.type === 'velocity' && !(await serverStorage.exists(`${folder}/forwarding.secret`))) {
            await serverStorage.uploadFile(`${folder}/forwarding.secret`, newSecret(), true);
            details.push('Created forwarding.secret');
        }
        settings.forwarding = patch.forwarding;
        restartRequired = true;
        resync = true;
        details.push(`Forwarding set to ${patch.forwarding}. The proxy has to restart before it uses it`);
    }

    if (patch.motd !== undefined || patch.maxPlayers !== undefined) {
        await editProxyConfig(ref, content => {
            if (settings.type === 'velocity') {
                let next = content;
                if (patch.motd !== undefined) next = setTomlValue(next, '', 'motd', JSON.stringify(patch.motd));
                if (patch.maxPlayers !== undefined) next = setTomlValue(next, '', 'show-max-players', String(Math.max(1, Math.floor(Number(patch.maxPlayers)))));
                return next;
            }
            const doc = YAML.parseDocument(content);
            if (patch.motd !== undefined) doc.setIn(['listeners', 0, 'motd'], patch.motd);
            if (patch.maxPlayers !== undefined) doc.setIn(['listeners', 0, 'max_players'], Math.max(1, Math.floor(Number(patch.maxPlayers))));
            return doc.toString();
        });
        details.push('Updated the message of the day and player limit');
    }

    if (patch.defaultEntry !== undefined) {
        settings.defaultEntry = patch.defaultEntry || undefined;
        if (settings.type === 'velocity' && (await getNetworkSettings()).noFallback) {
            await editProxyConfig(ref, content => disableVelocityFallback(content, settings.defaultEntry));
        }
        details.push(settings.defaultEntry ? `Players without a host name are sent to ${settings.defaultEntry}` : 'Players without a host name are not sent anywhere');
    }

    if (patch.enabled !== undefined && patch.enabled !== settings.enabled) {
        settings.enabled = patch.enabled;
        resync = true;
        details.push(patch.enabled ? 'Proxy enabled' : 'Proxy disabled, servers leave it');
    }
    if (patch.priority !== undefined) settings.priority = Number(patch.priority) || 0;
    if (patch.publicHost !== undefined) settings.publicHost = patch.publicHost.trim() || undefined;

    if (patch.installPlugins && patch.installPlugins.length > 0) {
        details.push(...await installProxyPlugins(folder, settings.type, patch.installPlugins));
        restartRequired = true;
        resync = true;
    }

    // Memory and image live in the stack
    if ((patch.memory !== undefined || patch.image !== undefined || patch.pullImage) && settings.stackName) {
        const memory = patch.memory && /^\d+[MG]$/i.test(patch.memory) ? patch.memory.toUpperCase() : settings.memory;
        const image = patch.image?.trim() || settings.image || defaultProxyImage(settings.type);
        if (patch.pullImage || memory !== settings.memory || image !== settings.image) {
            const environmentId = await getEnvironmentId();
            const stack = await portainer.getStackByName(settings.stackName);
            if (!stack) throw new Error(`The stack ${settings.stackName} was not found in Portainer.`);
            const compose = proxyCompose({
                kind: settings.type, name: record.serverName, containerName: record.containerName ?? '', image, hostPort: record.port,
                hostFolder: getProxyAbsolutePath(`proxies/${record.uniqueId}`), networkName: settings.networkName, memory,
                udpPorts: settings.bedrockPort ? [settings.bedrockPort] : [],
            });
            await portainer.updateStack(stack.Id, compose, environmentId, true);
            settings.memory = memory;
            settings.image = image;
            details.push('Updated the stack and pulled the image');
        }
    } else if (patch.memory !== undefined || patch.image !== undefined || patch.pullImage) {
        details.push('This proxy was not created here, so its memory and image are changed where its container is defined');
    }

    await Server.updateOne({ _id: record._id }, { $set: { proxy: settings, ...(patch.name?.trim() ? { serverName: patch.name.trim().slice(0, 50) } : {}) } });

    if (resync) {
        const sync = await syncAllServers();
        details.push(`Updated ${sync.servers} server${sync.servers === 1 ? '' : 's'}`);
    } else if (patch.motd !== undefined || patch.maxPlayers !== undefined || patch.defaultEntry !== undefined) {
        const proxy = (await listProxies()).find(candidate => candidate.id === id);
        if (proxy) details.push(await reloadProxy(proxy));
    }
    return { proxyId: id, details, restartRequired };
}

/**
 * Removes a proxy. A proxy created here loses its stack; an adopted one only leaves the dashboard, its container
 * keeps running. The files stay in both cases. Servers behind it are moved to another proxy or get a warning.
 */
export async function deleteProxy(id: string): Promise<ProxyOperationResult> {
    const record = await Server.findOne({ uniqueId: id, kind: 'proxy' });
    if (!record) throw new Error('Proxy not found.');
    const settings = record.proxy as ProxySettings;
    const details: string[] = [];

    if (!record.imported && settings.stackName) {
        const environmentId = await getEnvironmentId();
        const stack = await portainer.getStackByName(settings.stackName);
        if (stack) {
            await portainer.deleteStack(stack.Id, environmentId);
            details.push(`Removed the stack ${settings.stackName}`);
        }
    } else {
        details.push('The container was not created here and keeps running');
    }
    await Server.deleteOne({ _id: record._id });

    const sync = await syncAllServers();
    details.push(`Updated ${sync.servers} server${sync.servers === 1 ? '' : 's'}; the files of the proxy were kept`);
    return { proxyId: id, details, restartRequired: false };
}

// ------------------------------------------------------------------------------ adoption

let adopting: Promise<string[]> | null = null;

interface Candidate {
    kind: ProxyKind;
    configPath: string;
    containerName?: string;
    networkName?: string;
    port?: number;
    evidence?: string[];
}

async function freeProxyPort(preferred: number | undefined): Promise<number> {
    const taken = new Set((await Server.find({}, 'port').lean<Array<{ port: number }>>()).map(entry => entry.port));
    if (preferred && preferred >= 1024 && !taken.has(preferred)) return preferred;
    for (let port = 25500; port <= 25564; port++) if (!taken.has(port)) return port;
    for (let port = 26000; port <= 26999; port++) if (!taken.has(port)) return port;
    throw new Error('No free port to give the proxy a record');
}

/**
 * Makes proxies that already exist (found in Docker, in the storage and import folders, or in the old
 * proxies.yaml) manageable like the ones created here. Does nothing for proxies that are known already.
 */
export function adoptExistingProxies(owner?: string, extra: ProxyFinding[] = []): Promise<string[]> {
    if (adopting && extra.length === 0) return adopting;
    adopting = (async () => {
        const details: string[] = [];
        const known = await Server.find({ kind: 'proxy' }, 'proxy containerName').lean<Array<{ proxy?: ProxySettings; containerName?: string }>>();
        const knownConfigs = new Set(known.map(record => record.proxy?.configPath));
        const knownContainers = new Set(known.map(record => record.containerName).filter(Boolean));

        let environmentId: number | undefined;
        try { environmentId = await getEnvironmentId(); } catch { /* adoption of folders still works */ }

        const candidates: Candidate[] = [];
        try {
            candidates.push(...await scanForProxies(environmentId, { force: extra.length > 0 }));
        } catch { /* nothing found */ }
        candidates.push(...extra);
        // proxies.yaml of earlier versions
        for (const definition of getDefinedProxies()) {
            if (!definition.configPath) continue;
            candidates.push({
                kind: definition.type, configPath: `${getServerBasePath()}/${definition.configPath}`.replace(/\/+/g, '/'),
                containerName: definition.host, networkName: definition.networkName, port: definition.port,
            });
        }

        let ownerEmail = owner;
        if (!ownerEmail) {
            const { default: User } = await import('@/lib/objects/User');
            ownerEmail = (await User.findOne({ isAdmin: true }, 'email').lean<{ email?: string } | null>())?.email;
        }

        for (const candidate of candidates) {
            if (knownConfigs.has(candidate.configPath) || (candidate.containerName && knownContainers.has(candidate.containerName))) continue;
            knownConfigs.add(candidate.configPath);
            if (candidate.containerName) knownContainers.add(candidate.containerName);

            try {
                const folder = candidate.configPath.slice(0, candidate.configPath.lastIndexOf('/')) || '/';
                const content = (await serverStorage.getFileContents(candidate.configPath)).toString('utf-8');
                const summary = candidate.kind === 'velocity' ? parseVelocityToml(content) : parseBungeeYaml(content);
                const idSuffix = crypto.createHash('sha1').update(candidate.configPath).digest('hex').slice(0, 8);
                const uniqueId = `px${idSuffix}`;
                const bind = 'bind' in summary ? summary.bind : summary.host;
                const bindPort = parseInt(bind.split(':').pop() ?? '', 10);
                const port = await freeProxyPort(candidate.port ?? (candidate.kind === 'velocity' ? bindPort : undefined));
                const name = candidate.containerName ?? `${candidate.kind}-${idSuffix}`;

                if (!ownerEmail) {
                    details.push(`Found ${name} but there is no administrator to own it yet`);
                    continue;
                }
                await Server.create({
                    uniqueId, email: ownerEmail, kind: 'proxy', imported: true,
                    proxy: {
                        type: candidate.kind, forwarding: summary.forwarding, enabled: true, priority: 0,
                        networkName: candidate.networkName ?? 'proxy-network', memory: '512M', configPath: candidate.configPath,
                        publicPort: candidate.port && candidate.port !== port ? candidate.port : undefined,
                    } satisfies ProxySettings,
                    subdomainName: `proxy-${idSuffix}.${getServerDomain()}`,
                    serverName: name, folderPath: folder, port, containerName: candidate.containerName,
                    environmentId: environmentId ?? 1, lastDeploymentStatus: 'success', isOnline: false,
                    importedFrom: { source: candidate.containerName ? 'docker' : 'folder' },
                    serverConfig: { name, serverType: candidate.kind, version: 'LATEST', motd: summary.motd },
                });
                details.push(`Added the existing ${candidate.kind} proxy ${name}${candidate.evidence?.length ? ` (found by: ${candidate.evidence.join(', ')})` : ''}`);
            } catch (error) {
                details.push(`Could not add ${candidate.configPath}: ${error instanceof Error ? error.message : 'unknown error'}`);
            }
        }
        if (details.length > 0) await syncAllServers({ environmentId }).catch(() => undefined);
        return details;
    })().finally(() => { adopting = null; });
    return adopting;
}

export async function inspectProxyById(id: string) {
    const record = await Server.findOne({ uniqueId: id, kind: 'proxy' });
    return record ? inspectProxy(proxyRefOf(record)) : null;
}

export { buildServerHostname };
