/**
 * Readers for the files that tell what a proxy is set up as. Pure functions over file contents.
 */
import YAML from 'yaml';
import { getTomlTable, getTomlValue, removeTomlKey, setTomlValue, tomlArray, tomlString } from './toml';
import { isForwardingMode, type ForwardingMode } from './versions';

// ---------------------------------------------------------------- Velocity

export interface VelocitySummary {
    forwarding: ForwardingMode;
    /** Name of the file that holds the secret, relative to velocity.toml. Velocity 3 default is forwarding.secret */
    secretFile: string;
    /** Old versions kept the secret in velocity.toml itself */
    inlineSecret?: string;
    bind: string;
    motd: string;
    maxPlayers: number;
    onlineMode: boolean;
    servers: Record<string, string>;
    tryOrder: string[];
    forcedHosts: Record<string, string[]>;
}

export function parseVelocityToml(content: string): VelocitySummary {
    const root = getTomlTable(content, '');
    const mode = String(root['player-info-forwarding-mode'] ?? 'none').toLowerCase();
    const serversTable = getTomlTable(content, 'servers');
    const servers: Record<string, string> = {};
    for (const [name, value] of Object.entries(serversTable)) {
        if (name !== 'try' && typeof value === 'string') servers[name] = value;
    }
    const tryList = serversTable.try;
    const forced: Record<string, string[]> = {};
    for (const [host, value] of Object.entries(getTomlTable(content, 'forced-hosts'))) {
        forced[host] = Array.isArray(value) ? value : [String(value)];
    }
    const secret = root['forwarding-secret'];

    return {
        forwarding: isForwardingMode(mode) ? mode : 'none',
        secretFile: typeof root['forwarding-secret-file'] === 'string' ? (root['forwarding-secret-file'] as string) : 'forwarding.secret',
        inlineSecret: typeof secret === 'string' && secret ? secret : undefined,
        bind: typeof root.bind === 'string' ? root.bind : '0.0.0.0:25565',
        motd: typeof root.motd === 'string' ? root.motd : '',
        maxPlayers: typeof root['show-max-players'] === 'number' ? (root['show-max-players'] as number) : 500,
        onlineMode: root['online-mode'] !== false,
        servers,
        tryOrder: Array.isArray(tryList) ? tryList : [],
        forcedHosts: forced,
    };
}

export interface VelocityServerEntry {
    name: string;
    address: string;
    /** Host names players join with, e.g. survival.example.com */
    hostnames: string[];
}

/** Finds a forced host regardless of the case it is written in */
function findForced<T>(forced: Record<string, T>, hostname: string): { host: string; value: T } | undefined {
    const wanted = hostname.trim().toLowerCase();
    const host = Object.keys(forced).find(key => key.trim().toLowerCase() === wanted);
    return host === undefined ? undefined : { host, value: forced[host] };
}

/**
 * Host names of an entry that are already forced hosts leading somewhere else. The proxy keeps those as they are:
 * a forced host somebody set up is never taken over by a server that is added later.
 */
export function takenForcedHosts(forced: Record<string, string[]>, entry: VelocityServerEntry): Array<{ host: string; leadsTo: string[] }> {
    const taken: Array<{ host: string; leadsTo: string[] }> = [];
    for (const hostname of entry.hostnames) {
        const existing = findForced(forced, hostname);
        if (existing && !existing.value.includes(entry.name)) taken.push({ host: hostname, leadsTo: existing.value });
    }
    return taken;
}

/**
 * Adds a server to velocity.toml, or updates it.
 *
 * Forced hosts that already exist are never overwritten. A host name that leads to another server stays as it is,
 * one that already leads here stays too. Only the host names this entry used to have and does not use any more are
 * taken away, which is what changing a server's address does.
 *
 * The server is never added to `try`: that list is where Velocity sends players when the server they were on
 * stops, and a server must not fall back to somebody else's world. It is also taken out of `try` if an older
 * version of this manager put it there. Players reach it through its forced host.
 */
export function addServerToVelocityToml(content: string, entry: VelocityServerEntry): string {
    let next = setTomlValue(content, 'servers', entry.name, tomlString(entry.address));

    const summary = parseVelocityToml(next);
    if (summary.tryOrder.includes(entry.name)) {
        next = setTomlValue(next, 'servers', 'try', tomlArray(summary.tryOrder.filter(name => name !== entry.name)));
    }

    // Host names this entry had before and does not use any more (a proxy changed its base subdomain)
    const wanted = entry.hostnames.map(name => name.trim().toLowerCase());
    for (const [host, names] of Object.entries(parseVelocityToml(next).forcedHosts)) {
        if (wanted.includes(host.trim().toLowerCase()) || !names.includes(entry.name)) continue;
        const rest = names.filter(item => item !== entry.name);
        next = rest.length > 0 ? setTomlValue(next, 'forced-hosts', host, tomlArray(rest)) : removeTomlKey(next, 'forced-hosts', host);
    }
    const existing = parseVelocityToml(next).forcedHosts;
    for (const hostname of entry.hostnames) {
        if (findForced(existing, hostname)) continue;
        next = setTomlValue(next, 'forced-hosts', hostname, tomlArray([entry.name]));
    }
    return next;
}

