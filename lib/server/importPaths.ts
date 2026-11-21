import path from 'path';

/**
 * A folder that may hold servers (or a Velocity proxy) that already exist.
 *
 * `appPath` is where this app reads it. With local storage that is a real folder on this machine; with WebDAV
 * it is a path on the WebDAV server. `hostPath` is the same folder as the Docker host sees it, which is what
 * container bind mounts use. They differ when the app runs in a container with the folder mounted elsewhere.
 */
export interface ImportRoot {
    appPath: string;
    hostPath: string;
}

function clean(value: string): string {
    const normalized = path.posix.normalize(value.trim().replace(/\\/g, '/'));
    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

/**
 * IMPORT_SCAN_PATHS is a comma separated list of folders. Write `app=host` when the app sees a folder under
 * another path than Docker does, for example `/imports/survival=/mnt/ssd/docker/survival`.
 */
export function getImportRoots(): ImportRoot[] {
    const roots: ImportRoot[] = [];
    for (const entry of (process.env.IMPORT_SCAN_PATHS ?? '').split(',')) {
        const [appPart, hostPart] = entry.split('=');
        if (!appPart?.trim() || !appPart.trim().startsWith('/')) continue;
        const appPath = clean(appPart);
        if (appPath === '/') continue;
        roots.push({ appPath, hostPath: hostPart?.trim() ? clean(hostPart) : appPath });
    }
    return roots;
}

/**
 * The folder that holds the storage folder (for example /mnt/ssd/docker when files are stored in
 * /mnt/ssd/docker/minecraft-servers). Proxies usually sit next to the servers, so this is searched for proxy
 * files too. Set PROXY_SCAN_PARENT=false to switch it off. Never the filesystem root.
 */
export function getParentRoot(): ImportRoot | null {
    if (process.env.PROXY_SCAN_PARENT?.trim().toLowerCase() === 'false') return null;
    const appRoot = process.env.LOCAL_STORAGE_PATH?.trim();
    if (!appRoot || process.env.STORAGE_BACKEND?.trim().toLowerCase() === 'webdav') return null;
    const appParent = path.posix.dirname(clean(appRoot));
    const hostParent = path.posix.dirname(clean(process.env.LOCAL_STORAGE_HOST_PATH?.trim() || appRoot));
    if (appParent === '/' || appParent === '.') return null;
    return { appPath: appParent, hostPath: hostParent };
}

function startsWithPath(parent: string, candidate: string): boolean {
    return candidate === parent || candidate.startsWith(parent === '/' ? '/' : parent + '/');
}

/** Folder of the storage root as the Docker host sees it, when files are stored locally. */
function getLocalHostRoot(): { appRoot: string; hostRoot: string } | null {
    const appRoot = process.env.LOCAL_STORAGE_PATH?.trim();
    if (!appRoot || process.env.STORAGE_BACKEND?.trim().toLowerCase() === 'webdav') return null;
    return { appRoot: clean(appRoot), hostRoot: clean(process.env.LOCAL_STORAGE_HOST_PATH?.trim() || appRoot) };
}

/**
 * Turns a path from Docker (a bind mount source) into the path this app uses to read it, or null when this
 * app cannot reach that folder. Paths inside the storage folder become storage paths, paths inside an import
 * root keep their app path.
 */
export function hostPathToAppPath(hostPath: string): string | null {
    const host = clean(hostPath);

    for (const root of getImportRoots()) {
        if (startsWithPath(root.hostPath, host)) {
            return clean(root.appPath + host.slice(root.hostPath.length));
        }
    }

    const local = getLocalHostRoot();
    if (local && startsWithPath(local.hostRoot, host)) {
        return clean('/' + host.slice(local.hostRoot.length));
    }

    const parent = getParentRoot();
    if (parent && startsWithPath(parent.hostPath, host)) {
        return clean(parent.appPath + host.slice(parent.hostPath.length));
    }

    return null;
}

/** The path Docker uses for a path this app uses. Used for bind mounts of servers that were imported. */
export function appPathToHostPath(appPath: string): string {
    const app = clean(appPath);

    for (const root of getImportRoots()) {
        if (startsWithPath(root.appPath, app)) {
            return clean(root.hostPath + app.slice(root.appPath.length));
        }
    }

    const local = getLocalHostRoot();
    if (local) {
        return clean(local.hostRoot + (app === '/' ? '' : app));
    }

    return app;
}

/** Real folders this app may reach in addition to the storage folder (local storage only). */
export function getExtraStorageRoots(): string[] {
    const parent = getParentRoot();
    return [...getImportRoots().map(root => root.appPath), ...(parent ? [parent.appPath] : [])];
}
