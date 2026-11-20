import { getLocalStorageRoot } from './storage';

interface ServerPathSource {
    uniqueId: string;
    folderPath?: string | null;
}

/**
 * Base folder on the WebDAV server that contains every user's folder.
 */
export function getServerBasePath(): string {
    return process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
}

/**
 * Folder on the WebDAV server that holds a server's files.
 *
 * The path stored when the server was created is the source of truth. Deriving it from the
 * current email of whoever is looking at the server would point at the wrong directory after an
 * email change, or when an administrator acts on a server that belongs to somebody else.
 */
export function getServerFolderPath(server: ServerPathSource, ownerEmail: string): string {
    if (server.folderPath) {
        return server.folderPath;
    }

    return `${getServerBasePath()}/${ownerEmail.split('@')[0] || 'default-user'}/${server.uniqueId}`;
}


function getOwnerFolderName(userEmail: string): string {
    return userEmail.split('@')[0] || 'default-user';
}

/**
 * Folder that holds every server of one owner, as seen from the app, when files are stored on
 * this machine. Returns null for WebDAV storage.
 */
function getLocalOwnerFolder(userEmail: string, root: string): string {
    return `${root.replace(/\/+$/, '')}${getServerBasePath()}/${getOwnerFolderName(userEmail)}`;
}

/**
 * Folder that holds the owner's servers as the *Docker host* sees it. Container bind mounts must
 * use this path: it is where Docker looks for the files the app wrote.
 *
 * With local storage that is LOCAL_STORAGE_HOST_PATH (or LOCAL_STORAGE_PATH when the app runs
 * directly on the Docker host) plus the owner's folder, so the mount always matches where the app
 * stores the files. Otherwise the long-standing FOLDER_PATH / MINECRAFT_PATH layout is kept.
 */
export function getServerHostBase(userEmail: string, fallbackPath: string): string {
    const localRoot = getLocalStorageRoot();
    if (localRoot) {
        const hostRoot = process.env.LOCAL_STORAGE_HOST_PATH?.trim() || localRoot;
        return getLocalOwnerFolder(userEmail, hostRoot);
    }

    return `${process.env.FOLDER_PATH || process.env.MINECRAFT_PATH || fallbackPath}/${userEmail}`;
}

/**
 * Same folder as {@link getServerHostBase} but as the app itself sees it, for code that touches
 * the files directly with the filesystem.
 */
export function getServerAppBase(userEmail: string, fallbackPath: string): string {
    const localRoot = getLocalStorageRoot();
    if (localRoot) {
        return getLocalOwnerFolder(userEmail, localRoot);
    }

    return `${process.env.FOLDER_PATH || process.env.MINECRAFT_PATH || fallbackPath}/${userEmail}`;
}