export function removeServerFromVelocityToml(content: string, name: string): string {
    let next = removeTomlKey(content, 'servers', name);

    const summary = parseVelocityToml(next);
    if (summary.tryOrder.includes(name)) {
        next = setTomlValue(next, 'servers', 'try', tomlArray(summary.tryOrder.filter(item => item !== name)));
    }
    for (const [host, names] of Object.entries(summary.forcedHosts)) {
        if (!names.includes(name)) continue;
        const rest = names.filter(item => item !== name);
        next = rest.length > 0 ? setTomlValue(next, 'forced-hosts', host, tomlArray(rest)) : removeTomlKey(next, 'forced-hosts', host);
    }
    return next;
}

/**
 * Empties `try` so no player is ever moved to a server they did not ask for. An administrator may name one
 * default server, for players that arrive without a host name (Bedrock players through Geyser have none).
 */
export function disableVelocityFallback(content: string, defaultServer?: string): string {
    const summary = parseVelocityToml(content);
    const wanted = defaultServer && defaultServer in summary.servers ? [defaultServer] : [];
    const same = summary.tryOrder.length === wanted.length && summary.tryOrder.every((name, index) => name === wanted[index]);
    return same ? content : setTomlValue(content, 'servers', 'try', tomlArray(wanted));
}

export function setVelocityForwarding(content: string, mode: ForwardingMode): string {
    return setTomlValue(content, '', 'player-info-forwarding-mode', tomlString(mode));
}

export { getTomlValue };

// ----------------------------------------------------------- BungeeCord

export interface BungeeSummary {
    forwarding: ForwardingMode;
    ipForward: boolean;
    onlineMode: boolean;
    host: string;
    motd: string;
    maxPlayers: number;
    servers: Record<string, string>;
    priorities: string[];
    forcedHosts: Record<string, string>;
}

type YamlRecord = Record<string, unknown>;

function record(value: unknown): YamlRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as YamlRecord) : {};
}

export function parseBungeeYaml(content: string, bungeeGuard = false): BungeeSummary {
    const data = record(YAML.parse(content));
    const listener = record(Array.isArray(data.listeners) ? data.listeners[0] : undefined);
    const servers: Record<string, string> = {};
    for (const [name, value] of Object.entries(record(data.servers))) {
        const address = record(value).address;
        if (typeof address === 'string') servers[name] = address;
    }
    const forcedHosts: Record<string, string> = {};
    for (const [host, value] of Object.entries(record(listener.forced_hosts))) {
        if (typeof value === 'string') forcedHosts[host] = value;
    }
    const ipForward = data.ip_forward === true;
    return {
        forwarding: !ipForward ? 'none' : bungeeGuard ? 'bungeeguard' : 'legacy',
        ipForward,
        onlineMode: data.online_mode !== false,
        host: typeof listener.host === 'string' ? listener.host : '0.0.0.0:25577',
        motd: typeof listener.motd === 'string' ? listener.motd : '',
        maxPlayers: typeof listener.max_players === 'number' ? listener.max_players : 1,
        servers,
        priorities: Array.isArray(listener.priorities) ? (listener.priorities as unknown[]).map(String) : [],
        forcedHosts,
    };
}

/** Name of a server that does not exist, used as the default server so that nobody is moved anywhere */
export const NO_FALLBACK_SERVER = 'unavailable';

/**
 * Adds a server to BungeeCord's or Waterfall's config.yml. Comments and unknown settings are kept.
 * The default server list (`priorities`) is pointed at a name that does not exist: the proxy has no server to
 * send a player to when theirs stops, so it disconnects them instead of dropping them somewhere else.
 */
