import type { IServer } from '@/lib/objects/Server';
import type { IUser } from '@/lib/objects/User';

/**
 * What ordinary users may see and change. Everything that belongs to the host (container, ports, memory,
 * the proxy network and its secrets) is administrator territory; the rules live here so every route
 * applies the same ones.
 */

/** itzg variables that describe how the container runs or how it joins the network. Administrators only */
export const MANAGEMENT_LOCKED_ENV = [
    'MEMORY', 'INIT_MEMORY', 'MAX_MEMORY', 'JVM_OPTS', 'JVM_XX_OPTS', 'JVM_DD_OPTS', 'EXTRA_ARGS',
    'UID', 'GID', 'SERVER_PORT', 'QUERY_PORT', 'SERVER_HOST',
    'ENABLE_RCON', 'RCON_PASSWORD', 'RCON_PORT', 'RCON_PASSWORD_FILE', 'ENABLE_QUERY',
    'ONLINE_MODE', 'PREVENT_PROXY_CONNECTIONS', 'ENFORCE_SECURE_PROFILE', 'NETWORK_FORWARDING',
    'CUSTOM_SERVER', 'PROXY', 'EXEC_DIRECTLY', 'ENABLE_AUTOPAUSE', 'ENABLE_JMX', 'JMX_HOST',
] as const;

/** server.properties keys with the same meaning */
export const MANAGEMENT_LOCKED_PROPERTIES = [
    'server-port', 'server-ip', 'query.port', 'enable-query', 'enable-rcon', 'rcon.port', 'rcon.password',
    'online-mode', 'prevent-proxy-connections', 'enforce-secure-profile', 'enable-jmx-monitoring',
] as const;

/** Values users never get to read, even in a disabled input */
export const SECRET_ENV = ['RCON_PASSWORD', 'RCON_PASSWORD_FILE', 'NETWORK_FORWARDING'] as const;
export const SECRET_PROPERTIES = ['rcon.password'] as const;

/** Fields of the create request that only administrators may set */
export const ADMIN_ONLY_CREATE_FIELDS = [
    'serverMemory', 'port', 'rconEnabled', 'rconPassword', 'onlineMode', 'preventProxyConnections',
    'proxyIds', 'environmentId', 'enableJmxMonitoring',
] as const;

export function lockedEnvFor(user: Pick<IUser, 'isAdmin'>): readonly string[] {
    return user.isAdmin ? [] : MANAGEMENT_LOCKED_ENV;
}

export function lockedPropertiesFor(user: Pick<IUser, 'isAdmin'>): readonly string[] {
    return user.isAdmin ? [] : MANAGEMENT_LOCKED_PROPERTIES;
}

/** Removes the locked keys from a map and reports which ones were dropped */
export function dropLocked<T extends Record<string, unknown>>(values: T, locked: readonly string[]): { values: T; dropped: string[] } {
    const copy: Record<string, unknown> = { ...values };
    const dropped: string[] = [];
    for (const key of locked) {
        if (key in copy) {
            delete copy[key];
            dropped.push(key);
        }
    }
    return { values: copy as T, dropped };
}

/** Same, for what is sent to a browser: the secret ones disappear, the other locked ones stay visible but disabled */
export function redactSecrets<T extends Record<string, unknown>>(values: T, secrets: readonly string[]): T {
    return dropLocked(values, secrets).values;
}

// ---- Files -------------------------------------------------------------------------------------------------

const HIDDEN_NAMES = new Set([
    'forwarding.secret', 'velocity-secret', 'key.pem', 'floodgate-key.pem', 'paper-global.yml', 'paper.yml',
]);

/** Folders and file name prefixes that expose the proxy, its keys or the Bedrock bridge */
const HIDDEN_PREFIXES = ['geyser', 'floodgate', 'edugeyser', 'bungeeguard', 'viaproxy'];

/**
 * True for a path inside a server folder that ordinary users must not see: forwarding secrets, the Paper file that
 * stores them, BungeeGuard, Geyser and Floodgate (with their keys). Works on every depth and ignores case.
 */
export function isHiddenFromUsers(relativePath: string): boolean {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean).map(part => part.toLowerCase());
    return parts.some((part, index) => {
        if (HIDDEN_NAMES.has(part)) return true;
        // Plugin jars and their data folders live under plugins/ and mods/
        const inPluginFolder = index > 0 && (parts[index - 1] === 'plugins' || parts[index - 1] === 'mods');
        return inPluginFolder && HIDDEN_PREFIXES.some(prefix => part.startsWith(prefix));
    });
}

/** Normalises a path coming from the browser and refuses anything that climbs out of the server folder */
export function cleanRelativePath(input: string): string | null {
    const normalized = input.replace(/\\/g, '/');
    if (normalized.includes('\0')) return null;
    const stack: string[] = [];
    for (const part of normalized.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') return null;
        stack.push(part);
    }
    return '/' + stack.join('/');
}

