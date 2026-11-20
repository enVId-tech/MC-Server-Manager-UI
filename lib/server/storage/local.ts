import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { ServerStorage, StorageEntry } from './types';

const DIRECTORY_MODE = 0o755;
const FILE_MODE = 0o644;

const MIME_TYPES: Record<string, string> = {
    '.txt': 'text/plain',
    '.log': 'text/plain',
    '.properties': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.yml': 'application/yaml',
    '.yaml': 'application/yaml',
    '.toml': 'application/toml',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.jar': 'application/java-archive',
    '.zip': 'application/zip',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
};

export interface LocalStorageOptions {
    /** Owner applied to everything this class creates, for example the 1000:1000 user the Minecraft containers run as */
    owner?: { uid: number; gid: number };
}

/**
 * Parse values such as "1000:1000" (LOCAL_STORAGE_OWNER). Returns undefined for an empty value.
 */
export function parseOwner(value: string | undefined): LocalStorageOptions['owner'] {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;

    const match = /^(\d+):(\d+)$/.exec(trimmed);
    if (!match) {
        throw new Error(`LOCAL_STORAGE_OWNER must look like "1000:1000", got "${trimmed}".`);
    }
    return { uid: Number(match[1]), gid: Number(match[2]) };
}

type StorageError = Error & { code?: string; status?: number };

function storageError(message: string, code: string, status: number): StorageError {
    return Object.assign(new Error(message), { code, status });
}

function isWithin(root: string, candidate: string): boolean {
    return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}

/**
 * Stores server files in a folder on this machine instead of on a WebDAV server.
 *
 * Paths handed to this class are virtual (`/minecraft-servers/alex/abc/server.properties`) and are
 * mapped under `rootPath`. Every operation is confined to that folder:
 *  - `..` segments and NUL bytes are rejected
 *  - symbolic links are resolved and must still point inside the root, because server owners (and
 *    the plugins that run in their containers) can create links inside their own folders
 *  - files are written to a temporary file and renamed into place, which replaces a symlink rather
 *    than writing through it and avoids half-written configuration files
 */
export class LocalStorage implements ServerStorage {
    public readonly kind = 'local' as const;
    private readonly root: string;
    private readonly owner?: { uid: number; gid: number };
    private realRootPromise: Promise<string> | null = null;
    private warnedAboutOwner = false;

    public constructor(rootPath: string, options: LocalStorageOptions = {}) {
        this.owner = options.owner;
        if (!rootPath || !path.isAbsolute(rootPath)) {
            throw new Error('LOCAL_STORAGE_PATH must be an absolute path.');
        }
        this.root = path.resolve(rootPath);
        if (this.root === path.parse(this.root).root) {
            throw new Error('LOCAL_STORAGE_PATH must not be the filesystem root.');
        }
    }

    /** Folder on this machine that virtual path `/` maps to. */
    public get rootPath(): string {
        return this.root;
    }

    /** Host path of a virtual path, for building container bind mounts. */
    public toHostPath(virtualPath: string): string {
        return this.toAbsolute(virtualPath);
    }

    private getRealRoot(): Promise<string> {
        if (!this.realRootPromise) {
            this.realRootPromise = fs
                .mkdir(this.root, { recursive: true, mode: DIRECTORY_MODE })
                .then(() => fs.realpath(this.root))
                .catch(error => {
                    this.realRootPromise = null;
                    throw error;
                });
        }
        return this.realRootPromise;
    }

    private normalizeVirtual(virtualPath: string): string {
        if (typeof virtualPath !== 'string' || virtualPath.includes('\0')) {
            throw storageError('Invalid path.', 'EINVAL', 400);
        }
        const segments = virtualPath.replace(/\\/g, '/').split('/').filter(segment => segment !== '' && segment !== '.');
        if (segments.includes('..')) {
            throw storageError('Path traversal is not allowed.', 'EACCES', 403);
        }
        return '/' + segments.join('/');
    }

