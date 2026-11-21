/**
 * The proxy network: which proxies exist, which proxy a server joins, and keeping both sides configured.
 *
 * Proxies (Velocity, BungeeCord, Waterfall) are stored as records of kind `proxy`, so they get the same file
 * browser, console, logs and power controls as servers. A game server is linked to the proxies that fit its
 * Minecraft version; the link is written into the proxy's config, the server's own files are set up for the
 * forwarding mode, and a server that has no proxy to join gets a warning instead of a half working setup.
 */
import Server, { type IServer, type NetworkLink, type NetworkWarning } from '@/lib/objects/Server';
import NetworkSettings, { type INetworkSettings } from '@/lib/objects/NetworkSettings';
import portainer from '@/lib/server/portainer';
import velocityService from '@/lib/server/velocity';
import serverStorage from '@/lib/server/storage';
import { getContainerName } from '@/lib/server/containerNames';
import { getServerDomain } from '@/lib/config/domain';
import { isModdedType, isVelocityCompatible } from '@/lib/data/itzg';
import { applyBackendForwarding, installBungeeGuard, installViaPlugins } from './backend';
import { applyModdedSetup, installProxyAddon, setTomlKey, type ManagedFile } from './modded';
import {
    addServerToBungeeYaml, addServerToVelocityToml, disableVelocityFallback, parseEducationJoinOutput,
    removeServerFromBungeeYaml, removeServerFromVelocityToml, type EducationJoinInfo, type PluginFlags,
} from './parse';
import { editProxyConfig, inspectProxy, type ProxyInspection, type ProxyRef } from './proxyFiles';
import { chooseProxies, isPluginServer, type BalancingStrategy, type ForwardingMode, type ProxyKind, type RoutableProxy } from './versions';
import { mergeWarnings } from './warnings';
import { baseDomainOf, hostnameFor, identityIssues } from './identity';

export interface NetworkProxy extends RoutableProxy {
    name: string;
    kind: ProxyKind;
    containerName: string;
    networkName: string;
    /** Port players connect to */
    port: number;
    folder: string;
    configPath: string;
    publicHost: string;
    /** Subdomain in front of the server domain that the servers behind this proxy use */
    baseSubdomain?: string;
    /** Domain the servers behind this proxy are reached under: baseSubdomain.serverDomain, or the plain server domain */
    baseDomain: string;
    /** Why this proxy cannot be told apart from the others yet (shared base subdomain or port) */
    issues: string[];
    plugins: PluginFlags;
    bedrockPort?: number;
    motd: string;
    maxPlayers: number;
    /** Servers in the proxy's config: entry name to address */
    entries: Record<string, string>;
    readable: boolean;
    error?: string;
    defaultEntry?: string;
    imported: boolean;
    running: boolean;
    /** Forwarding secret or BungeeGuard token. Server side only, see toPublicProxy */
    secret?: string;
    linkedServers: number;
}

export type PublicProxy = Omit<NetworkProxy, 'secret'> & { hasSecret: boolean };

export function toPublicProxy(proxy: NetworkProxy): PublicProxy {
    const { secret, ...rest } = proxy;
    return { ...rest, hasSecret: Boolean(secret) };
}

export async function getNetworkSettings(): Promise<Pick<INetworkSettings, 'strategy' | 'noFallback' | 'mirrorViaPlugins'>> {
    try {
        const stored = await NetworkSettings.findOne({ key: 'network' }).lean<INetworkSettings | null>();
        return {
            strategy: (stored?.strategy ?? 'all') as BalancingStrategy,
            noFallback: stored?.noFallback !== false,
            mirrorViaPlugins: stored?.mirrorViaPlugins !== false,
        };
    } catch {
        return { strategy: 'all', noFallback: true, mirrorViaPlugins: true };
    }
}

export async function saveNetworkSettings(update: Partial<Pick<INetworkSettings, 'strategy' | 'noFallback' | 'mirrorViaPlugins'>>): Promise<void> {
    await NetworkSettings.updateOne({ key: 'network' }, { $set: update }, { upsert: true });
}