export interface FileAccess {
    /** The owner may add files, including worlds */
    uploads: boolean;
    /** The owner may edit, create and delete files */
    editing: boolean;
}

export function getFileAccess(server: Pick<IServer, 'serverConfig'>): FileAccess {
    const stored = (server.serverConfig as unknown as { fileAccess?: Partial<FileAccess> } | undefined)?.fileAccess;
    return { uploads: stored?.uploads === true, editing: stored?.editing === true };
}

export type FileAction = 'read' | 'upload' | 'edit';

/** Administrators always may. Owners may read; uploading and editing need the toggles on that server */
export function canUseFiles(user: Pick<IUser, 'isAdmin'>, server: Pick<IServer, 'serverConfig'>, action: FileAction): boolean {
    if (user.isAdmin || action === 'read') return true;
    const access = getFileAccess(server);
    return action === 'upload' ? access.uploads : access.editing;
}

export const FILE_ACCESS_DENIED: Record<Exclude<FileAction, 'read'>, string> = {
    upload: 'Uploading files is switched off for this server. Turn it on in the Files tab first.',
    edit: 'Editing files is switched off for this server. Turn it on in the Files tab first.',
};

// ---- Backups -----------------------------------------------------------------------------------------------

/**
 * Cleans a file that goes into a downloaded backup. Returns null when the file must not be included at all,
 * the cleaned text for configuration files that carry proxy settings, or undefined when it is fine as it is.
 */
export function sanitizeForBackup(relativePath: string, content: Buffer): Buffer | null | undefined {
    if (isHiddenFromUsers(relativePath)) {
        const name = relativePath.split('/').pop()?.toLowerCase() ?? '';
        // paper-global.yml is a real settings file: keep it with the secret removed instead of dropping it
        if (name !== 'paper-global.yml' && name !== 'paper.yml') return null;
    }

    const name = relativePath.split('/').pop()?.toLowerCase() ?? '';
    if (name === 'paper-global.yml' || name === 'paper.yml') {
        return Buffer.from(content.toString('utf8')
            .replace(/^(\s*secret:\s*).*$/gim, "$1''")
            .replace(/((?:velocity|velocity-support):[ \t]*\n(?:[ \t]+(?!enabled)[^\n]*\n)*?[ \t]+enabled:[ \t]*)true/i, '$1false')
            .replace(/^(\s*bungee-online-mode:\s*)false/gim, '$1true'));
    }
    if (name === 'spigot.yml') {
        return Buffer.from(content.toString('utf8').replace(/^(\s*bungeecord:\s*)true/gim, '$1false'));
    }
    if (name === 'server.properties') {
        return Buffer.from(content.toString('utf8')
            .replace(/^online-mode=false$/gim, 'online-mode=true')
            .replace(/^prevent-proxy-connections=.*$/gim, 'prevent-proxy-connections=false')
            .replace(/^rcon\.password=.*$/gim, 'rcon.password=')
            .replace(/^server-ip=.*$/gim, 'server-ip='));
    }
    if (name === 'bukkit.yml' || name === 'config.yml' || name === 'velocity.toml') {
        return undefined;
    }
    return undefined;
}

// ---- server.properties ---------------------------------------------------------------------------------------

const LOCKED_PROPERTY_SET = new Set<string>(MANAGEMENT_LOCKED_PROPERTIES);

/** What a user sees when opening server.properties: the RCON password and the bind address are blanked */
export function redactServerProperties(text: string): string {
    return text.replace(/^(rcon\.password|server-ip)=.*$/gim, '$1=');
}

/**
 * Applies a user's edit of server.properties without letting it touch the locked keys: their lines are taken
 * from the file as it is now, whatever the editor sent.
 */
export function protectServerProperties(existing: string, incoming: string): string {
    const current = new Map<string, string>();
    for (const line of existing.split(/\r?\n/)) {
        const match = /^([^#!=\s][^=]*)=(.*)$/.exec(line);
        if (match && LOCKED_PROPERTY_SET.has(match[1].trim())) current.set(match[1].trim(), line);
    }

    const seen = new Set<string>();
    const lines = incoming.split(/\r?\n/).flatMap(line => {
        const match = /^([^#!=\s][^=]*)=(.*)$/.exec(line);
        if (!match || !LOCKED_PROPERTY_SET.has(match[1].trim())) return [line];
        const key = match[1].trim();
        seen.add(key);
        return current.has(key) ? [current.get(key) as string] : [];
    });
    for (const [key, line] of current) {
        if (!seen.has(key)) lines.push(line);
    }
    return lines.join('\n');
}
