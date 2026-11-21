/**
 * Downloads for plugins and mods. Users can paste any link, so this must never be turned into a way to reach
 * things inside the network of this machine (Portainer, Docker, cloud metadata, other containers): every host is
 * resolved first and refused when it points at a private or local address, redirects are checked the same way.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

export const USER_AGENT = 'enVId-tech/MC-Server-Manager-UI (plugin and mod manager)';
export const MAX_ADDON_BYTES = 200 * 1024 * 1024;

function privateV4(ip: string): boolean {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

export function isPrivateAddress(ip: string): boolean {
    if (net.isIPv4(ip)) return privateV4(ip);
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return true;
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return privateV4(mapped[1]);
        return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb');
    }
    return true;
}

/** Throws unless the URL is http(s) and every address of its host is public */
export async function assertPublicUrl(raw: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('That is not a valid link.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http and https links can be used.');
    if (url.username || url.password) throw new Error('Links with a user name or password are not accepted.');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('That address is not reachable from the internet.');
    const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map(entry => entry.address);
    if (addresses.length === 0) throw new Error(`The host ${host} could not be found.`);
    if (addresses.some(isPrivateAddress)) throw new Error('That address is not reachable from the internet.');
    return url;
}

export interface SafeResponse {
    response: Response;
    /** The address after redirects */
    finalUrl: string;
}

/** fetch() that checks the target of the request and of every redirect */
export async function safeFetch(raw: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<SafeResponse> {
    let current = raw;
    for (let hop = 0; hop < 6; hop++) {
        const url = await assertPublicUrl(current);
        const response = await fetch(url, {
            ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
            headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
        });
        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            current = new URL(response.headers.get('location') as string, url).toString();
            await response.body?.cancel().catch(() => undefined);
            continue;
        }
        return { response, finalUrl: url.toString() };
    }
    throw new Error('The link redirects too many times.');
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const { response } = await safeFetch(url, { headers: { Accept: 'application/json', ...headers } }, 20_000);
    if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
    return (await response.json()) as T;
}

/** Downloads a file into memory, refusing anything larger than the limit */
export async function downloadFile(url: string): Promise<{ data: Buffer; finalUrl: string; etag?: string; filename?: string }> {
    const { response, finalUrl } = await safeFetch(url, {}, 120_000);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_ADDON_BYTES) throw new Error('The file is larger than 200 MB.');
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The download had no content.');
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_ADDON_BYTES) { await reader.cancel(); throw new Error('The file is larger than 200 MB.'); }
        chunks.push(Buffer.from(value));
    }
    if (total === 0) throw new Error('The downloaded file is empty.');
    const disposition = response.headers.get('content-disposition') ?? '';
    const named = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
    return { data: Buffer.concat(chunks), finalUrl, etag: response.headers.get('etag') ?? response.headers.get('last-modified') ?? undefined, filename: named ? decodeURIComponent(named) : undefined };
}
