import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { stripConsoleColors } from '@/lib/console/colors';
import { isSingleLineCommand, shellQuote } from '@/lib/server/shell';
import { consoleInputScript, getBlockServerSwitching } from '@/lib/server/consoleCommands';
import { getContainerName } from '@/lib/server/containerNames';
import portainer from '@/lib/server/portainer';
import { getServerFolderPath } from '@/lib/server/serverPaths';
import serverStorage from '@/lib/server/storage';
import { cleanExecOutput, forgetLiveStats, getPlayers } from '@/lib/server/liveStats';
import Server, { type IServer } from '@/lib/objects/Server';
import type { IUser } from '@/lib/objects/User';
import velocityService from '@/lib/server/velocity';

const gunzip = promisify(zlib.gunzip);

export interface ManagedPlayer {
    name: string;
    uuid?: string;
    online: boolean;
    op: boolean;
    opLevel?: number;
    whitelisted: boolean;
    banned: boolean;
    banReason?: string;
    bannedBy?: string;
    bannedExpires?: string;
    lastSeen?: string;
    currentServer?: string;
    bedrock?: boolean;
}

export type PlayerActionType =
    | 'kick'
    | 'ban'
    | 'unban'
    | 'message'
    | 'op'
    | 'deop'
    | 'whitelist-add'
    | 'whitelist-remove'
    | 'gamemode'
    | 'teleport'
    | 'send';

export interface PlayerActionRequest {
    action: PlayerActionType;
    player: string;
    reason?: string;
    message?: string;
    gamemode?: 'survival' | 'creative' | 'adventure' | 'spectator';
    target?: string;
    serverName?: string;
}

export interface PlayersOverview {
    online: number;
    max: number | null;
    names: string[];
    players: ManagedPlayer[];
    isProxy: boolean;
    running: boolean;
    proxyServers: string[];
    actionTargetsRunning: number;
}

export interface PlayerActionOutcome {
    success: boolean;
    message: string;
    command: string;
    outputs?: Array<{ server: string; output: string; ok: boolean }>;
}

interface RawUserCacheEntry {
    uuid?: unknown;
    name?: unknown;
    expiresOn?: unknown;
}

interface RawOpEntry {
    uuid?: unknown;
    name?: unknown;
    level?: unknown;
}

interface RawBanEntry {
    uuid?: unknown;
    name?: unknown;
    created?: unknown;
    source?: unknown;
    expires?: unknown;
    reason?: unknown;
}

interface ParsedLogPlayers {
    onlineNames: Set<string>;
    uuidByName: Map<string, { name: string; uuid: string }>;
    lastSeenByName: Map<string, string>;
    currentServerByName: Map<string, string>;
    allNames: Map<string, string>;
}

const VALID_GAMEMODES = new Set(['survival', 'creative', 'adventure', 'spectator']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidPlayerToken(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 36) return false;
    if (/[\r\n\0]/.test(trimmed)) return false;
    return /^[.*A-Za-z0-9_ -]+$/.test(trimmed);
}

