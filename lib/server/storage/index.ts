import '../loadEnv';
import { LocalStorage, parseOwner } from './local';
import { getWebDavService } from '../webdav';
import { getExtraStorageRoots } from '../importPaths';
import type { ServerStorage } from './types';

export type { ServerStorage, StorageEntry } from './types';
export { LocalStorage } from './local';

export type StorageBackend = 'local' | 'webdav';

/**
 * Which backend holds server files.
 *
 * STORAGE_BACKEND=local|webdav chooses explicitly. Without it, setting LOCAL_STORAGE_PATH turns the
 * local backend on and everything else keeps using WebDAV as before.
 */
export function getStorageBackend(): StorageBackend {
    const configured = process.env.STORAGE_BACKEND?.trim().toLowerCase();

    if (configured === 'local' || configured === 'webdav') {
        return configured;
    }
    if (configured) {
        console.warn(`Unknown STORAGE_BACKEND "${configured}", expected "local" or "webdav". Falling back to automatic detection.`);
    }

    return process.env.LOCAL_STORAGE_PATH?.trim() ? 'local' : 'webdav';
}

let instance: ServerStorage | null = null;

function createStorage(): ServerStorage {
    if (getStorageBackend() === 'local') {
        const rootPath = process.env.LOCAL_STORAGE_PATH?.trim();
        if (!rootPath) {
            throw new Error('STORAGE_BACKEND=local needs LOCAL_STORAGE_PATH, the absolute folder that holds the server files.');
        }
        console.log(`✅ Server files are stored locally in ${rootPath}`);
        return new LocalStorage(rootPath, { owner: parseOwner(process.env.LOCAL_STORAGE_OWNER), extraRoots: getExtraStorageRoots() });
    }

    return getWebDavService();
}

/**
 * The active storage backend, created on first use.
 */
export function getStorage(): ServerStorage {
    if (!instance) {
        instance = createStorage();
    }
    return instance;
}

/**
 * Host folder that virtual storage paths map to when files live on this machine, or null when
 * they are on a WebDAV server. Container bind mounts use this so they point at the same files.
 */
export function getLocalStorageRoot(): string | null {
    if (getStorageBackend() !== 'local') return null;

    const active = getStorage();
    return active instanceof LocalStorage ? active.rootPath : null;
}

// Default export mirrors the old WebDAV singleton so call sites only change their import path
const storage = new Proxy({} as ServerStorage, {
    get(_target, property) {
        const active = getStorage();
        const value = Reflect.get(active, property, active);
        return typeof value === 'function' ? value.bind(active) : value;
    }
});

export default storage;
