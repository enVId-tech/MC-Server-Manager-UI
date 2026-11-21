/**
 * Live numbers of a running server: how many players are on it and what it uses.
 *
 * Players are asked from the server itself (a status ping with `mc-monitor`, which every itzg image has, and does
 * not write anything to the log), then through RCON, and only when both fail are they counted from the log of the
 * current run. Resources come from Docker's stats; the CPU needs two samples, and the memory that Docker counts as
 * "cache" is not memory that the server uses, so it is subtracted the way `docker stats` does.
 */
import portainer from '@/lib/server/portainer';

export interface PlayerCount {
    online: number;
    max: number | null;
    names: string[] | null;
    /** How it was found */
    source: 'ping' | 'rcon' | 'log' | 'none';
}

export interface UsageNumbers {
    cpuPercent: number;
    memoryMB: number;
    memoryLimitMB: number;
    memoryPercent: number;
    networkRxMB: number;
    networkTxMB: number;
}

interface DockerStats {
    memory_stats?: { usage?: number; limit?: number; stats?: Record<string, number> };
    cpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number; online_cpus?: number };
    precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
    networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
}

/** The text of an exec without the 8 byte frames of Docker's stream, colour codes and control characters */
export function cleanExecOutput(text: string): string {
    return text
        .replace(/[\u0001\u0002]\u0000{6}[\s\S]/g, '')
        .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
        .replace(/§[0-9a-fk-or]/gi, '')
        .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
        .trim();
}

/** `mc-monitor status` prints `host:port : version=... online=2 max=20 motd='...'` */
export function parsePing(output: string): { online: number; max: number } | null {
    const match = /online=(\d+)\s+max=(\d+)/i.exec(output);
    return match ? { online: Number(match[1]), max: Number(match[2]) } : null;
}

/** The answer to `list`: "There are 2 of a max of 20 players online: A, B" (older: "There are 2/20 players online:") */
export function parseList(output: string): { online: number; max: number; names: string[] } | null {
    const match = /There are (\d+)(?: of a max of |\/)(\d+) players online:?\s*(.*)/i.exec(output);
    if (!match) return null;
    const names = match[3].split(/[,\s]+/).map(name => name.trim()).filter(name => /^[.*A-Za-z0-9_]{1,17}$/.test(name));
    return { online: Number(match[1]), max: Number(match[2]), names };
}

/**
 * Players of the current run from a log: joins and leaves since the server last started. A proxy writes
 * "Name (/ip:port) has connected" and "has disconnected" instead.
 */
export function playersFromLog(log: string): string[] {
    const online = new Set<string>();
    for (const raw of log.split('\n')) {
        const line = raw.replace(/\u001b\[[0-9;]*m/g, '');
        if (/Starting minecraft server version|Starting Velocity|Listening on \/|\[Server thread\/INFO\]: Starting Minecraft server on/i.test(line)) online.clear();
        const joined = /(?:\]: |^|\s)([.*A-Za-z0-9_]{1,17}) joined the game/.exec(line) ?? /([.*A-Za-z0-9_]{1,17}) \(\/[^)]*\) has connected/.exec(line);
        if (joined) { online.add(joined[1]); continue; }
        const left = /(?:\]: |^|\s)([.*A-Za-z0-9_]{1,17}) left the game/.exec(line) ?? /([.*A-Za-z0-9_]{1,17}) \(\/[^)]*\) has disconnected/.exec(line);
        if (left) online.delete(left[1]);
    }
    return [...online];
}

/** The CPU in percent of one core, as `docker stats` shows it (a server on 2 cores can show up to 200) */
export function cpuPercent(current: DockerStats, previous: DockerStats | undefined): number {
    const now = current.cpu_stats;
    const before = previous?.cpu_stats ?? current.precpu_stats;
    // An empty earlier sample (all zero) would make the whole run since boot look like the last second
    if (!before?.system_cpu_usage || !before?.cpu_usage?.total_usage) return 0;
    const used = (now?.cpu_usage?.total_usage ?? 0) - (before?.cpu_usage?.total_usage ?? 0);
    const system = (now?.system_cpu_usage ?? 0) - (before?.system_cpu_usage ?? 0);
    if (!(used > 0) || !(system > 0)) return 0;
    const cores = now?.online_cpus || 1;
    return Math.round((used / system) * cores * 1000) / 10;
}