export function formatPlayerArg(player: string): string {
    const trimmed = player.trim();
    return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

/** Normalizes 32-hex UUIDs into canonical hyphenated lowercase form. */
export function normalizeUuid(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const stripped = raw.trim().replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(stripped)) return undefined;
    return `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
}

export function isBedrockUuid(uuid: string | undefined): boolean {
    return Boolean(uuid && /^0{6,}/.test(uuid.replace(/-/g, '')));
}

/** Mojang's usercache expires entries 30 days after last login; converts `expiresOn` back to last-seen ISO time. */
export function usercacheLastSeen(expiresOn: unknown): string | undefined {
    if (typeof expiresOn !== 'string' || !expiresOn.trim()) return undefined;
    const parsed = Date.parse(expiresOn.replace(' +0000', 'Z').replace(' ', 'T'));
    if (!Number.isFinite(parsed)) return undefined;
    const approxSeen = new Date(parsed - 30 * 24 * 60 * 60 * 1000);
    return Number.isNaN(approxSeen.getTime()) ? undefined : approxSeen.toISOString();
}

export function parseJsonArray<T>(raw: string | undefined | null): T[] {
    if (!raw || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

/**
 * Extracts online status, UUIDs, last-seen timestamps, and proxy backend targets from server or proxy logs.
 */
export function parseLogPlayers(rawLog: string): ParsedLogPlayers {
    const onlineNames = new Set<string>();
    const uuidByName = new Map<string, { name: string; uuid: string }>();
    const lastSeenByName = new Map<string, string>();
    const currentServerByName = new Map<string, string>();
    const allNames = new Map<string, string>();

    const recordName = (name: string) => {
        const key = name.toLowerCase();
        if (!allNames.has(key)) allNames.set(key, name);
    };

    const extractTimestamp = (line: string): string | undefined => {
        const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(line);
        if (iso) return `${iso[1]}Z`;
        const hms = /\[(\d{2}:\d{2}:\d{2})/.exec(line);
        if (hms) return hms[1];
        return undefined;
    };

    for (const rawLine of rawLog.split('\n')) {
        const line = stripConsoleColors(rawLine).trim();
        if (!line) continue;

        if (/Starting minecraft server version|Starting Velocity|Listening on \/|\[Server thread\/INFO\]: Starting Minecraft server on/i.test(line)) {
            onlineNames.clear();
            currentServerByName.clear();
        }

        const ts = extractTimestamp(line);

        const uuidMatch = /UUID of player ([.*A-Za-z0-9_]{1,17}) is ([0-9a-f-]{32,36})/i.exec(line);
        if (uuidMatch) {
            const name = uuidMatch[1];
            const uuid = normalizeUuid(uuidMatch[2]);
            recordName(name);
            if (uuid) uuidByName.set(name.toLowerCase(), { name, uuid });
            if (ts) lastSeenByName.set(name.toLowerCase(), ts);
            continue;
        }

        const joined = /(?:\]: |^|\s)([.*A-Za-z0-9_]{1,17}) joined the game/.exec(line)
            ?? /\[connected player\] ([.*A-Za-z0-9_]{1,17}) \(\/[^)]*\) has connected/.exec(line)
            ?? /([.*A-Za-z0-9_]{1,17}) \(\/[^)]*\) has connected/.exec(line)
            ?? /\[([.*A-Za-z0-9_]{1,17})\] <-> InitialHandler has connected/.exec(line);
        if (joined) {
            const name = joined[1];
            recordName(name);
            onlineNames.add(name);
            if (ts) lastSeenByName.set(name.toLowerCase(), ts);
            continue;
        }

        const serverMove = /\[server connection\] ([.*A-Za-z0-9_]{1,17}) -> ([A-Za-z0-9_.-]+) has connected/.exec(line);
        if (serverMove) {
            const [, name, targetServer] = serverMove;
            recordName(name);
            onlineNames.add(name);
            currentServerByName.set(name.toLowerCase(), targetServer);
            if (ts) lastSeenByName.set(name.toLowerCase(), ts);
            continue;
        }

        const left = /(?:\]: |^|\s)([.*A-Za-z0-9_]{1,17}) (?:left the game|lost connection:)/.exec(line)
            ?? /\[connected player\] ([.*A-Za-z0-9_]{1,17}) \(\/[^)]*\) has disconnected/.exec(line)
            ?? /([.*A-Za-z0-9_]{1,17}) \(\/[^)]*\) has disconnected/.exec(line)
            ?? /\[([.*A-Za-z0-9_]{1,17})\] <-> InitialHandler has disconnected/.exec(line);
        if (left) {
            const name = left[1];
            recordName(name);
            for (const existing of onlineNames) {
                if (existing.toLowerCase() === name.toLowerCase()) onlineNames.delete(existing);
            }
            currentServerByName.delete(name.toLowerCase());
            if (ts) lastSeenByName.set(name.toLowerCase(), ts);
        }
    }

    return { onlineNames, uuidByName, lastSeenByName, currentServerByName, allNames };
}

/** Validates and constructs the exact server/proxy console command for an administrative player action. */
export function buildPlayerCommand(req: PlayerActionRequest): string {
    if (!isValidPlayerToken(req.player)) {
        throw new Error('Invalid player name or UUID.');
    }
    const playerArg = formatPlayerArg(req.player);
    const reason = (req.reason ?? '').replace(/[\r\n\0]/g, ' ').trim();
    const message = (req.message ?? '').replace(/[\r\n\0]/g, ' ').trim();

    let cmd = '';
    switch (req.action) {
        case 'kick':
            cmd = reason ? `kick ${playerArg} ${reason}` : `kick ${playerArg}`;
            break;
        case 'ban':
            cmd = reason ? `ban ${playerArg} ${reason}` : `ban ${playerArg}`;
            break;
        case 'unban':
            cmd = `pardon ${playerArg}`;
            break;
        case 'message':
            if (!message) throw new Error('Message text is required.');
            cmd = `tell ${playerArg} ${message}`;
            break;
        case 'op':
            cmd = `op ${playerArg}`;
            break;
        case 'deop':
            cmd = `deop ${playerArg}`;
            break;
        case 'whitelist-add':
            cmd = `whitelist add ${playerArg}`;
            break;
        case 'whitelist-remove':
            cmd = `whitelist remove ${playerArg}`;
            break;
        case 'gamemode': {
            const mode = (req.gamemode ?? '').toLowerCase();
            if (!VALID_GAMEMODES.has(mode)) throw new Error('Invalid gamemode.');
            cmd = `gamemode ${mode} ${playerArg}`;
            break;
        }
        case 'teleport': {
            const target = (req.target ?? '').trim();
            if (!target || !isSingleLineCommand(target) || !/^[.*A-Za-z0-9_. ~^+-]+$/.test(target)) {
                throw new Error('A valid target player or coordinates are required.');
            }
            cmd = `tp ${playerArg} ${target}`;
            break;
        }
        case 'send': {
            const dest = (req.serverName ?? '').trim();
            if (!dest || !/^[A-Za-z0-9_.-]+$/.test(dest)) {
                throw new Error('A valid target server name is required.');
            }
            cmd = `send ${playerArg} ${dest}`;
            break;
        }
        default:
            throw new Error('Unsupported player action.');
    }

    if (!isSingleLineCommand(cmd)) throw new Error('Command must be single-line.');
    return cmd;
}

const mojangNameCache = new Map<string, { at: number; uuid?: string }>();
const mojangUuidCache = new Map<string, { at: number; name?: string }>();
const MOJANG_TTL_MS = 15 * 60 * 1000;

async function lookupMojangProfile(name: string): Promise<string | undefined> {
    const key = name.toLowerCase();
    const hit = mojangNameCache.get(key);
    if (hit && Date.now() - hit.at < MOJANG_TTL_MS) return hit.uuid;
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return undefined;
    try {
        const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, {
            signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) {
            mojangNameCache.set(key, { at: Date.now(), uuid: undefined });
            return undefined;
        }
        const data = (await res.json()) as { id?: string };
        const uuid = normalizeUuid(data.id);
        mojangNameCache.set(key, { at: Date.now(), uuid });
        return uuid;
    } catch {
        mojangNameCache.set(key, { at: Date.now(), uuid: undefined });
        return undefined;
    }
}

async function lookupMojangNameByUuid(uuid: string): Promise<string | undefined> {
    const clean = uuid.replace(/-/g, '').toLowerCase();
    const hit = mojangUuidCache.get(clean);
    if (hit && Date.now() - hit.at < MOJANG_TTL_MS) return hit.name;
    try {
        const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${clean}`, {
            signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) {
            mojangUuidCache.set(clean, { at: Date.now(), name: undefined });
            return undefined;
        }
        const data = (await res.json()) as { name?: string };
        mojangUuidCache.set(clean, { at: Date.now(), name: data.name });
        return data.name;
    } catch {
        mojangUuidCache.set(clean, { at: Date.now(), name: undefined });
        return undefined;
    }
}

