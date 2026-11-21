/**
 * Rules that decide which proxy a server joins. Everything here is pure so it can be tested without Docker.
 *
 * A proxy forwards the real identity of a player to the server behind it. How it does that decides which servers
 * it can serve:
 *   modern      Velocity only, needs a server of 1.13 or newer and a shared secret
 *   bungeeguard BungeeCord style forwarding with a token, any version
 *   legacy      BungeeCord style forwarding, any version, nothing stops other people from connecting directly
 *   none        no forwarding, players are not identified
 */
import { compareMinecraftVersions } from '@/lib/data/itzg/versions';

export type ProxyKind = 'velocity' | 'bungeecord' | 'waterfall';
export type ForwardingMode = 'modern' | 'bungeeguard' | 'legacy' | 'none';
export type BalancingStrategy = 'all' | 'balanced' | 'priority';

export const FORWARDING_MODES: ForwardingMode[] = ['modern', 'bungeeguard', 'legacy', 'none'];

/** Higher is more modern and more secure */
export const FORWARDING_RANK: Record<ForwardingMode, number> = { modern: 3, bungeeguard: 2, legacy: 1, none: 0 };

/** Oldest server version that a forwarding mode works with. Modern forwarding only exists since 1.13 */
export const MODERN_FORWARDING_MIN_VERSION = '1.13';

export function isForwardingMode(value: unknown): value is ForwardingMode {
    return typeof value === 'string' && (FORWARDING_MODES as string[]).includes(value);
}

/** Forwarding modes a proxy type can use. Only Velocity has modern forwarding */
export function forwardingModesFor(kind: ProxyKind): ForwardingMode[] {
    return kind === 'velocity' ? ['modern', 'bungeeguard', 'legacy'] : ['bungeeguard', 'legacy'];
}

export function forwardingMinVersion(mode: ForwardingMode): string | null {
    return mode === 'modern' ? MODERN_FORWARDING_MIN_VERSION : null;
}

/** True when a server of this version can sit behind a proxy that forwards this way */
export function forwardingSupportsVersion(mode: ForwardingMode, version: string | undefined | null): boolean {
    const minimum = forwardingMinVersion(mode);
    return minimum === null || compareMinecraftVersions(version, minimum) >= 0;
}

/** What the routing rules need to know about a proxy */
export interface RoutableProxy {
    id: string;
    enabled: boolean;
    forwarding: ForwardingMode;
    /** Servers that are linked to it already, used to spread new servers */
    linkedServers?: number;
    /** Higher goes first when the strategy is `priority` */
    priority?: number;
}

export function proxiesForVersion<T extends RoutableProxy>(proxies: T[], version: string | undefined | null): T[] {
    return proxies.filter(proxy => proxy.enabled && forwardingSupportsVersion(proxy.forwarding, version));
}

export interface RouteDecision<T extends RoutableProxy> {
    proxies: T[];
    /** The forwarding mode the server is set up for. Null when there is no proxy to join */
    forwarding: ForwardingMode | null;
    reason: string;
}

/**
 * Picks the proxies a server of this version is added to.
 *
 * The most modern forwarding mode that supports the version wins: a 1.20 server goes to the modern proxy, a 1.12
 * server to the BungeeGuard or legacy one. Among proxies of the same kind the strategy decides:
 *   all       every proxy of that kind gets the server (every instance can be used to join)
 *   balanced  the proxy with the fewest servers gets it, so servers spread out over the instances
 *   priority  the proxy with the highest priority gets it
 */
export function chooseProxies<T extends RoutableProxy>(
    proxies: T[],
    version: string | undefined | null,
    strategy: BalancingStrategy = 'all'
): RouteDecision<T> {
    const candidates = proxiesForVersion(proxies, version);
    if (candidates.length === 0) {
        const enabled = proxies.filter(proxy => proxy.enabled);
        return {
            proxies: [],
            forwarding: null,
            reason: enabled.length === 0
                ? 'There is no proxy to join.'
                : 'None of the proxies supports this Minecraft version.',
        };
    }

    const bestRank = Math.max(...candidates.map(proxy => FORWARDING_RANK[proxy.forwarding]));
    const best = candidates.filter(proxy => FORWARDING_RANK[proxy.forwarding] === bestRank);
    const forwarding = best[0].forwarding;

    let chosen: T[];
    if (strategy === 'all') {
        chosen = best;
    } else if (strategy === 'priority') {
        const top = Math.max(...best.map(proxy => proxy.priority ?? 0));
        chosen = [best.find(proxy => (proxy.priority ?? 0) === top) as T];
    } else {
        const fewest = Math.min(...best.map(proxy => proxy.linkedServers ?? 0));
        chosen = [best.find(proxy => (proxy.linkedServers ?? 0) === fewest) as T];
    }

    return { proxies: chosen, forwarding, reason: `Joins ${chosen.length} ${forwarding} forwarding prox${chosen.length === 1 ? 'y' : 'ies'}.` };
}

export interface VersionAllowance {
    allowed: boolean;
    /** Oldest version that can be chosen, null when every version works */
    minVersion: string | null;
    reason?: string;
}

/**
 * Which versions a new server may use. With no proxy at all every version is allowed (the server then gets a
 * warning); with proxies, a version has to be supported by at least one of them. A network that only has a
 * modern forwarding Velocity therefore stops at 1.13, while one with BungeeGuard or legacy forwarding takes everything.
 */
export function versionAllowance(proxies: RoutableProxy[], version: string | undefined | null): VersionAllowance {
    const enabled = proxies.filter(proxy => proxy.enabled);
    if (enabled.length === 0) return { allowed: true, minVersion: null };

    const minVersion = enabled.some(proxy => forwardingMinVersion(proxy.forwarding) === null) ? null : MODERN_FORWARDING_MIN_VERSION;
    const allowed = proxiesForVersion(enabled, version).length > 0;
    return {
        allowed,
        minVersion,
        reason: allowed ? undefined : `The proxy network only accepts servers from ${minVersion} on. Ask an administrator to add a BungeeGuard or legacy forwarding proxy for older versions.`,
    };
}

/** Plugin that backs up a version of the client can join with. Used to decide whether Via plugins make sense */
export function isPluginServer(type: string | undefined | null): boolean {
    return ['paper', 'folia', 'purpur', 'pufferfish', 'leaf', 'spigot', 'bukkit', 'craftbukkit'].includes((type ?? '').toLowerCase());
}
