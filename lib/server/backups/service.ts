import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import dbConnect from '@/lib/db/dbConnect';
import Backup, { type IBackup } from '@/lib/objects/Backup';
import Server, { type IServer } from '@/lib/objects/Server';
import portainer from '@/lib/server/portainer';
import serverStorage, { getLocalStorageRoot } from '@/lib/server/storage';
import { createBackupStream } from '@/lib/server/backup';
import { getContainerName } from '@/lib/server/containerNames';
import { getServerBasePath, getServerFolderPath } from '@/lib/server/serverPaths';
import { listProxies } from '@/lib/server/network/service';
import { effectivePolicy, getBackupDefaults } from './settings';

/** Most that is held in memory when the storage is WebDAV, which cannot be written as a stream */
const MAX_WEBDAV_BYTES = 1024 * 1024 * 1024;
/** A failing backup is tried again after at most this long */
const RETRY_HOURS = 1;
/** Automatic backups started per run, so a first run on many servers does not read every disk at once */
const PER_RUN = 2;

const running = new Set<string>();

function backupFolder(serverId: string): string {
    return `${getServerBasePath()}/.backups/${serverId}`;
}

function stamp(date: Date): string {
    return date.toISOString().replace(/\.\d+Z$/, '').replace('T', '_').replace(/:/g, '-');
}

/** Absolute path of a storage path on this machine, only for local storage and never outside its root */
function localPath(virtualPath: string): string | null {
    const root = getLocalStorageRoot();
    if (!root) return null;
    const absolute = path.resolve(root, `.${virtualPath}`);
    return absolute.startsWith(path.resolve(root) + path.sep) ? absolute : null;
}

/** Writes a zip stream to the storage. Local storage is written as a stream, WebDAV in one piece */
async function writeZip(virtualPath: string, source: Readable): Promise<number> {
    const target = localPath(virtualPath);
    if (target) {
        await fsp.mkdir(path.dirname(target), { recursive: true });
        const partial = `${target}.partial`;
        try {
            await pipeline(source, fs.createWriteStream(partial));
            await fsp.rename(partial, target);
        } catch (error) {
            await fsp.rm(partial, { force: true });
            throw error;
        }
        return (await fsp.stat(target)).size;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of source) {
        const buffer = Buffer.from(chunk as Buffer);
        size += buffer.length;
        if (size > MAX_WEBDAV_BYTES) throw new Error('The backup is too large to store over WebDAV. Use local storage for big servers.');
        chunks.push(buffer);
    }
    const folder = path.posix.dirname(virtualPath);
    for (const part of [`${getServerBasePath()}/.backups`, folder]) {
        if (!(await serverStorage.exists(part))) await serverStorage.createDirectory(part);
    }
    await serverStorage.uploadFile(virtualPath, Buffer.concat(chunks), true);
    return size;
}

/** The zip of a backup as a stream for the download */
export async function readBackup(backup: Pick<IBackup, 'path'>): Promise<Readable> {
    const local = localPath(backup.path);
    if (local) {
        await fsp.access(local);
        return fs.createReadStream(local);
    }
    return Readable.from(await serverStorage.getFileContents(backup.path));
}

/** Secrets that must not be in any backup: the forwarding secrets of the proxies and the server's RCON password */
export async function collectSecrets(server: IServer): Promise<string[]> {
    const proxies = await listProxies().catch(() => []);
    const values = [...proxies.map(proxy => proxy.secret), server.serverConfig?.rconPassword];
    return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length >= 8))];
}

/**
 * Asks a running server to flush its world to disk and stop writing while the files are copied, and returns a
 * function that lets it write again. Best effort: a server without RCON is copied as it is.
 */
async function pauseSaving(server: IServer): Promise<() => Promise<void>> {
    const nothing = async () => undefined;
    try {
        const environmentId = await portainer.getValidEnvironmentId(server.environmentId ?? (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID, 10) : null));
        const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId);
        if (!container || container.State !== 'running') return nothing;
        const rcon = (command: string) => portainer.executeCommand(container.Id, `rcon-cli ${command}`, environmentId);
        const off = await rcon('save-off');
        if (off.exitCode !== 0) return nothing;
        await rcon('save-all flush').catch(() => undefined);
        return async () => {
            try {
                await rcon('save-on');
            } catch (error) {
                console.warn(`[backups] could not switch saving back on for ${server.serverName}:`, error instanceof Error ? error.message : error);
            }
        };
    } catch {
        return nothing;
    }
}