    private toAbsolute(virtualPath: string): string {
        const normalized = this.normalizeVirtual(virtualPath);
        const absolute = path.join(this.root, ...normalized.split('/').filter(Boolean));
        if (!isWithin(this.root, absolute)) {
            throw storageError('Path is outside the storage folder.', 'EACCES', 403);
        }
        return absolute;
    }

    /**
     * Resolve a virtual path and make sure it, or for a missing path its closest existing parent,
     * really lives inside the storage folder once symlinks are followed.
     *
     * `followFinal: false` skips following the last component so a link itself can be removed,
     * renamed or replaced even when its target is elsewhere.
     */
    private async resolveSafe(virtualPath: string, followFinal = true): Promise<string> {
        const absolute = this.toAbsolute(virtualPath);
        const realRoot = await this.getRealRoot();

        let probe = followFinal ? absolute : path.dirname(absolute);
        // Walk up until something exists, then check where it really points
        for (;;) {
            try {
                const real = await fs.realpath(probe);
                if (!isWithin(realRoot, real)) {
                    throw storageError('Path resolves outside the storage folder.', 'EACCES', 403);
                }
                return absolute;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') {
                    throw error;
                }
                const parent = path.dirname(probe);
                if (parent === probe || !isWithin(this.root, parent)) {
                    return absolute;
                }
                probe = parent;
            }
        }
    }

    /**
     * Give a file or folder to the configured owner so the container user can use it. Failing to
     * chown (for example when not running as root) is reported once and is not fatal.
     */
    private async applyOwnership(target: string): Promise<void> {
        if (!this.owner) return;
        try {
            await fs.lchown(target, this.owner.uid, this.owner.gid);
        } catch (error) {
            if (!this.warnedAboutOwner) {
                this.warnedAboutOwner = true;
                console.warn(`Could not set LOCAL_STORAGE_OWNER on stored files (${(error as NodeJS.ErrnoException).code}). Run the app as root or set permissions on the storage folder yourself.`);
            }
        }
    }

    /** mkdir -p that also hands every newly created folder to the configured owner. */
    private async makeDirectories(absolute: string): Promise<void> {
        const firstCreated = await fs.mkdir(absolute, { recursive: true, mode: DIRECTORY_MODE });
        if (!firstCreated || !this.owner) return;

        let current = absolute;
        const created: string[] = [];
        while (isWithin(firstCreated, current)) {
            created.push(current);
            if (current === firstCreated) break;
            current = path.dirname(current);
        }
        for (const folder of created) {
            await this.applyOwnership(folder);
        }
    }

    private translate(error: unknown, virtualPath: string): never {
        // Errors raised by this class are already worded for callers
        if (typeof (error as StorageError)?.status === 'number') throw error;

        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') throw storageError(`Not found: ${virtualPath}`, 'ENOENT', 404);
        if (code === 'EEXIST') throw storageError(`Already exists: ${virtualPath}`, 'EEXIST', 409);
        if (code === 'EISDIR') throw storageError(`Is a directory: ${virtualPath}`, 'EISDIR', 400);
        if (code === 'ENOTDIR') throw storageError(`Not a directory: ${virtualPath}`, 'ENOTDIR', 409);
        if (code === 'ENOTEMPTY') throw storageError(`Directory is not empty: ${virtualPath}`, 'ENOTEMPTY', 409);
        if (code === 'EACCES' || code === 'EPERM') {
            // Never include the absolute host path in messages that can reach the browser
            throw storageError(`Permission denied: ${virtualPath}`, code, 403);
        }
        throw error;
    }

    private assertNotRoot(absolute: string, action: string): void {
        if (absolute === this.root) {
            throw storageError(`Refusing to ${action} the storage root.`, 'EACCES', 403);
        }
    }

    public async getDirectoryContents(directoryPath: string = '/'): Promise<StorageEntry[]> {
        const virtualDir = this.normalizeVirtual(directoryPath);
        try {
            const absolute = await this.resolveSafe(virtualDir);
            const names = await fs.readdir(absolute);
            const realRoot = await this.getRealRoot();
            const entries: StorageEntry[] = [];

            for (const name of names) {
                const childPath = path.join(absolute, name);
                try {
                    let stats = await fs.lstat(childPath);
                    if (stats.isSymbolicLink()) {
                        // Only show links that stay inside the storage folder
                        const real = await fs.realpath(childPath);
                        if (!isWithin(realRoot, real)) continue;
                        stats = await fs.stat(childPath);
                    }
                    const isDirectory = stats.isDirectory();
                    if (!isDirectory && !stats.isFile()) continue;

                    entries.push({
                        filename: virtualDir === '/' ? `/${name}` : `${virtualDir}/${name}`,
                        basename: name,
                        lastmod: stats.mtime.toUTCString(),
                        size: isDirectory ? 0 : stats.size,
                        type: isDirectory ? 'directory' : 'file',
                        ...(isDirectory ? {} : { mime: MIME_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream' }),
                    });
                } catch {
                    // The item vanished or is unreadable; leave it out of the listing
                }
            }

            return entries;
        } catch (error) {
            return this.translate(error, virtualDir);
        }
    }

    public async getFileContents(filePath: string): Promise<Buffer> {
        try {
            const absolute = await this.resolveSafe(filePath);
            const stats = await fs.stat(absolute);
            if (!stats.isFile()) {
                throw storageError(`Not a file: ${filePath}`, 'EISDIR', 400);
            }
            return await fs.readFile(absolute);
        } catch (error) {
            return this.translate(error, filePath);
        }
    }

    public async uploadFile(filePath: string, data: Buffer | string): Promise<void> {
        let temporaryPath: string | null = null;
        try {
            const absolute = await this.resolveSafe(filePath, false);
            this.assertNotRoot(absolute, 'overwrite');

            await this.makeDirectories(path.dirname(absolute));
            // Re-check now that the folder exists, in case an existing parent was a link
            await this.resolveSafe(filePath, false);

            temporaryPath = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
            await fs.writeFile(temporaryPath, data, { mode: FILE_MODE, flag: 'wx' });
            await this.applyOwnership(temporaryPath);
            await fs.rename(temporaryPath, absolute);
            temporaryPath = null;
        } catch (error) {
            if (temporaryPath) {
                await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
            }
            this.translate(error, filePath);
        }
    }

    public async deleteFile(filePath: string): Promise<void> {
        try {
            const absolute = await this.resolveSafe(filePath, false);
            this.assertNotRoot(absolute, 'delete');
            // rm does not follow symlinks, so a link is removed without touching its target
            await fs.rm(absolute, { recursive: true, force: false });
        } catch (error) {
            this.translate(error, filePath);
        }
    }

    public async createDirectory(dirPath: string): Promise<void> {
        try {
            const absolute = await this.resolveSafe(dirPath);
            await this.makeDirectories(absolute);
            await this.resolveSafe(dirPath);
        } catch (error) {
            this.translate(error, dirPath);
        }
    }

    public async deleteDirectory(dirPath: string): Promise<void> {
        await this.deleteFile(dirPath);
    }

    public async deleteDirectoryRecursively(dirPath: string): Promise<void> {
        await this.deleteFile(dirPath);
    }

    public async exists(checkPath: string): Promise<boolean> {
        try {
            if (this.toAbsolute(checkPath) === this.root) {
                await this.getRealRoot();
                return true;
            }
            const absolute = await this.resolveSafe(checkPath, false);
            await fs.lstat(absolute);
            return true;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (code === 'ENOENT' || code === 'ENOTDIR') return false;
            throw error;
        }
    }

    public async moveFile(sourcePath: string, destPath: string): Promise<void> {
        try {
            const source = await this.resolveSafe(sourcePath, false);
            const destination = await this.resolveSafe(destPath, false);
            this.assertNotRoot(source, 'move');
            this.assertNotRoot(destination, 'replace');

            await fs.rename(source, destination);
        } catch (error) {
            this.translate(error, sourcePath);
        }
    }

    public async moveDirectory(sourcePath: string, destPath: string): Promise<void> {
        await this.moveFile(sourcePath, destPath);
    }
}
