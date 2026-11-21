/**
 * Finds the addresses an existing server already has on a proxy: the forced hosts of the proxy entry that points
 * at it. An imported server takes its address from there. Without one it has no address until somebody sets it.
 */
import serverStorage from '@/lib/server/storage';
import Server from '@/lib/objects/Server';
import { getSubdomainLabel } from '@/lib/config/domain';
import { isUnassignedSubdomain, unassignedSubdomain } from '@/lib/server/subdomain';
import { scanForProxies } from './discovery';
import { parseBungeeYaml, parseVelocityToml } from './parse';

export interface ProxyEntries {
    configPath: string;
    /** Entry name to address (host:port) */
    servers: Record<string, string>;
    /** Host name to the entry names it leads to */
    forced: Record<string, string[]>;
}

/** Reads the server entries and forced hosts of every proxy this app can reach, registered or not */
export async function readProxyEntries(environmentId?: number): Promise<ProxyEntries[]> {
    const paths = new Set<string>();
    try {
        for (const finding of await scanForProxies(environmentId)) paths.add(finding.configPath);
    } catch {
        // folders and containers could not be searched; registered proxies still count
    }
    try {
        const registered = await Server.find({ kind: 'proxy' }, 'proxy.configPath').lean<Array<{ proxy?: { configPath?: string } }>>();
        for (const record of registered) if (record.proxy?.configPath) paths.add(record.proxy.configPath);
    } catch {
        // no database: nothing registered
    }

    const result: ProxyEntries[] = [];
    for (const configPath of paths) {
        try {
            const content = (await serverStorage.getFileContents(configPath)).toString('utf-8');
            if (/\.toml$/i.test(configPath)) {
                const summary = parseVelocityToml(content);
                result.push({ configPath, servers: summary.servers, forced: summary.forcedHosts });
            } else {
                const summary = parseBungeeYaml(content);
                result.push({ configPath, servers: summary.servers, forced: Object.fromEntries(Object.entries(summary.forcedHosts).map(([host, name]) => [host, [name]])) });
            }
        } catch {
            // unreadable or not a proxy file
        }
    }
    return result;
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const hostOf = (address: string) => address.split(':')[0].trim().toLowerCase();

/**
 * Host names the proxies already send to this server. An entry whose address is the container's name is the
 * server; failing that, an entry with the server's name.
 */
export function findForcedHosts(proxies: ProxyEntries[], target: { name: string; containerName?: string }): string[] {
    const hosts: string[] = [];
    const container = target.containerName?.toLowerCase();
    const name = target.name.toLowerCase();

    for (const proxy of proxies) {
        const entries = Object.entries(proxy.servers);
        const strong = container ? entries.filter(([, address]) => hostOf(address) === container) : [];
        const weak = entries.filter(([entry, address]) => hostOf(address) === name || squash(entry) === squash(target.name));
        const names = (strong.length > 0 ? strong : weak).map(([entry]) => entry);
        if (names.length === 0) continue;

        for (const [host, leadsTo] of Object.entries(proxy.forced)) {
            const lower = host.trim().toLowerCase();
            if (!lower || lower.includes('*') || hosts.includes(lower)) continue;
            if (leadsTo.some(entry => names.includes(entry))) hosts.push(lower);
        }
    }
    return hosts;
}

export interface ResolvedAddress {
    subdomainName: string;
    extraHostnames: string[];
    subdomainLabel: string;
    found: boolean;
}

/** Picks the address for an imported server from its forced hosts, skipping hosts another server already uses */
export async function resolveAddress(hosts: string[], ownId?: unknown): Promise<ResolvedAddress> {
    const free: string[] = [];
    for (const host of hosts) {
        const taken = await Server.exists({ subdomainName: host, ...(ownId ? { _id: { $ne: ownId } } : {}) });
        if (!taken) free.push(host);
    }
    if (free.length === 0) return { subdomainName: unassignedSubdomain(), extraHostnames: [], subdomainLabel: '', found: false };
    return { subdomainName: free[0], extraHostnames: free.slice(1), subdomainLabel: getSubdomainLabel(free[0]), found: true };
}

/**
 * Re-reads the addresses of imported servers whose address came from a guess (older imports named the host after
 * the server) or from a forced host. Addresses somebody chose by hand are left alone.
 */
export async function refreshImportedAddresses(environmentId?: number): Promise<string[]> {
    const servers = await Server.find({ imported: true, kind: { $ne: 'proxy' }, subdomainSource: { $in: [null, 'forced-host', 'guessed'] } });
    if (servers.length === 0) return [];
    const proxies = await readProxyEntries(environmentId);
    const notes: string[] = [];

    for (const server of servers) {
        const hosts = findForcedHosts(proxies, { name: server.serverName, containerName: server.containerName });
        const address = await resolveAddress(hosts, server._id);
        // A proxy that could not be read must not wipe an address that was read from it earlier
        if (!address.found && server.subdomainSource === 'forced-host') continue;
        const unchanged = server.subdomainName === address.subdomainName
            || (!address.found && isUnassignedSubdomain(server.subdomainName));
        if (unchanged && JSON.stringify(server.extraHostnames ?? []) === JSON.stringify(address.extraHostnames)) {
            if (server.subdomainSource !== (address.found ? 'forced-host' : 'guessed') && address.found) {
                await Server.updateOne({ _id: server._id }, { $set: { subdomainSource: 'forced-host' } });
            }
            continue;
        }

        await Server.updateOne({ _id: server._id }, {
            $set: {
                subdomainName: address.subdomainName,
                extraHostnames: address.extraHostnames,
                subdomainSource: address.found ? 'forced-host' : 'guessed',
                'serverConfig.subdomain': address.subdomainLabel,
            },
        });
        notes.push(address.found
            ? `${server.serverName}: address ${address.subdomainName} taken from the proxy`
            : `${server.serverName}: the proxies have no forced host for it, set an address on its page`);
    }
    return notes;
}