interface ServerFilesBundle {
    usercache?: string;
    ops?: string;
    whitelist?: string;
    bannedPlayers?: string;
    playerdataUuids: string[];
    extraLogText: string;
}

const MARKER_UC = '__MCSM_UC__';
const MARKER_OPS = '__MCSM_OPS__';
const MARKER_WL = '__MCSM_WL__';
const MARKER_BAN = '__MCSM_BAN__';
const MARKER_PD = '__MCSM_PD__';
const MARKER_LOG = '__MCSM_LOG__';

function extractSection(text: string, marker: string, nextMarkers: string[]): string {
    const startIdx = text.indexOf(marker);
    if (startIdx === -1) return '';
    const contentStart = startIdx + marker.length;
    let endIdx = text.length;
    for (const next of nextMarkers) {
        const idx = text.indexOf(next, contentStart);
        if (idx !== -1 && idx < endIdx) endIdx = idx;
    }
    return text.slice(contentStart, endIdx).trim();
}

async function readStorageFileText(path: string): Promise<string | undefined> {
    try {
        const buf = await serverStorage.getFileContents(path);
        return buf.toString('utf8');
    } catch {
        return undefined;
    }
}

async function readPlayerFilesFromServer(
    server: IServer,
    containerId: string | null,
    environmentId: number | null,
    running: boolean
): Promise<ServerFilesBundle> {
    const folder = getServerFolderPath(server, server.email ?? '');
    const isProxy = server.kind === 'proxy';

    const bundle: ServerFilesBundle = { playerdataUuids: [], extraLogText: '' };

    if (!isProxy) {
        const [usercache, ops, whitelist, bannedPlayers] = await Promise.all([
            readStorageFileText(`${folder}/usercache.json`),
            readStorageFileText(`${folder}/ops.json`),
            readStorageFileText(`${folder}/whitelist.json`),
            readStorageFileText(`${folder}/banned-players.json`),
        ]);
        bundle.usercache = usercache;
        bundle.ops = ops;
        bundle.whitelist = whitelist;
        bundle.bannedPlayers = bannedPlayers;

        try {
            const pd = await serverStorage.getDirectoryContents(`${folder}/world/playerdata`);
            for (const entry of pd) {
                const stem = entry.basename.replace(/\.dat$/i, '');
                if (UUID_REGEX.test(stem)) bundle.playerdataUuids.push(stem.toLowerCase());
            }
        } catch {
            // world folder may differ or storage backend may point elsewhere
        }
    }

    // Read recent server/proxy rotated logs from storage when usercache isn't populated or proxy
    if (isProxy || (!bundle.usercache && !running)) {
        try {
            const logEntries = await serverStorage.getDirectoryContents(`${folder}/logs`);
            const chosen = logEntries
                .filter(e => e.type === 'file' && (/\.log\.gz$/i.test(e.basename) || e.basename === 'latest.log'))
                .sort((a, b) => a.basename.localeCompare(b.basename))
                .slice(-10);
            const parts: string[] = [];
            for (const item of chosen) {
                if (item.size && item.size > 10 * 1024 * 1024) continue;
                try {
                    const buf = await serverStorage.getFileContents(`${folder}/logs/${item.basename}`);
                    const content = item.basename.endsWith('.gz') ? (await gunzip(buf)).toString('utf8') : buf.toString('utf8');
                    parts.push(content);
                } catch {
                    // skip unreadable log file
                }
            }
            bundle.extraLogText = parts.join('\n');
        } catch {
            // logs directory missing on storage
        }
    }

    // Fallback via Portainer exec when container is running and storage returned no files (e.g. external mount layout)
    const missingBackendData = !isProxy && !bundle.usercache && !bundle.ops && !bundle.bannedPlayers;
    if (running && containerId && environmentId !== null && (isProxy || missingBackendData)) {
        try {
            const script = isProxy
                ? `echo "${MARKER_LOG}"; (zgrep -h -E "connected player|server connection|UUID of player|InitialHandler" /server/logs/*.log.gz /server/logs/latest.log 2>/dev/null || cat /server/logs/latest.log 2>/dev/null) | tail -n 600`
                : [
                    `echo "${MARKER_UC}"; cat /data/usercache.json 2>/dev/null`,
                    `echo "${MARKER_OPS}"; cat /data/ops.json 2>/dev/null`,
                    `echo "${MARKER_WL}"; cat /data/whitelist.json 2>/dev/null`,
                    `echo "${MARKER_BAN}"; cat /data/banned-players.json 2>/dev/null`,
                    `echo "${MARKER_PD}"; ls /data/world/playerdata 2>/dev/null | head -n 200`,
                    `echo "${MARKER_LOG}"; (zgrep -h -E "UUID of player|joined the game|left the game|lost connection" /data/logs/*.log.gz /data/logs/latest.log 2>/dev/null || true) | tail -n 400`,
                ].join('; ');

            const execRes = await portainer.executeCommand(containerId, script, environmentId);
            const rawOut = cleanExecOutput(String(execRes.output ?? ''));

            if (isProxy) {
                const logPart = extractSection(rawOut, MARKER_LOG, []);
                if (logPart) bundle.extraLogText = [bundle.extraLogText, logPart].filter(Boolean).join('\n');
            } else {
                const allMarkers = [MARKER_UC, MARKER_OPS, MARKER_WL, MARKER_BAN, MARKER_PD, MARKER_LOG];
                bundle.usercache ||= extractSection(rawOut, MARKER_UC, allMarkers);
                bundle.ops ||= extractSection(rawOut, MARKER_OPS, allMarkers);
                bundle.whitelist ||= extractSection(rawOut, MARKER_WL, allMarkers);
                bundle.bannedPlayers ||= extractSection(rawOut, MARKER_BAN, allMarkers);

                const pdText = extractSection(rawOut, MARKER_PD, allMarkers);
                for (const token of pdText.split(/\s+/)) {
                    const stem = token.replace(/\.dat$/i, '');
                    if (UUID_REGEX.test(stem) && !bundle.playerdataUuids.includes(stem.toLowerCase())) {
                        bundle.playerdataUuids.push(stem.toLowerCase());
                    }
                }
                const logPart = extractSection(rawOut, MARKER_LOG, allMarkers);
                if (logPart) bundle.extraLogText = [bundle.extraLogText, logPart].filter(Boolean).join('\n');
            }
        } catch {
            // non-fatal
        }
    }

    return bundle;
}