export async function getEnvironmentId(): Promise<number> {
    return portainer.getValidEnvironmentId(process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null);
}

function proxyRef(record: IServer): ProxyRef {
    return {
        uniqueId: record.uniqueId,
        serverName: record.serverName,
        containerName: getContainerName(record),
        folderPath: record.folderPath,
        port: record.port,
        proxy: record.proxy as NonNullable<IServer['proxy']>,
    };
}

async function describeProxy(record: IServer, linked: number, runningNames: Set<string>): Promise<NetworkProxy> {
    const ref = proxyRef(record);
    const settings = ref.proxy;
    let inspection: ProxyInspection;
    try {
        inspection = await inspectProxy(ref);
    } catch (error) {
        inspection = {
            readable: false, forwarding: settings.forwarding, plugins: { viaversion: false, viabackwards: false, viarewind: false, geyser: false, floodgate: false, edugeyser: false, bungeeguard: false },
            motd: '', maxPlayers: 0, bind: '', servers: {}, error: error instanceof Error ? error.message : 'unknown error',
        };
    }

    return {
        id: record.uniqueId,
        name: record.serverName,
        kind: settings.type,
        enabled: settings.enabled !== false,
        priority: settings.priority ?? 0,
        forwarding: inspection.forwarding,
        containerName: ref.containerName ?? getContainerName(record),
        networkName: settings.networkName,
        port: settings.publicPort ?? record.port,
        folder: record.folderPath,
        configPath: settings.configPath,
        publicHost: settings.publicHost || getServerDomain(),
        baseSubdomain: settings.baseSubdomain || undefined,
        baseDomain: baseDomainOf(settings.baseSubdomain || undefined, getServerDomain()),
        issues: [],
        plugins: inspection.plugins,
        bedrockPort: inspection.bedrockPort,
        motd: inspection.motd,
        maxPlayers: inspection.maxPlayers,
        entries: inspection.servers,
        readable: inspection.readable,
        error: inspection.error,
        defaultEntry: settings.defaultEntry,
        imported: record.imported === true,
        running: runningNames.has(ref.containerName ?? ''),
        secret: inspection.secret,
        linkedServers: linked,
    };
}

