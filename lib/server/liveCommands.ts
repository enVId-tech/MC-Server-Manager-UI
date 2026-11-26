import AdmZip from 'adm-zip';
import type { CommandDef } from '@/lib/console/commands';
import { cleanConsoleText } from '@/lib/console/colors';
import {
    parseBrigadierHelp,
    parseBukkitHelpOutput,
    parsePluginDescriptorCommands,
} from '@/lib/console/liveParse';
import type { IServer } from '@/lib/objects/Server';
import type { IUser } from '@/lib/objects/User';
import { isHiddenFromUsers } from '@/lib/server/accessPolicy';
import { getBlockServerSwitching, isServerSwitchCommand } from '@/lib/server/consoleCommands';
import { getContainerName } from '@/lib/server/containerNames';
import portainer from '@/lib/server/portainer';
import { getServerFolderPath } from '@/lib/server/serverPaths';
import serverStorage from '@/lib/server/storage';

export type LiveCommandSource = 'live' | 'jar' | 'none';

export interface LiveCommandsResult {
    commands: CommandDef[];
    source: LiveCommandSource;
}

const LIVE_CACHE_TTL_MS = 30_000;
const FALLBACK_CACHE_TTL_MS = 15_000;
const MAX_BUKKIT_HELP_PAGES = 20;
const MAX_DESCRIPTOR_JARS = 40;
const MAX_JAR_BYTES = 25 * 1024 * 1024;
const DESCRIPTOR_FILES = ['paper-plugin.yml', 'plugin.yml', 'bungee.yml'] as const;