class PlayerMapBuilder {
    private byUuid = new Map<string, ManagedPlayer>();
    private byName = new Map<string, ManagedPlayer>();

    ensure(name: string, uuid?: string): ManagedPlayer {
        const normUuid = normalizeUuid(uuid);
        const nameKey = name.trim().toLowerCase();

        let existing: ManagedPlayer | undefined;
        if (normUuid) existing = this.byUuid.get(normUuid);
        if (!existing && nameKey) existing = this.byName.get(nameKey);

        if (!existing) {
            existing = {
                name: name.trim(),
                uuid: normUuid,
                online: false,
                op: false,
                whitelisted: false,
                banned: false,
                bedrock: isBedrockUuid(normUuid),
            };
        } else {
            if (!existing.uuid && normUuid) {
                existing.uuid = normUuid;
                existing.bedrock = isBedrockUuid(normUuid);
            }
            if (name.trim() && (!existing.name || existing.name === existing.uuid)) {
                existing.name = name.trim();
            }
        }

        if (existing.uuid) this.byUuid.set(existing.uuid, existing);
        if (existing.name) this.byName.set(existing.name.toLowerCase(), existing);
        return existing;
    }

    ingestBundle(bundle: ServerFilesBundle, parsedLogs: ParsedLogPlayers, liveOnline: Set<string>, options: { markServerName?: string } = {}): void {
        for (const entry of parseJsonArray<RawUserCacheEntry>(bundle.usercache)) {
            const name = typeof entry.name === 'string' ? entry.name.trim() : '';
            if (!name) continue;
            const player = this.ensure(name, typeof entry.uuid === 'string' ? entry.uuid : undefined);
            const seen = usercacheLastSeen(entry.expiresOn);
            if (seen && !player.lastSeen) player.lastSeen = seen;
        }

        for (const entry of parseJsonArray<RawOpEntry>(bundle.ops)) {
            const name = typeof entry.name === 'string' ? entry.name.trim() : '';
            if (!name) continue;
            const player = this.ensure(name, typeof entry.uuid === 'string' ? entry.uuid : undefined);
            player.op = true;
            if (typeof entry.level === 'number') player.opLevel = entry.level;
        }

        for (const entry of parseJsonArray<RawUserCacheEntry>(bundle.whitelist)) {
            const name = typeof entry.name === 'string' ? entry.name.trim() : '';
            if (!name) continue;
            const player = this.ensure(name, typeof entry.uuid === 'string' ? entry.uuid : undefined);
            player.whitelisted = true;
        }

        for (const entry of parseJsonArray<RawBanEntry>(bundle.bannedPlayers)) {
            const name = typeof entry.name === 'string' ? entry.name.trim() : '';
            if (!name) continue;
            const player = this.ensure(name, typeof entry.uuid === 'string' ? entry.uuid : undefined);
            player.banned = true;
            if (typeof entry.reason === 'string' && entry.reason.trim()) player.banReason = entry.reason.trim();
            if (typeof entry.source === 'string' && entry.source.trim()) player.bannedBy = entry.source.trim();
            if (typeof entry.expires === 'string' && entry.expires.trim() && entry.expires !== 'forever') {
                player.bannedExpires = entry.expires.trim();
            }
        }

        for (const [lower, info] of parsedLogs.uuidByName) {
            const player = this.ensure(info.name, info.uuid);
            const seen = parsedLogs.lastSeenByName.get(lower);
            if (seen) player.lastSeen = seen;
        }

        for (const [, name] of parsedLogs.allNames) {
            const player = this.ensure(name);
            const seen = parsedLogs.lastSeenByName.get(name.toLowerCase());
            if (seen) player.lastSeen = seen;
            const srv = parsedLogs.currentServerByName.get(name.toLowerCase());
            if (srv) player.currentServer = srv;
        }

        for (const name of liveOnline) {
            const player = this.ensure(name);
            player.online = true;
            if (options.markServerName && !player.currentServer) {
                player.currentServer = options.markServerName;
            }
        }

        for (const uuid of bundle.playerdataUuids) {
            const norm = normalizeUuid(uuid);
            if (norm && !this.byUuid.has(norm)) {
                this.byUuid.set(norm, {
                    name: norm,
                    uuid: norm,
                    online: false,
                    op: false,
                    whitelisted: false,
                    banned: false,
                    bedrock: isBedrockUuid(norm),
                });
            }
        }
    }