export function addServerToBungeeYaml(content: string, entry: VelocityServerEntry): string {
    const doc = YAML.parseDocument(content);
    doc.setIn(['servers', entry.name], { motd: entry.name, address: entry.address, restricted: false });
    if (!doc.hasIn(['listeners', 0])) doc.setIn(['listeners'], [{}]);
    const forced = record(doc.getIn(['listeners', 0, 'forced_hosts'], false) && (doc.getIn(['listeners', 0, 'forced_hosts']) as { toJSON?: () => unknown })?.toJSON?.());
    const wanted = entry.hostnames.map(name => name.trim().toLowerCase());
    for (const [host, value] of Object.entries(forced)) {
        if (value === entry.name && !wanted.includes(host.trim().toLowerCase())) doc.deleteIn(['listeners', 0, 'forced_hosts', host]);
    }
    for (const hostname of entry.hostnames) {
        if (findForced(forced, hostname)) continue;
        doc.setIn(['listeners', 0, 'forced_hosts', hostname], entry.name);
    }
    doc.setIn(['listeners', 0, 'priorities'], [NO_FALLBACK_SERVER]);
    return doc.toString();
}

export function removeServerFromBungeeYaml(content: string, name: string): string {
    const doc = YAML.parseDocument(content);
    doc.deleteIn(['servers', name]);
    const forced = record(doc.getIn(['listeners', 0, 'forced_hosts'], false) && (doc.getIn(['listeners', 0, 'forced_hosts']) as { toJSON?: () => unknown })?.toJSON?.());
    for (const [host, value] of Object.entries(forced)) {
        if (value === name) doc.deleteIn(['listeners', 0, 'forced_hosts', host]);
    }
    return doc.toString();
}

export function setBungeeForwarding(content: string, mode: ForwardingMode): string {
    const doc = YAML.parseDocument(content);
    doc.set('ip_forward', mode === 'legacy' || mode === 'bungeeguard');
    return doc.toString();
}

// --------------------------------------------------------- plugins on a proxy or server

export interface PluginFlags {
    viaversion: boolean;
    viabackwards: boolean;
    viarewind: boolean;
    geyser: boolean;
    floodgate: boolean;
    edugeyser: boolean;
    bungeeguard: boolean;
}

/** Looks at the file names in a plugins folder */
export function detectPlugins(fileNames: string[]): PluginFlags {
    const names = fileNames.map(name => name.toLowerCase());
    const has = (pattern: RegExp) => names.some(name => pattern.test(name));
    return {
        viaversion: has(/^viaversion/),
        viabackwards: has(/^viabackwards/),
        viarewind: has(/^viarewind/),
        // EduGeyser is a Geyser fork, it ships jars with its own name
        edugeyser: has(/edugeyser/),
        geyser: has(/^geyser/) || has(/edugeyser/),
        floodgate: has(/floodgate/),
        bungeeguard: has(/bungeeguard/),
    };
}

export interface GeyserSettings {
    bedrockPort: number;
    bedrockAddress: string;
    /** Geyser reuses the Java port as its Bedrock port */
    clonesRemotePort: boolean;
    /** Port Geyser tells Bedrock clients to use, when it differs from the one it listens on (port forwarding) */
    broadcastPort?: number;
}

export function parseGeyserConfig(content: string): GeyserSettings {
    const bedrock = record(record(YAML.parse(content)).bedrock);
    return {
        bedrockPort: typeof bedrock.port === 'number' ? bedrock.port : 19132,
        bedrockAddress: typeof bedrock.address === 'string' ? bedrock.address : '0.0.0.0',
        clonesRemotePort: bedrock['clone-remote-port'] === true,
        broadcastPort: typeof bedrock['broadcast-port'] === 'number' && bedrock['broadcast-port'] > 0 ? bedrock['broadcast-port'] : undefined,
    };
}

/**
 * The address Geyser is bound to, when it is something players could use. 0.0.0.0, loopback and private
 * addresses only say where Geyser listens, not where players connect, so they are not an address to show.
 */
export function publicBedrockAddress(address: string | undefined): string | undefined {
    const value = (address ?? '').trim().toLowerCase();
    if (!value || value === '0.0.0.0' || value === '::' || value === '[::]' || value === 'localhost' || value === 'auto') return undefined;
    if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value) || /^169\.254\./.test(value)) return undefined;
    return value;
}

export interface EducationFiles {
    /** Connection IDs that Education Edition players can type in directly */
    connectionIds: Array<{ label: string; value: string }>;
    serverList?: { name: string; host: string; port: string };
}

/** Reads what EduGeyser keeps in its files: the connection IDs and the server list entry */
export function parseEducationFiles(files: { joinCode?: string; nethernet?: string; serverList?: string }): EducationFiles {
    const read = (content: string | undefined): YamlRecord => {
        try { return content ? record(YAML.parse(content)) : {}; } catch { return {}; }
    };
    const id = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

    const connectionIds: EducationFiles['connectionIds'] = [];
    const joinCode = id(read(files.joinCode)['connection-id']);
    if (joinCode) connectionIds.push({ label: 'Connection ID (works across schools)', value: joinCode });
    const nethernet = id(read(files.nethernet)['connection-id']);
    if (nethernet) connectionIds.push({ label: 'Nethernet connection ID', value: nethernet });

    const list = read(files.serverList);
    const name = id(list['server-name']);
    const host = id(list['server-ip']);
    const port = id(list['server-port']);
    return { connectionIds, serverList: name || host || port ? { name, host, port } : undefined };
}