interface CacheEntry {
    at: number;
    containerRunning: boolean;
    commands: CommandDef[];
    source: LiveCommandSource;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<LiveCommandsResult>>();

function mergeCommandLists(lists: CommandDef[][]): CommandDef[] {
    const byName = new Map<string, CommandDef>();
    for (const list of lists) {
        for (const cmd of list) {
            const key = cmd.name.toLowerCase();
            const existing = byName.get(key);
            if (!existing) {
                byName.set(key, {
                    name: key,
                    syntax: [...cmd.syntax],
                    ...(cmd.aliases?.length ? { aliases: [...cmd.aliases] } : {}),
                    ...(cmd.summary ? { summary: cmd.summary } : {}),
                });
                continue;
            }
            for (const line of cmd.syntax) {
                if (!existing.syntax.includes(line)) existing.syntax.push(line);
            }
            if (!existing.summary && cmd.summary) existing.summary = cmd.summary;
            if (cmd.aliases?.length) {
                const aliasSet = new Set([...(existing.aliases ?? []), ...cmd.aliases]);
                existing.aliases = [...aliasSet];
            }
        }
    }
    return [...byName.values()];
}

async function execRcon(containerId: string, environmentId: number, command: string): Promise<string> {
    const quoted = `'${command.replace(/'/g, `'\\''`)}'`;
    const res = await portainer.executeCommand(containerId, `rcon-cli ${quoted}`, environmentId);
    const out = cleanConsoleText(String(res.output ?? ''));
    if (/failed to connect|connection refused|dial tcp/i.test(out)) return '';
    return out;
}

async function fetchRconCommands(containerId: string, environmentId: number): Promise<CommandDef[]> {
    // 1. Try Minecraft 1.13+ Brigadier command tree via `minecraft:help`
    const brigadierRaw = await execRcon(containerId, environmentId, 'minecraft:help');
    if (brigadierRaw) {
        const brigadier = parseBrigadierHelp(brigadierRaw);
        if (brigadier.length > 0) {
            return brigadier;
        }
    }

    // 2. Fallback for Bukkit/Spigot/Paper < 1.13 where `minecraft:help` is not available
    const firstPageRaw = await execRcon(containerId, environmentId, 'help 1');
    if (!firstPageRaw) return [];

    const firstPage = parseBukkitHelpOutput(firstPageRaw);
    const collected: CommandDef[][] = [firstPage.commands];
    const pageLimit = Math.min(Math.max(1, firstPage.totalPages), MAX_BUKKIT_HELP_PAGES);

    for (let start = 2; start <= pageLimit; start += 4) {
        const pages = Array.from({ length: Math.min(4, pageLimit - start + 1) }, (_, idx) => start + idx);
        const batch = await Promise.all(pages.map(page => execRcon(containerId, environmentId, `help ${page}`)));
        for (const raw of batch) {
            if (!raw) continue;
            collected.push(parseBukkitHelpOutput(raw).commands);
        }
    }

    return mergeCommandLists(collected);
}

async function readJarDescriptorCommands(server: IServer, includeHidden: boolean): Promise<CommandDef[]> {
    const folder = await getServerFolderPath(server, server.email ?? '');
    let entries;
    try {
        entries = await serverStorage.getDirectoryContents(`${folder}/plugins`);
    } catch {
        return [];
    }

    const jars = entries
        .filter(item =>
            item.type === 'file'
            && /\.jar$/i.test(item.basename)
            && (item.size === undefined || item.size <= MAX_JAR_BYTES)
            && (includeHidden || !isHiddenFromUsers(`plugins/${item.basename}`))
        )
        .slice(0, MAX_DESCRIPTOR_JARS);

    if (jars.length === 0) return [];

    const collected: CommandDef[][] = [];
    for (let i = 0; i < jars.length; i += 4) {
        const chunk = jars.slice(i, i + 4);
        const results = await Promise.all(chunk.map(async item => {
            try {
                const raw = await serverStorage.getFileContents(`${folder}/plugins/${item.basename}`);
                if (raw.length < 4 || raw[0] !== 0x50 || raw[1] !== 0x4b) return [];
                const zip = new AdmZip(raw);
                for (const descriptor of DESCRIPTOR_FILES) {
                    const entry = zip.getEntry(descriptor);
                    if (!entry) continue;
                    const cmds = parsePluginDescriptorCommands(
                        entry.getData().toString('utf8'),
                        item.basename.replace(/\.jar$/i, '')
                    );
                    if (cmds.length > 0) return cmds;
                }
            } catch {
                // Skip unreadable/corrupt jar
            }
            return [];
        }));
        collected.push(...results);
    }

    return mergeCommandLists(collected);
}

async function computeLiveServerCommands(server: IServer, user: IUser, force: boolean): Promise<LiveCommandsResult> {
    const storedEnvId = server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID, 10) : null);
    let environmentId: number | null = null;
    let containerId: string | null = null;
    let containerRunning = false;

    try {
        environmentId = await portainer.getValidEnvironmentId(storedEnvId);
        const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId);
        containerRunning = container?.State === 'running';
        containerId = containerRunning && container ? container.Id : null;
    } catch {
        containerRunning = false;
        containerId = null;
    }

    const cached = cache.get(server.uniqueId);
    if (!force && cached) {
        const ttl = cached.source === 'live' ? LIVE_CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS;
        const fresh = Date.now() - cached.at < ttl;
        // Invalidate fallback cache immediately once the server starts running
        const stateChangedToRunning = containerRunning && !cached.containerRunning && cached.source !== 'live';
        if (fresh && !stateChangedToRunning) {
            return { commands: cached.commands, source: cached.source };
        }
    }

    let rawCommands: CommandDef[] = [];
    let source: LiveCommandSource = 'none';

    if (containerRunning && containerId && environmentId !== null && server.kind !== 'proxy') {
        try {
            const live = await fetchRconCommands(containerId, environmentId);
            if (live.length > 0) {
                rawCommands = live;
                source = 'live';
            }
        } catch {
            // Fall through to plugin jar descriptors
        }
    }

    if (rawCommands.length === 0) {
        try {
            const fromJars = await readJarDescriptorCommands(server, Boolean(user.isAdmin));
            if (fromJars.length > 0) {
                rawCommands = fromJars;
                source = 'jar';
            }
        } catch {
            // Ignore descriptor read failure
        }
    }

    cache.set(server.uniqueId, {
        at: Date.now(),
        containerRunning,
        commands: rawCommands,
        source,
    });

    return { commands: rawCommands, source };
}

/**
 * Fetches live runtime commands (from `minecraft:help` / Bukkit `help` over RCON, with plugin jar descriptor
 * fallback when offline or for proxies) so console autocomplete knows every command a player can see.
 */
export async function getLiveServerCommands(
    server: IServer,
    user: IUser,
    options?: { force?: boolean }
): Promise<LiveCommandsResult> {
    const force = Boolean(options?.force);
    const flightKey = `${server.uniqueId}:${force ? 'force' : 'normal'}`;

    let promise = inFlight.get(flightKey);
    if (!promise) {
        promise = computeLiveServerCommands(server, user, force).finally(() => {
            inFlight.delete(flightKey);
        });
        inFlight.set(flightKey, promise);
    }

    const result = await promise;
    if (!user.isAdmin && await getBlockServerSwitching()) {
        return {
            source: result.source,
            commands: result.commands.filter(cmd => !isServerSwitchCommand(cmd.name)),
        };
    }

    return result;
}