    list(): ManagedPlayer[] {
        const unique = new Set<ManagedPlayer>([...this.byUuid.values(), ...this.byName.values()]);
        return [...unique].sort((a, b) => {
            if (a.online !== b.online) return a.online ? -1 : 1;
            if (a.banned !== b.banned) return a.banned ? 1 : -1;
            if (a.lastSeen && b.lastSeen && a.lastSeen !== b.lastSeen) return b.lastSeen.localeCompare(a.lastSeen);
            if (a.lastSeen && !b.lastSeen) return -1;
            if (!a.lastSeen && b.lastSeen) return 1;
            return a.name.localeCompare(b.name);
        });
    }
}

async function resolveContainerInfo(server: IServer) {
    const storedEnv = server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID, 10) : null);
    const environmentId = await portainer.getValidEnvironmentId(storedEnv).catch(() => null);
    if (environmentId === null) return { environmentId: null, container: null };
    const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId).catch(() => null);
    return { environmentId, container };
}

/**
 * Returns online players plus full historical players, UUIDs, ban/op/whitelist flags, and proxy backend targets.
 */
export async function getServerPlayersOverview(server: IServer): Promise<PlayersOverview> {
    const isProxy = server.kind === 'proxy';
    const { environmentId, container } = await resolveContainerInfo(server);
    const running = container?.State === 'running';

    const builder = new PlayerMapBuilder();
    let maxPlayers: number | null = null;
    const proxyServers: string[] = [];
    let actionTargetsRunning = running ? 1 : 0;

    // Fetch container logs (live/recent) + storage/container player files
    const [containerLogs, liveInfo, primaryBundle] = await Promise.all([
        container && environmentId !== null
            ? portainer.getContainerLogs(container.Id, environmentId, 2000, true).then(String).catch(() => '')
            : Promise.resolve(''),
        running && container && environmentId !== null && !isProxy
            ? getPlayers(container.Id, environmentId, { wantNames: true }).catch(() => null)
            : Promise.resolve(null),
        readPlayerFilesFromServer(server, container?.Id ?? null, environmentId, running),
    ]);

    const combinedPrimaryLogs = [primaryBundle.extraLogText, containerLogs].filter(Boolean).join('\n');
    const primaryParsedLogs = parseLogPlayers(combinedPrimaryLogs);
    const primaryOnline = new Set<string>(liveInfo?.names ?? [...primaryParsedLogs.onlineNames]);
    if (liveInfo?.max !== null && liveInfo?.max !== undefined) maxPlayers = liveInfo.max;

    builder.ingestBundle(primaryBundle, primaryParsedLogs, primaryOnline);

    // For proxies, aggregate linked backend servers' usercache/bans/ops/online players & destination names
    if (isProxy) {
        const linkedBackends = await Server.find({
            kind: { $ne: 'proxy' },
            'network.links.proxyId': server.uniqueId,
        });

        let runningBackends = 0;
        await Promise.all(linkedBackends.map(async backend => {
            const linkEntry = backend.network?.links?.find((l: { proxyId?: string; entryName?: string }) => l.proxyId === server.uniqueId);
            const entryName = linkEntry?.entryName || backend.serverName;
            if (entryName && !proxyServers.includes(entryName)) proxyServers.push(entryName);

            const backendEnv = await resolveContainerInfo(backend);
            const backendRunning = backendEnv.container?.State === 'running';
            if (backendRunning) runningBackends++;

            const [backendBundle, backendLive, backendLogs] = await Promise.all([
                readPlayerFilesFromServer(backend, backendEnv.container?.Id ?? null, backendEnv.environmentId, backendRunning),
                backendRunning && backendEnv.container && backendEnv.environmentId !== null
                    ? getPlayers(backendEnv.container.Id, backendEnv.environmentId, { wantNames: true }).catch(() => null)
                    : Promise.resolve(null),
                backendEnv.container && backendEnv.environmentId !== null
                    ? portainer.getContainerLogs(backendEnv.container.Id, backendEnv.environmentId, 600, true).then(String).catch(() => '')
                    : Promise.resolve(''),
            ]);

            const parsedBackendLogs = parseLogPlayers([backendBundle.extraLogText, backendLogs].filter(Boolean).join('\n'));
            const backendOnline = new Set<string>(backendLive?.names ?? [...parsedBackendLogs.onlineNames]);
            builder.ingestBundle(backendBundle, parsedBackendLogs, backendOnline, { markServerName: entryName });
        }));

        actionTargetsRunning = runningBackends;
        proxyServers.sort((a, b) => a.localeCompare(b));
    }

    const list = builder.list();

    // Resolve up to 5 missing UUIDs or unresolved playerdata UUID filenames quickly (strict 1.5s timeout)
    const missingUuidPlayers = list.filter(p => !p.uuid && /^[A-Za-z0-9_]{3,16}$/.test(p.name)).slice(0, 5);
    const unresolvedUuidOnly = list.filter(p => p.uuid && p.name === p.uuid && !p.bedrock).slice(0, 5);
    await Promise.all([
        ...missingUuidPlayers.map(async p => {
            const uuid = await lookupMojangProfile(p.name);
            if (uuid) p.uuid = uuid;
        }),
        ...unresolvedUuidOnly.map(async p => {
            if (!p.uuid) return;
            const resolvedName = await lookupMojangNameByUuid(p.uuid);
            if (resolvedName) p.name = resolvedName;
        }),
    ]);

    const onlineList = list.filter(p => p.online);
    return {
        online: onlineList.length,
        max: maxPlayers,
        names: onlineList.map(p => p.name),
        players: list,
        isProxy,
        running,
        proxyServers,
        actionTargetsRunning,
    };
}