/** Every proxy of the network with what its files say it is set up as */
export async function listProxies(): Promise<NetworkProxy[]> {
    const [records, servers] = await Promise.all([
        Server.find({ kind: 'proxy' }),
        Server.find({ kind: { $ne: 'proxy' } }, 'network'),
    ]);
    if (records.length === 0) return [];

    const counts = new Map<string, number>();
    for (const server of servers) {
        for (const link of (server.network?.links ?? []) as NetworkLink[]) {
            counts.set(link.proxyId, (counts.get(link.proxyId) ?? 0) + 1);
        }
    }

    const runningNames = new Set<string>();
    try {
        const containers = await portainer.getContainers(await getEnvironmentId());
        for (const container of containers) {
            if (container.State === 'running') container.Names.forEach(name => runningNames.add(name.replace(/^\//, '')));
        }
    } catch {
        // Docker not reachable: running state stays unknown (false)
    }

    const described = await Promise.all(records.map(record => describeProxy(record, counts.get(record.uniqueId) ?? 0, runningNames)));
    const issues = identityIssues(described.map(proxy => ({ id: proxy.id, name: proxy.name, baseSubdomain: proxy.baseSubdomain, port: proxy.port })));
    return described.map(proxy => ({ ...proxy, issues: issues.get(proxy.id) ?? [] }));
}

export async function getProxy(id: string): Promise<NetworkProxy | undefined> {
    return (await listProxies()).find(proxy => proxy.id === id);
}

// ---------------------------------------------------------------------------- reloading

/** Makes a running proxy read its configuration again without disconnecting players when it can */
export async function reloadProxy(proxy: Pick<NetworkProxy, 'kind' | 'containerName' | 'name'>, environmentId?: number): Promise<string> {
    try {
        const envId = environmentId ?? await getEnvironmentId();
        const container = await portainer.getContainerByIdentifier(proxy.containerName, envId);
        if (!container || container.State !== 'running') return `${proxy.name} is not running, it reads the configuration when it starts`;

        if (proxy.kind === 'velocity') {
            const result = await velocityService.reloadVelocity(container.Id, envId);
            return `${proxy.name}: ${result.details.join('. ')}`;
        }

        const sent = await velocityService.sendConsoleCommand(container.Id, 'greload', envId);
        if (sent.sent) return `${proxy.name} reloaded its configuration`;
        return `${proxy.name} could not be reloaded (${sent.error}). Restart it to apply the changes`;
    } catch (error) {
        return `${proxy.name} could not be reloaded: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
}

// ----------------------------------------------------------------------------- linking

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Name of the server inside proxy configs: letters, digits, dash and underscore only */
export function entryNameFor(server: Pick<IServer, 'uniqueId' | 'serverName'>): string {
    return slug(server.serverName) || `server-${server.uniqueId.slice(0, 8)}`;
}

/** Port the server listens on inside its container */
async function internalPort(server: IServer): Promise<number> {
    if (!server.imported) return 25565;
    try {
        const text = (await serverStorage.getFileContents(`${server.folderPath}/server.properties`)).toString('utf-8');
        const match = text.match(/^\s*server-port\s*=\s*(\d+)/m);
        if (match) return parseInt(match[1], 10);
    } catch {
        // fall back to the default
    }
    return 25565;
}

/** Host names players join the server with */
export function hostnamesFor(server: Pick<IServer, 'subdomainName'>, proxy?: Pick<NetworkProxy, 'baseDomain'>): string[] {
    const host = hostnameFor(server.subdomainName, proxy?.baseDomain ?? getServerDomain());
    return host ? [host] : [];
}

export interface SyncOptions {
    /** Tell the proxies to read their configuration. Turn off when several servers are synced in a row */
    reload?: boolean;
    /** Restart the server when its files changed and it is running */
    restart?: boolean;
    environmentId?: number;
}

export interface SyncResult {
    linked: string[];
    forwarding: ForwardingMode | null;
    warnings: NetworkWarning[];
    details: string[];
    /** The server has to restart before it uses the new settings */
    restartNeeded: boolean;
    /** Proxies that were changed and still have to be reloaded when `reload` was off */
    changedProxies: string[];
}


interface ProxyPick {
    chosen: NetworkProxy[];
    forwarding: ForwardingMode | null;
    concerns: Array<{ code: NetworkWarning['code']; port?: number; detail?: string }>;
    details: string[];
}

/**
 * Which proxies a server of this version and type joins, and why not when it joins none. Servers behind several
 * proxies need one shared key, so proxies with another key are left out; a proxy without a key cannot be used.
 */
export function pickProxies(proxies: NetworkProxy[], version: string, type: string, strategy: BalancingStrategy, port: number): ProxyPick {
    const concerns: ProxyPick['concerns'] = [];
    const details: string[] = [];
    // The forwarding mods of Forge, NeoForge, Fabric and Quilt only speak Velocity's modern forwarding
    const usable = isModdedType(type) ? proxies.filter(proxy => proxy.forwarding === 'modern') : proxies;
    let decision = chooseProxies(usable, version, strategy);

    if (type && !isVelocityCompatible(type) && decision.proxies.length > 0) {
        concerns.push({ code: 'unsupported-type', port, detail: type });
        decision = { proxies: [], forwarding: null, reason: 'This kind of server cannot sit behind a proxy.' };
    } else if (decision.proxies.length === 0) {
        if (isModdedType(type) && proxies.length > 0 && usable.length === 0) {
            concerns.push({ code: 'unsupported-type', port, detail: `${type} needs a Velocity proxy with modern forwarding` });
        } else {
            concerns.push({ code: proxies.length === 0 ? 'no-proxy' : 'unsupported-version', port, detail: proxies.length === 0 ? undefined : version });
        }
    }

    let chosen = decision.proxies;
    const forwarding = decision.forwarding;
    if (forwarding === 'modern' || forwarding === 'bungeeguard') {
        const withKey = chosen.filter(proxy => proxy.secret);
        if (withKey.length === 0) {
            concerns.push({ code: 'no-secret', port, detail: chosen.map(proxy => proxy.name).join(', ') });
            chosen = [];
        } else if (forwarding === 'modern') {
            const secret = withKey[0].secret;
            const sameKey = withKey.filter(proxy => proxy.secret === secret);
            if (sameKey.length < withKey.length) details.push('Some proxies use a different forwarding secret than the first one and were left out. Give them the same secret in the admin panel');
            chosen = sameKey;
        } else {
            chosen = withKey;
        }
    }
    return { chosen, forwarding: chosen.length > 0 ? forwarding : null, concerns, details };
}

/** Forwarding mode and Docker networks a server will have, worked out before its container is created */
export async function planServerNetwork(server: Pick<IServer, 'serverConfig' | 'port' | 'network'>): Promise<{ forwarding: ForwardingMode | null; networks: string[] }> {
    const settings = await getNetworkSettings();
    const proxies = (await listProxies()).filter(proxy => proxy.enabled);
    const picked = pickProxies(proxies, String(server.serverConfig?.version ?? 'LATEST'), String(server.serverConfig?.serverType ?? ''), settings.strategy, server.port);
    return { forwarding: picked.forwarding, networks: picked.chosen.map(proxy => proxy.networkName) };
}

/** Entries of a proxy that lead to this container, whatever they are called. Older versions named them differently */
function entriesFor(proxy: Pick<NetworkProxy, 'entries'>, containerName: string): string[] {
    return Object.entries(proxy.entries)
        .filter(([, address]) => address.split(':')[0] === containerName)
        .map(([name]) => name);
}

async function removeEntry(proxy: NetworkProxy, entryName: string): Promise<void> {
    const ref = { uniqueId: proxy.id, serverName: proxy.name, folderPath: proxy.folder, port: proxy.port, proxy: { type: proxy.kind, configPath: proxy.configPath } } as ProxyRef;
    await editProxyConfig(ref, content => proxy.kind === 'velocity'
        ? removeServerFromVelocityToml(content, entryName)
        : removeServerFromBungeeYaml(content, entryName));
}

/**
 * Connects a game server to the proxies that fit it: picks them, adds the server to their config, sets the server
 * up for the forwarding mode and records what was done, and what could not be done, on the server.
 * Safe to run again at any time; it is also how a server is moved when a proxy appears, changes or disappears.
 */
export async function syncServerNetwork(server: IServer, options: SyncOptions = {}): Promise<SyncResult> {
    const details: string[] = [];
    const settings = await getNetworkSettings();
    const proxies = (await listProxies()).filter(proxy => proxy.enabled);
    // Servers moving between proxies do not count against the proxy they are leaving
    const adjusted = proxies.map(proxy => ({
        ...proxy,
        linkedServers: Math.max(0, proxy.linkedServers - ((server.network?.links ?? []) as NetworkLink[]).filter(link => link.proxyId === proxy.id).length),
    }));

    const version = String(server.serverConfig?.version ?? 'LATEST');
    const type = String(server.serverConfig?.serverType ?? '');
    const concerns: Array<{ code: NetworkWarning['code']; port?: number; detail?: string }> = [];
    const previousLinks = (server.network?.links ?? []) as NetworkLink[];
    const entryName = previousLinks[0]?.entryName ?? entryNameFor(server);
    const port = server.port;

    const picked = pickProxies(adjusted, version, type, settings.strategy, port);
    const chosen = picked.chosen;
    const forwarding = picked.forwarding;
    concerns.push(...picked.concerns);
    details.push(...picked.details);

    const address = `${getContainerName(server)}:${await internalPort(server)}`;
    const links: NetworkLink[] = [];
    const changed = new Set<string>();

    // Leave proxies that no longer fit
    for (const link of previousLinks) {
        if (chosen.some(proxy => proxy.id === link.proxyId)) continue;
        const proxy = proxies.find(candidate => candidate.id === link.proxyId) ?? (await getProxy(link.proxyId));
        if (!proxy) continue;
        try {
            await removeEntry(proxy, link.entryName);
            changed.add(proxy.id);
            details.push(`Removed from ${proxy.name}`);
        } catch (error) {
            details.push(`Could not remove the server from ${proxy.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }

    // Join the proxies that fit
    for (const proxy of chosen) {
        const ref = { uniqueId: proxy.id, serverName: proxy.name, folderPath: proxy.folder, port: proxy.port, proxy: { type: proxy.kind, configPath: proxy.configPath } } as ProxyRef;
        try {
            const stale = entriesFor(proxy, getContainerName(server)).filter(name => name !== entryName);
            await editProxyConfig(ref, content => {
                const entry = { name: entryName, address, hostnames: hostnamesFor(server, proxy) };
                // Entries of this server under an older name are replaced by the current one
                let cleaned = content;
                for (const old of stale) cleaned = proxy.kind === 'velocity' ? removeServerFromVelocityToml(cleaned, old) : removeServerFromBungeeYaml(cleaned, old);
                let next = proxy.kind === 'velocity' ? addServerToVelocityToml(cleaned, entry) : addServerToBungeeYaml(cleaned, entry);
                if (proxy.kind === 'velocity' && settings.noFallback) next = disableVelocityFallback(next, proxy.defaultEntry);
                return next;
            });
            changed.add(proxy.id);
            links.push({ proxyId: proxy.id, proxyName: proxy.name, entryName, networkName: proxy.networkName, forwarding: proxy.forwarding, linkedAt: previousLinks.find(link => link.proxyId === proxy.id)?.linkedAt ?? new Date() });
            details.push(`Added to ${proxy.name}`);

            // The server has to be on the proxy's Docker network to be reached by name
            try {
                const envId = options.environmentId ?? await getEnvironmentId();
                const container = await portainer.getContainerByIdentifier(getContainerName(server), envId);
                if (container) {
                    const result = await portainer.connectContainerToNetwork(container.Id, proxy.networkName, envId);
                    if (result === 'connected') details.push(`Connected the server container to the ${proxy.networkName} network`);
                }
            } catch (error) {
                details.push(`Could not connect the server to the ${proxy.networkName} network: ${error instanceof Error ? error.message : 'unknown error'}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            details.push(`Could not add the server to ${proxy.name}: ${message}`);
            concerns.push({ code: 'link-failed', port, detail: `${proxy.name}: ${message}` });
        }
    }

    // Set the server up for the way the proxy forwards players
    let restartNeeded = false;
    let managedFiles: ManagedFile[] | undefined;
    const proxiesToRestart = new Set<string>();
    if (links.length > 0 && forwarding) {
        const secret = chosen[0]?.secret;
        const tokens = chosen.map(proxy => proxy.secret).filter((value): value is string => Boolean(value));
        const result = await applyBackendForwarding({ folder: server.folderPath, forwarding, secret, tokens, version, type });
        details.push(...result.details);
        restartNeeded = result.restartNeeded;
        if (result.missing.length > 0) details.push(`Not created yet, applied at the next sync after the first start: ${result.missing.join(', ')}`);

        if (forwarding === 'bungeeguard') details.push(await installBungeeGuard(server.folderPath));

        // Mod loaders get their forwarding mod, and the proxy what the loader needs on its side
        if (isModdedType(type)) {
            const modded = await applyModdedSetup({ folder: server.folderPath, type, version, secret });
            details.push(...modded.details);
            if (modded.restartNeeded) restartNeeded = true;
            if (modded.managed.length > 0) {
                const known = (server.managedFiles ?? []).filter(entry => !modded.managed.some(next => next.path === entry.path));
                managedFiles = [...known, ...modded.managed];
            }
            for (const proxy of chosen.filter(candidate => candidate.kind === 'velocity')) {
                if (modded.needsAmbassador) {
                    const added = await installProxyAddon(proxy.folder, 'ambassador', ['ambassador'], details);
                    if (added) {
                        proxiesToRestart.add(proxy.id);
                        details.push(`${proxy.name} restarts to load Ambassador, which Forge ${version} players need to join`);
                    }
                }
                if (modded.announceForge) {
                    const ref = { uniqueId: proxy.id, serverName: proxy.name, folderPath: proxy.folder, port: proxy.port, proxy: { type: proxy.kind, configPath: proxy.configPath } } as ProxyRef;
                    await editProxyConfig(ref, content => setTomlKey(content, null, 'announce-forge', true)).then(() => changed.add(proxy.id)).catch(() => undefined);
                }
            }
        }

        if (settings.mirrorViaPlugins && isPluginServer(type)) {
            const merged: PluginFlags = { viaversion: false, viabackwards: false, viarewind: false, geyser: false, floodgate: false, edugeyser: false, bungeeguard: false };
            for (const proxy of chosen) {
                (Object.keys(merged) as Array<keyof PluginFlags>).forEach(key => { merged[key] = merged[key] || proxy.plugins[key]; });
            }
            const via = await installViaPlugins(server.folderPath, merged, version);
            details.push(...via);
            if (via.some(line => /installed \(/.test(line))) restartNeeded = true;
        }
    }

    // Plugins are only loaded when the proxy starts
    for (const id of proxiesToRestart) {
        const proxy = proxies.find(candidate => candidate.id === id);
        if (!proxy) continue;
        try {
            const envId = options.environmentId ?? await getEnvironmentId();
            const container = await portainer.getContainerByIdentifier(proxy.containerName, envId);
            if (container?.State === 'running') await portainer.restartContainer(container.Id, envId, 30);
            changed.delete(id);
        } catch (error) {
            details.push(`Could not restart ${proxy.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }

    // Tell the proxies, once each
    if (options.reload !== false) {
        for (const id of changed) {
            const proxy = proxies.find(candidate => candidate.id === id) ?? (await getProxy(id));
            if (proxy) details.push(await reloadProxy(proxy, options.environmentId));
        }
    }

    const warnings = mergeWarnings(server.network?.warnings as NetworkWarning[] | undefined, concerns);
    await Server.updateOne({ _id: server._id }, {
        $set: {
            network: { links, warnings, forwarding: links.length > 0 ? forwarding ?? undefined : 'none', syncedAt: new Date() },
            proxyIds: links.map(link => link.proxyId),
            ...(managedFiles ? { managedFiles } : {}),
        },
    });

    if (restartNeeded && options.restart) {
        try {
            const envId = options.environmentId ?? await getEnvironmentId();
            const container = await portainer.getContainerByIdentifier(getContainerName(server), envId);
            if (container?.State === 'running') {
                await portainer.restartContainer(container.Id, envId, 30);
                details.push('Restarted the server to apply the network settings');
                restartNeeded = false;
            }
        } catch (error) {
            details.push(`Could not restart the server: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }

    return { linked: links.map(link => link.proxyId), forwarding: links.length > 0 ? forwarding : null, warnings, details, restartNeeded, changedProxies: [...changed] };
}

/** Takes a server out of every proxy it is in, for example before it is deleted */
export async function unlinkServerFromNetwork(server: IServer, options: { reload?: boolean; environmentId?: number } = {}): Promise<string[]> {
    const details: string[] = [];
    const links = (server.network?.links ?? []) as NetworkLink[];
    const proxies = await listProxies();

    for (const proxy of proxies) {
        const names = new Set([...links.filter(link => link.proxyId === proxy.id).map(link => link.entryName), ...entriesFor(proxy, getContainerName(server))]);
        if (names.size === 0) continue;
        try {
            for (const name of names) await removeEntry(proxy, name);
            details.push(`Removed from ${proxy.name}`);
            if (options.reload !== false) details.push(await reloadProxy(proxy, options.environmentId));
        } catch (error) {
            details.push(`Could not remove the server from ${proxy.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    await Server.updateOne({ _id: server._id }, { $set: { network: { links: [], warnings: (server.network?.warnings ?? []) as NetworkWarning[] }, proxyIds: [] } });
    return details;
}

/** Runs the sync for every game server, one proxy reload at the end. Used when proxies are added or changed */
export async function syncAllServers(options: { environmentId?: number } = {}): Promise<{ servers: number; details: string[] }> {
    const servers = await Server.find({ kind: { $ne: 'proxy' } });
    const details: string[] = [];
    const changed = new Set<string>();

    for (const server of servers) {
        try {
            const result = await syncServerNetwork(server, { reload: false, environmentId: options.environmentId });
            result.changedProxies.forEach(id => changed.add(id));
            details.push(`${server.serverName}: ${result.linked.length > 0 ? `linked to ${result.linked.length} prox${result.linked.length === 1 ? 'y' : 'ies'}` : 'no proxy'}`);
        } catch (error) {
            details.push(`${server.serverName}: ${error instanceof Error ? error.message : 'sync failed'}`);
        }
    }

    const proxies = await listProxies();
    for (const id of changed) {
        const proxy = proxies.find(candidate => candidate.id === id);
        if (proxy) details.push(await reloadProxy(proxy, options.environmentId));
    }
    return { servers: servers.length, details };
}

// ------------------------------------------------------------------------- what players see

export interface JoinAddress {
    proxyId: string;
    proxyName: string;
    kind: ProxyKind;
    forwarding: ForwardingMode;
    java: string;
    bedrock?: { host: string; port: number };
    edugeyser: boolean;
}

export function javaAddress(host: string, port: number): string {
    return port === 25565 ? host : `${host}:${port}`;
}

/** How players join a server through each proxy it is linked to */
export async function getJoinAddresses(server: Pick<IServer, 'subdomainName' | 'network'>): Promise<JoinAddress[]> {
    const links = (server.network?.links ?? []) as NetworkLink[];
    if (links.length === 0) return [];
    const proxies = await listProxies();

    return links.flatMap(link => {
        const proxy = proxies.find(candidate => candidate.id === link.proxyId);
        if (!proxy) return [];
        const [hostname] = hostnamesFor(server, proxy);
        return [{
            proxyId: proxy.id,
            proxyName: proxy.name,
            kind: proxy.kind,
            forwarding: proxy.forwarding,
            java: javaAddress(hostname ?? proxy.publicHost, proxy.port),
            bedrock: proxy.plugins.geyser && proxy.bedrockPort ? { host: proxy.publicHost, port: proxy.bedrockPort } : undefined,
            edugeyser: proxy.plugins.edugeyser,
        }];
    });
}

const educationCache = new Map<string, { at: number; info: EducationJoinInfo }>();

/**
 * Asks EduGeyser for its join codes. The codes are not stored in a readable file, only `/edu joincode` prints
 * them, so the command is sent to the proxy console and the answer is read from its log.
 */
export async function readEducationJoin(proxy: NetworkProxy, force = false): Promise<EducationJoinInfo & { error?: string }> {
    const cached = educationCache.get(proxy.id);
    if (!force && cached && Date.now() - cached.at < 60_000) return cached.info;
    if (!proxy.plugins.edugeyser) return { links: [], lines: [], error: 'This proxy does not run EduGeyser' };

    try {
        const envId = await getEnvironmentId();
        const container = await portainer.getContainerByIdentifier(proxy.containerName, envId);
        if (!container || container.State !== 'running') return { links: [], lines: [], error: 'The proxy is not running' };

        const sent = await velocityService.sendConsoleCommand(container.Id, 'edu joincode', envId);
        if (!sent.sent) return { links: [], lines: [], error: sent.error };
        await new Promise(resolve => setTimeout(resolve, 2000));
        const logs = await portainer.getContainerLogs(container.Id, envId, 80);
        const info = parseEducationJoinOutput(logs);
        educationCache.set(proxy.id, { at: Date.now(), info });
        return info;
    } catch (error) {
        return { links: [], lines: [], error: error instanceof Error ? error.message : 'unknown error' };
    }
}