/** Makes a backup of a server and records it. The zip never holds proxy secrets, see lib/server/backup.ts */
export async function createServerBackup(server: IServer, kind: 'auto' | 'manual'): Promise<IBackup> {
    await dbConnect();
    if (running.has(server.uniqueId)) throw new Error('A backup of this server is already running.');
    running.add(server.uniqueId);
    const started = new Date();
    try {
        const base = getServerFolderPath(server, server.email);
        if (!(await serverStorage.exists(base))) throw new Error('The server folder was not found.');

        const safeName = server.serverName.replace(/[^\w.-]+/g, '_') || 'server';
        const fileName = `${safeName}-${stamp(started)}.zip`;
        const virtualPath = `${backupFolder(server.uniqueId)}/${stamp(started)}-${kind}.zip`;

        const secrets = await collectSecrets(server);
        const resume = await pauseSaving(server);
        let sizeBytes: number;
        try {
            sizeBytes = await writeZip(virtualPath, createBackupStream(base, { secrets }));
        } finally {
            await resume();
        }

        const record = await Backup.create({ serverId: server.uniqueId, serverName: server.serverName, ownerEmail: server.email, kind, fileName, path: virtualPath, sizeBytes });
        await Server.updateOne({ _id: server._id }, { $set: { lastBackupAt: new Date(), lastBackupAttemptAt: started }, $unset: { lastBackupError: '' } });
        return record;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'The backup failed.';
        await Server.updateOne({ _id: server._id }, { $set: { lastBackupAttemptAt: started, lastBackupError: message.slice(0, 300) } });
        throw error;
    } finally {
        running.delete(server.uniqueId);
    }
}

export function isBackupRunning(serverId: string): boolean {
    return running.has(serverId);
}

/** Deletes one backup: its file and its record */
export async function deleteBackup(backup: IBackup): Promise<void> {
    try {
        await serverStorage.deleteFile(backup.path);
    } catch {
        // A file that is already gone is what was wanted
    }
    await Backup.deleteOne({ _id: backup._id });
}

/** Deletes every backup of a server, for when the server itself is deleted */
export async function deleteAllBackups(serverId: string): Promise<number> {
    await dbConnect();
    const all = await Backup.find({ serverId });
    for (const backup of all) await deleteBackup(backup);
    try {
        await serverStorage.deleteDirectoryRecursively(backupFolder(serverId));
    } catch {
        // Nothing was there
    }
    return all.length;
}

/** Deletes the oldest automatic backups beyond the number to keep. Backups made by hand are never pruned */
export async function pruneBackups(serverId: string, keep: number): Promise<number> {
    const automatic = await Backup.find({ serverId, kind: 'auto' }).sort({ createdAt: -1 });
    const surplus = automatic.slice(keep);
    for (const backup of surplus) await deleteBackup(backup);
    return surplus.length;
}

/** Servers whose automatic backup is due, the longest overdue first */
export async function findDueServers(now = Date.now()): Promise<IServer[]> {
    const defaults = await getBackupDefaults();
    const servers = await Server.find({ kind: { $ne: 'proxy' }, lastDeploymentStatus: { $ne: 'running' } });
    return servers
        .map(server => {
            const policy = effectivePolicy(server, defaults);
            const failed = Boolean(server.lastBackupError);
            const reference = (failed ? server.lastBackupAttemptAt : server.lastBackupAt)?.getTime() ?? 0;
            const wait = (failed ? Math.min(policy.intervalHours, RETRY_HOURS) : policy.intervalHours) * 3_600_000;
            return { server, policy, due: policy.enabled && now - reference >= wait, overdue: now - reference };
        })
        .filter(item => item.due)
        .sort((a, b) => b.overdue - a.overdue)
        .map(item => item.server);
}

/** The background job: makes the backups that are due and removes the ones beyond the number to keep */
export async function runScheduledBackups(): Promise<string[]> {
    await dbConnect();
    const defaults = await getBackupDefaults();
    const notes: string[] = [];
    for (const server of (await findDueServers()).slice(0, PER_RUN)) {
        try {
            await createServerBackup(server, 'auto');
            const removed = await pruneBackups(server.uniqueId, effectivePolicy(server, defaults).keep);
            notes.push(`${server.serverName}: backed up${removed ? `, ${removed} old removed` : ''}`);
        } catch (error) {
            notes.push(`${server.serverName}: ${error instanceof Error ? error.message : 'failed'}`);
        }
    }
    // Servers whose policy now keeps fewer copies are trimmed too, even when nothing is due
    for (const server of await Server.find({ kind: { $ne: 'proxy' } }, 'uniqueId backupPolicy')) {
        await pruneBackups(server.uniqueId, effectivePolicy(server, defaults).keep).catch(() => undefined);
    }
    return notes;
}
