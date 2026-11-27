export interface ServerInfo {
    uniqueId: string;
    name: string;
    subdomain: string;
    owner: string;
    isOwner: boolean;
    isAdmin: boolean;
    kind: 'server' | 'proxy';
    serverType?: string;
    version?: string;
    port: number;
    imported: boolean;
    startGuard?: { stoppedAt: string; failures: number; exitCode?: number; lastLog?: string };
    proxy?: { type?: string; forwarding?: string; enabled: boolean };
}

export type ServerStatus = 'online' | 'offline' | 'starting' | 'stopping' | 'crashed' | 'paused' | 'unhealthy' | 'loading';

export interface ServerStats {
    status: ServerStatus;
    playersOnline: number;
    maxPlayers: number;
    ramUsage: number;
    maxRam: number;
    cpuUsage: number;
    networkRx: number;
    networkTx: number;
    recommendations: string[];
    error?: string;
}

export interface JoinAddress {
    proxyId: string;
    proxyName: string;
    kind: 'velocity' | 'bungeecord' | 'waterfall';
    forwarding: 'modern' | 'bungeeguard' | 'legacy' | 'none';
    java: string;
    bedrock?: { host: string; port: number };
    edugeyser: boolean;
}

export interface NetworkWarning {
    code: string;
    message: string;
    port?: number;
}

export interface NetworkStatus {
    connected: boolean;
    forwarding?: string;
    links?: Array<{ proxyName: string; forwarding: string }>;
    joinAddresses: JoinAddress[];
    port?: number;
    warnings: NetworkWarning[];
    locked: boolean;
    syncedAt: string | null;
}

export type TabId = 'overview' | 'players' | 'console' | 'files' | 'backups' | 'settings' | 'network' | 'addons' | 'world' | 'admin';

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown, method: 'POST' | 'DELETE' | 'PATCH' | 'PUT' = 'POST'): Promise<{ ok: boolean; body: T & { message?: string; error?: string } }> {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: response.ok, body: await response.json().catch(() => ({})) };
}
