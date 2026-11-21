/**
 * Docker first, Portainer as the backup.
 *
 * Portainer's `/api/endpoints/<id>/docker/...` routes are a pass-through to the Docker Engine API, so every
 * container, image, network, log and exec call this app makes through Portainer can be sent to the Docker socket
 * instead, with the same request and the same answer, minus a round trip through Portainer. That is what this
 * adapter does for the Portainer client: Docker calls go to the socket, everything else (stacks, other hosts, and
 * anything that fails to reach the socket) goes to Portainer as before.
 *
 * A call only goes to the socket when it is the same Docker engine as the Portainer environment (their engine IDs
 * match), so a Portainer environment that points at another host is never answered by the wrong one.
 *
 *   DOCKER_DIRECT   auto (default: on when the socket exists), true, or false
 *   DOCKER_SOCKET   path of the socket, default /var/run/docker.sock
 *   DOCKER_HOST     unix:///path or tcp://host:port, wins over DOCKER_SOCKET
 */
import fs from 'fs';
import http from 'http';
import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

const DEFAULT_TIMEOUT_MS = 120_000;
const RETRY_AFTER_FAILURE_MS = 30_000;
const ENGINE_CHECK_MS = 10 * 60_000;
const DOCKER_ROUTE = /^\/api\/endpoints\/(\d+)\/docker(\/[^?]*)?$/;
const UNREACHABLE = new Set(['ENOENT', 'EACCES', 'EPERM', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET']);

let unreachableUntil = 0;
let warned = false;

interface Target {
    socketPath?: string;
    host?: string;
    port?: number;
}

function target(): Target {
    const host = process.env.DOCKER_HOST?.trim();
    if (host) {
        if (host.startsWith('unix://')) return { socketPath: host.slice('unix://'.length) };
        const match = host.match(/^(?:tcp|http):\/\/([^:/]+)(?::(\d+))?/i);
        if (match) return { host: match[1], port: match[2] ? parseInt(match[2], 10) : 2375 };
    }
    return { socketPath: process.env.DOCKER_SOCKET?.trim() || '/var/run/docker.sock' };
}

/** Whether Docker calls should try the socket first */
export function directDockerEnabled(): boolean {
    const mode = (process.env.DOCKER_DIRECT ?? 'auto').trim().toLowerCase();
    if (mode === 'false' || mode === 'off' || mode === '0') return false;
    if (Date.now() < unreachableUntil) return false;
    if (mode === 'true' || mode === 'on' || mode === '1') return true;
    const where = target();
    return where.socketPath ? fs.existsSync(where.socketPath) : true;
}

function noteUnreachable(error: unknown): void {
    unreachableUntil = Date.now() + RETRY_AFTER_FAILURE_MS;
    if (!warned) {
        warned = true;
        console.warn(`Direct Docker access is not working (${error instanceof Error ? error.message : String(error)}); using Portainer. Mount the Docker socket into this container or set DOCKER_DIRECT=false.`);
    }
}

interface RawResponse {
    status: number;
    headers: http.IncomingHttpHeaders;
    data: Buffer;
}

export function dockerRequest(method: string, path: string, body?: string | Buffer, contentType?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RawResponse> {
    const where = target();
    const payload = body === undefined ? undefined : Buffer.from(body);

    return new Promise((resolve, reject) => {
        const req = http.request({
            ...where,
            method,
            path,
            headers: payload ? { 'Content-Type': contentType ?? 'application/json', 'Content-Length': payload.length } : undefined,
            timeout: timeoutMs,
        }, response => {
            const chunks: Buffer[] = [];
            response.on('data', chunk => chunks.push(chunk as Buffer));
            response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, data: Buffer.concat(chunks) }));
            response.on('error', reject);
        });
        req.on('timeout', () => req.destroy(new Error('Docker did not answer in time')));
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

/**
 * Docker sends the output of containers without a terminal as frames: one byte for the stream, three zero bytes,
 * four bytes for the length, then the text. Containers with a terminal send the plain text.
 */
export function demultiplex(data: Buffer): string {
    const looksFramed = data.length >= 8 && data[0] <= 2 && data[1] === 0 && data[2] === 0 && data[3] === 0;
    if (!looksFramed) return data.toString('utf-8');

    let text = '';
    let offset = 0;
    while (offset + 8 <= data.length) {
        const length = data.readUInt32BE(offset + 4);
        const end = Math.min(offset + 8 + length, data.length);
        text += data.subarray(offset + 8, end).toString('utf-8');
        offset = end;
    }
    return text;
}

const engineChecks = new Map<number, { same: boolean; at: number }>();

/** Whether the Docker socket belongs to the engine behind this Portainer environment */
async function sameEngine(environmentId: number, config: InternalAxiosRequestConfig, portainer: AxiosAdapter): Promise<boolean> {
    const known = engineChecks.get(environmentId);
    if (known && Date.now() - known.at < (known.same ? ENGINE_CHECK_MS : RETRY_AFTER_FAILURE_MS)) return known.same;

    let same = false;
    try {
        const local = await dockerRequest('GET', '/info', undefined, undefined, 10_000);
        const localId = local.status === 200 ? (JSON.parse(local.data.toString('utf-8')) as { ID?: string }).ID : undefined;
        if (localId) {
            const remote = await portainer({ ...config, method: 'get', url: `/api/endpoints/${environmentId}/docker/info`, params: undefined, data: undefined, responseType: 'json', transformResponse: undefined, timeout: 10_000 });
            const remoteData = typeof remote.data === 'string' ? JSON.parse(remote.data) : remote.data;
            same = Boolean(remoteData?.ID) && remoteData.ID === localId;
        }
    } catch (error) {
        if (UNREACHABLE.has((error as NodeJS.ErrnoException)?.code ?? '')) noteUnreachable(error);
    }
    engineChecks.set(environmentId, { same, at: Date.now() });
    return same;
}

/**
 * Wraps the adapter of the Portainer client. Calls to a Portainer environment's Docker routes go to the Docker
 * socket when it is the same engine; the rest, and any call that cannot reach the socket, uses `portainer`.
 */
export function withDirectDocker(portainer: AxiosAdapter): AxiosAdapter {
    return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        const method = (config.method ?? 'get').toUpperCase();
        if (!directDockerEnabled() || !['GET', 'POST', 'PUT', 'DELETE', 'HEAD'].includes(method) || config.responseType === 'stream') return portainer(config);

        let url: URL;
        try {
            url = new URL(axios.getUri(config), 'http://portainer.invalid');
        } catch {
            return portainer(config);
        }
        const route = DOCKER_ROUTE.exec(url.pathname);
        if (!route) return portainer(config);
        if (!(await sameEngine(Number(route[1]), config, portainer))) return portainer(config);

        const dockerPath = `${route[2] ?? '/'}${url.search}`;
        const contentType = typeof config.headers?.get === 'function' ? (config.headers.get('Content-Type') as string | undefined) : undefined;
        let raw: RawResponse;
        try {
            raw = await dockerRequest(method, dockerPath, config.data ?? undefined, contentType, config.timeout || DEFAULT_TIMEOUT_MS);
        } catch (error) {
            // Not reached the engine, so nothing ran: Portainer can still do it. A timeout may have run it, so it is not repeated.
            if (UNREACHABLE.has((error as NodeJS.ErrnoException)?.code ?? '')) {
                noteUnreachable(error);
                return portainer(config);
            }
            throw error;
        }

        // Private registries: Portainer holds the credentials for them
        if (raw.status >= 400 && method === 'POST' && /^\/images\/create/.test(dockerPath)) return portainer(config);

        const contentTypeHeader = String(raw.headers['content-type'] ?? '');
        const framed = /vnd\.docker\.(raw|multiplexed)-stream/.test(contentTypeHeader) || /^\/containers\/[^/]+\/logs/.test(dockerPath);
        const data: unknown = config.responseType === 'arraybuffer' ? raw.data : framed ? demultiplex(raw.data) : raw.data.toString('utf-8');

        const responseHeaders = new AxiosHeaders(Object.fromEntries(Object.entries(raw.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value ?? '')])));
        const response: AxiosResponse = { data, status: raw.status, statusText: http.STATUS_CODES[raw.status] ?? '', headers: responseHeaders, config, request: {} };
        // The default response transform turns JSON text into objects, like it does for Portainer's answers
        response.data = config.transformResponse && typeof data === 'string'
            ? [config.transformResponse].flat().reduce((current, transform) => transform.call(config, current, responseHeaders, raw.status), data as unknown)
            : data;

        if (!config.validateStatus || config.validateStatus(raw.status)) return response;
        throw new AxiosError(`Request failed with status code ${raw.status}`, raw.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, {}, response);
    };
}