/** BungeeGuard's proxy plugin keeps its token in token.yml (or config.yml on some builds) */
export function parseBungeeGuardToken(content: string): string | undefined {
    const data = record(YAML.parse(content));
    if (typeof data.token === 'string' && data.token) return data.token;
    const allowed = data['allowed-tokens'];
    if (Array.isArray(allowed) && typeof allowed[0] === 'string') return allowed[0];
    return undefined;
}

export interface EducationJoinInfo {
    links: string[];
    /** Output lines that mention a join code but could not be split into icons, for display as they are */
    lines: string[];
    /** Join codes made of icons (Agent, Panda, Carrot ...), in the order a player has to pick them */
    codes?: Array<{ label: string; icons: string[] }>;
    /** Connection IDs read from EduGeyser's files; they need no console */
    connectionIds?: EducationFiles['connectionIds'];
    serverList?: EducationFiles['serverList'];
    /** Why the join codes could not be read, when the files still gave something */
    notice?: string;
}

/** The log prefix (time, thread, plugin) in front of a console line */
function stripLogPrefix(line: string): string {
    return line.replace(/^(\s*(\d{4}-\d{2}-\d{2}T?\S*|\d{1,2}:\d{2}:\d{2}\S*|>\.{2,}|\[[^\]]*\]:?))+\s*/, '').trim();
}

const CONNECTION_ID = /^[0-9a-f]{16,}$/i;

/**
 * Reads the answer of `/edu joincode` from the log: the share links, the codes as icon names and the connection IDs.
 *
 * EduGeyser prints lines such as `[edu] [JoinCode] Account #1 active: Agent, Panda, Carrot, Pickaxe (name@school) | https://...`
 * and `[edu] [JoinCode] name@school: Agent, Panda, Carrot, Pickaxe | https://...`, and puts the value of
 * `Connection ID:` on the line after it. The same answer is in the log once per request, so repeats are folded
 * into one entry and the newest wins.
 */
export function parseEducationJoinOutput(text: string): EducationJoinInfo {
    const links = [...new Set((text.match(/https:\/\/education\.minecraft\.net\/joinworld\/[^\s"'<>]+/g) ?? []).map(link => link.replace(/[).,;\]|]+$/, '')))];
    const all = text.split(/\r?\n/).map(line => line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trim());

    const connectionIds = new Map<string, { label: string; value: string }>();
    const codes = new Map<string, { label: string; icons: string[] }>();
    const lines: string[] = [];

    all.forEach((line, index) => {
        if (!/join\s*code|joincode/i.test(line) || /^>?\s*\/?edu\s+joincode/i.test(line)) return;

        const idMatch = /connection id:?\s*(\S*)\s*$/i.exec(line);
        if (idMatch) {
            // The value is on the same line or on the next one
            const next = all.slice(index + 1).find(candidate => candidate !== '') ?? '';
            const value = CONNECTION_ID.test(idMatch[1]) ? idMatch[1] : (CONNECTION_ID.test(next) ? next : '');
            if (value) connectionIds.set(value, { label: 'Connection ID', value });
            return;
        }

        let bare = line.replace(/\(?https:\/\/\S+/g, '').replace(/[\s|]+$/, '');
        const account = /\(([^()\s]*@[^()\s]*)\)\s*$/.exec(bare)?.[1];
        if (account) bare = bare.replace(/\([^()]*\)\s*$/, '').trim();
        const match = /:\s*([A-Za-z][A-Za-z' -]{1,24}(?:\s*,\s*[A-Za-z][A-Za-z' -]{1,24}){2,})\s*$/.exec(bare);
        if (!match) {
            lines.push(stripLogPrefix(line));
            return;
        }
        const icons = match[1].split(',').map(part => part.trim());
        const before = bare.slice(0, match.index);
        const label = (/\[JoinCode\]\s*(.*)$/i.exec(before)?.[1] ?? stripLogPrefix(before)).trim();
        const key = icons.join();
        codes.delete(key);
        codes.set(key, { label: account && !label.includes(account) ? `${label} (${account})`.trim() : label, icons });
    });

    return {
        links,
        lines: [...new Set(lines)].slice(-8),
        codes: [...codes.values()].slice(-8),
        connectionIds: [...connectionIds.values()],
    };
}
