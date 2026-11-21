/**
 * Talks to the Docker Engine directly, through its socket, for the things that have to be quick: running a command
 * in a container and reading its log. Going through Portainer adds a round trip per request and its own session
 * handling, which made console commands take seconds.
 *
 * It is used when the Docker socket is reachable from this app (mount /var/run/docker.sock into the container, or set
 * DOCKER_HOST) and only for containers that live on that Docker host. Anything else, and any failure, falls back to
 * Portainer, so switching it on can never make a command fail that worked before.
 *
 *   DOCKER_DIRECT   auto (default: on when the socket exists), true, or false
 *   DOCKER_SOCKET   path of the socket, default /var/run/docker.sock
 *   DOCKER_HOST     unix:///path or tcp://host:port, wins over DOCKER_SOCKET
 */
import fs from 'fs';
import http from 'http';

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_AFTER_FAILURE_MS = 30_000;

let unreachableUntil = 0;
let warned = false;

interface Target {
    socketPath?: string;
    host?: string;
    port?: number;
}

function target(): Target | null {
    const host = process.env.DOCKER_HOST?.trim();
    if (host) {
        if (host.startsWith('unix://')) return { socketPath: host.slice('unix://'.length) };
        const match = host.match(/^(?:tcp|http):\/\/([^:/]+)(?::(\d+))?/i);
        if (match) return { host: match[1], port: match[2] ? parseInt(match[2], 10) : 2375 };
    }
    return { socketPath: process.env.DOCKER_SOCKET?.trim() || '/var/run/docker.sock' };
}

/** Whether commands should try Docker first */
export function directDockerEnabled(): boolean {
    const mode = (process.env.DOCKER_DIRECT ?? 'auto').trim().toLowerCase();
    if (mode === 'false' || mode === 'off' || mode === '0') return false;
    if (Date.now() < unreachableUntil) return false;
    const where = target();
    if (!where) return false;
    if (mode === 'true' || mode === 'on' || mode === '1') return true;
    return where.socketPath ? fs.existsSync(where.socketPath) : true;
}

function noteFailure(error: unknown): void {
    unreachableUntil = Date.now() + RETRY_AFTER_FAILURE_MS;
    if (!warned) {
        warned = true;
        console.warn(`Direct Docker access is not working (${error instanceof Error ? error.message : String(error)}); using Portainer. Mount the Docker socket into this container or set DOCKER_DIRECT=false.`);
    }
}

function request(method: string, path: string, body?: unknown): Promise<{ status: number; data: Buffer }> {
    const where = target();
    if (!where) return Promise.reject(new Error('No Docker endpoint configured'));
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));

    return new Promise((resolve, reject) => {
        const req = http.request({
            ...where,
            method,
            path,
            headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : undefined,
            timeout: REQUEST_TIMEOUT_MS,
        }, response => {
            const chunks: Buffer[] = [];
            response.on('data', chunk => chunks.push(chunk as Buffer));
            response.on('end', () => resolve({ status: response.statusCode ?? 0, data: Buffer.concat(chunks) }));
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

function failed(response: { status: number; data: Buffer }, what: string): Error {
    let message = '';
    try { message = (JSON.parse(response.data.toString('utf-8')) as { message?: string }).message ?? ''; } catch { /* plain text */ }
    return new Error(`Docker ${what} failed (${response.status})${message ? `: ${message}` : ''}`);
}

/** Runs a shell command in a container. Throws when Docker cannot be reached or does not know the container. */
export async function dockerExec(containerId: string, command: string): Promise<{ output: string; exitCode: number }> {
    try {
        const created = await request('POST', `/containers/${encodeURIComponent(containerId)}/exec`, {
            AttachStdout: true, AttachStderr: true, Cmd: ['/bin/sh', '-c', command],
        });
        if (created.status !== 201) throw failed(created, 'exec');
        const execId = (JSON.parse(created.data.toString('utf-8')) as { Id: string }).Id;

        const started = await request('POST', `/exec/${execId}/start`, { Detach: false, Tty: false });
        if (started.status !== 200) throw failed(started, 'exec start');

        const inspected = await request('GET', `/exec/${execId}/json`);
        const exitCode = inspected.status === 200 ? (JSON.parse(inspected.data.toString('utf-8')) as { ExitCode?: number }).ExitCode : undefined;
        return { output: demultiplex(started.data), exitCode: typeof exitCode === 'number' ? exitCode : 0 };
    } catch (error) {
        noteFailureIfUnreachable(error);
        throw error;
    }
}

/** The log of a container, as plain text with timestamps */
export async function dockerLogs(containerId: string, tail: number): Promise<string> {
    try {
        const response = await request('GET', `/containers/${encodeURIComponent(containerId)}/logs?stdout=1&stderr=1&tail=${tail}&timestamps=1`);
        if (response.status !== 200) throw failed(response, 'logs');
        return demultiplex(response.data);
    } catch (error) {
        noteFailureIfUnreachable(error);
        throw error;
    }
}

/** Only a socket that cannot be reached switches direct access off for a while; an unknown container does not */
function noteFailureIfUnreachable(error: unknown): void {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'EACCES' || code === 'ECONNREFUSED' || code === 'EPERM' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') noteFailure(error);
}