/** Memory that the processes use: Docker's usage without the file cache (cgroup v1: cache, v2: inactive_file) */
export function memoryUsed(stats: DockerStats): number {
    const usage = stats.memory_stats?.usage ?? 0;
    const detail = stats.memory_stats?.stats ?? {};
    const cache = detail.inactive_file ?? detail.total_inactive_file ?? detail.cache ?? 0;
    return Math.max(0, usage - (cache < usage ? cache : 0));
}

export function usageFromStats(current: DockerStats, previous: DockerStats | undefined, limitBytes: number): UsageNumbers {
    const used = memoryUsed(current);
    const reported = current.memory_stats?.limit ?? 0;
    // A container without a limit reports the memory of the whole machine; the configured limit is what counts
    const limit = limitBytes > 0 ? limitBytes : reported;
    let rx = 0;
    let tx = 0;
    for (const network of Object.values(current.networks ?? {})) {
        rx += network.rx_bytes ?? 0;
        tx += network.tx_bytes ?? 0;
    }
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    return {
        cpuPercent: cpuPercent(current, previous),
        memoryMB: mb(used),
        memoryLimitMB: mb(limit),
        memoryPercent: limit > 0 ? Math.min(100, Math.round((used / limit) * 1000) / 10) : 0,
        networkRxMB: Math.round((rx / 1024 / 1024) * 100) / 100,
        networkTxMB: Math.round((tx / 1024 / 1024) * 100) / 100,
    };
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Remembers answers for a few seconds so that a dashboard that is open in several tabs does not ask Docker for each */
const cache = new Map<string, { at: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const running = pending.get(key);
    if (running) return running as Promise<T>;
    const promise = load()
        .then(value => { cache.set(key, { at: Date.now(), value }); return value; })
        .finally(() => { pending.delete(key); });
    pending.set(key, promise);
    return promise;
}

export function forgetLiveStats(containerId: string): void {
    for (const key of [...cache.keys()]) if (key.includes(containerId)) cache.delete(key);
}

async function exec(containerId: string, environmentId: number, command: string): Promise<{ output: string; exitCode: number }> {
    const result = await portainer.executeCommand(containerId, command, environmentId);
    return { output: cleanExecOutput(String(result.output ?? '')), exitCode: result.exitCode };
}

/** Players of a container. `names` is only filled when the way of asking gives them (RCON and the log do). */
export function getPlayers(containerId: string, environmentId: number, options: { wantNames?: boolean } = {}): Promise<PlayerCount> {
    return cached(`players:${containerId}:${options.wantNames ? 'names' : 'count'}`, options.wantNames ? 8000 : 5000, async () => {
        // 1. A status ping. Nothing is written to the log, so asking often does not fill it.
        if (!options.wantNames) {
            try {
                const ping = await exec(containerId, environmentId, 'mc-monitor status --host 127.0.0.1 --port "${SERVER_PORT:-25565}" 2>&1');
                const parsed = parsePing(ping.output);
                if (parsed) return { online: parsed.online, max: parsed.max, names: null, source: 'ping' } satisfies PlayerCount;
            } catch { /* try the next way */ }
        }
        // 2. RCON. It lists the names, but every call leaves two lines in the log.
        try {
            const list = await exec(containerId, environmentId, 'rcon-cli list 2>&1');
            const parsed = parseList(list.output);
            if (parsed) return { online: parsed.online, max: parsed.max, names: parsed.names, source: 'rcon' } satisfies PlayerCount;
        } catch { /* try the next way */ }
        // 3. The log of the current run
        try {
            const log = await portainer.getContainerLogs(containerId, environmentId, 3000);
            const names = playersFromLog(String(log));
            return { online: names.length, max: null, names, source: 'log' } satisfies PlayerCount;
        } catch {
            return { online: 0, max: null, names: null, source: 'none' } satisfies PlayerCount;
        }
    });
}

/** CPU, memory and traffic of a container. `limitBytes` is the memory limit that was set for it, 0 for none. */
export function getUsage(containerId: string, environmentId: number, limitBytes: number): Promise<UsageNumbers | null> {
    return cached(`usage:${containerId}:${limitBytes}`, 2500, async () => {
        const first = await portainer.getContainerStats(containerId, environmentId) as DockerStats | null;
        if (!first) return null;
        // Some hosts leave the earlier sample empty; a second look a moment later gives the CPU something to compare
        if (!(first.precpu_stats?.system_cpu_usage) || !(first.precpu_stats?.cpu_usage?.total_usage)) {
            await wait(700);
            const second = await portainer.getContainerStats(containerId, environmentId) as DockerStats | null;
            if (second) return usageFromStats(second, first, limitBytes);
        }
        return usageFromStats(first, undefined, limitBytes);
    });
}
