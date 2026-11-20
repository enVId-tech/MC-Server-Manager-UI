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