async function sendBackendCommand(containerId: string, environmentId: number, command: string): Promise<{ ok: boolean; output: string }> {
    const rconCommand = `rcon-cli ${shellQuote(command)}`;
    const result = await portainer.executeCommand(containerId, rconCommand, environmentId);
    const output = cleanExecOutput(String(result.output ?? ''));

    if (result.exitCode !== 0 && /refused|failed to connect|connect:|no such file|not found/i.test(output)) {
        const typed = await portainer.executeCommand(containerId, consoleInputScript(command), environmentId);
        if (typed.exitCode === 0) {
            return { ok: true, output: 'Command sent to server console.' };
        }
        const attached = await portainer.sendContainerInput(containerId, command, environmentId);
        if (attached.sent) {
            return { ok: true, output: 'Command sent to server console.' };
        }
        return { ok: false, output: 'Neither RCON nor console input is reachable on this container.' };
    }

    const unknownOrErr = /^Unknown or incomplete command|^Unknown command/i.test(output);
    return { ok: result.exitCode === 0 && !unknownOrErr, output: output || 'Command executed.' };
}

/**
 * Executes an administrative player action on a server (or across linked servers / proxy console for proxies).
 */
export async function executePlayerAction(
    server: IServer,
    user: Pick<IUser, 'isAdmin'>,
    req: PlayerActionRequest
): Promise<PlayerActionOutcome> {
    if (req.action === 'send' && !user.isAdmin && await getBlockServerSwitching()) {
        throw new Error('Administrators have turned off server switching commands.');
    }

    const command = buildPlayerCommand(req);
    const isProxy = server.kind === 'proxy';

    if (!isProxy) {
        if (req.action === 'send') {
            throw new Error('Sending players to another server is only available on proxies.');
        }
        const { environmentId, container } = await resolveContainerInfo(server);
        if (!container || container.State !== 'running' || environmentId === null) {
            throw new Error('The server must be running to run player actions.');
        }
        const res = await sendBackendCommand(container.Id, environmentId, command);
        forgetLiveStats(container.Id);
        return {
            success: res.ok,
            message: res.output,
            command,
            outputs: [{ server: server.serverName, output: res.output, ok: res.ok }],
        };
    }

    // Proxy actions
    const { environmentId: proxyEnv, container: proxyContainer } = await resolveContainerInfo(server);
    if (req.action === 'send') {
        if (!proxyContainer || proxyContainer.State !== 'running' || proxyEnv === null) {
            throw new Error('The proxy must be running to send players between servers.');
        }
        const sent = await velocityService.sendConsoleCommand(proxyContainer.Id, command, proxyEnv);
        if (!sent.sent) throw new Error(sent.error ?? 'Could not send command to the proxy console.');
        forgetLiveStats(proxyContainer.Id);
        return {
            success: true,
            message: `Sent ${req.player.trim()} to ${req.serverName}.`,
            command,
            outputs: [{ server: server.serverName, output: 'Command sent to proxy console.', ok: true }],
        };
    }

    // Moderation commands (`kick`, `ban`, `unban`, `message`, `op`, `deop`, `whitelist-*`, `gamemode`, `teleport`)
    // target the linked running backend servers behind the proxy.
    const linkedBackends = await Server.find({
        kind: { $ne: 'proxy' },
        'network.links.proxyId': server.uniqueId,
    });

    const targets: Array<{ backend: IServer; entryName: string; containerId: string; environmentId: number }> = [];
    for (const backend of linkedBackends) {
        const link = backend.network?.links?.find((l: { proxyId?: string; entryName?: string }) => l.proxyId === server.uniqueId);
        const entryName = link?.entryName || backend.serverName;
        const info = await resolveContainerInfo(backend);
        if (info.container?.State === 'running' && info.environmentId !== null) {
            targets.push({ backend, entryName, containerId: info.container.Id, environmentId: info.environmentId });
        }
    }

    const specificServer = req.serverName?.trim();
    const scopedTargets = specificServer
        ? targets.filter(t => t.entryName.toLowerCase() === specificServer.toLowerCase() || t.backend.serverName.toLowerCase() === specificServer.toLowerCase())
        : targets;
    const effectiveTargets = scopedTargets.length > 0 ? scopedTargets : targets;

    if (effectiveTargets.length === 0) {
        throw new Error('No linked backend servers are currently running to apply this player action.');
    }

    const outputs = await Promise.all(effectiveTargets.map(async target => {
        const res = await sendBackendCommand(target.containerId, target.environmentId, command);
        forgetLiveStats(target.containerId);
        return { server: target.backend.serverName, output: res.output, ok: res.ok };
    }));
    if (proxyContainer) forgetLiveStats(proxyContainer.Id);

    const anyOk = outputs.some(o => o.ok);
    const summary = outputs.map(o => `${o.server}: ${o.output}`).join(' | ');
    return {
        success: anyOk,
        message: summary,
        command,
        outputs,
    };
}
