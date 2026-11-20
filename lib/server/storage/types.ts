/**
 * One item in a directory listing. The shape follows what the `webdav` client returns so the
 * file browser works the same way no matter which backend is in use.
 */
export interface StorageEntry {
    /** Full virtual path of the item, for example `/minecraft-servers/alex/abc123/server.properties` */
    filename: string;
    basename: string;
    /** Last modified time as an RFC 7231 date string */
    lastmod: string;
    size: number;
    type: 'file' | 'directory';
    mime?: string;
}

/**
 * Where server files live. Paths are always virtual, POSIX style and start with `/`; each backend
 * decides where they really point (a WebDAV server or a folder on this machine).
 */
export interface ServerStorage {
    readonly kind: 'webdav' | 'local';
    getDirectoryContents(path?: string): Promise<StorageEntry[]>;
    getFileContents(filePath: string): Promise<Buffer>;
    uploadFile(filePath: string, data: Buffer | string, forceOverwrite?: boolean): Promise<void>;
    deleteFile(filePath: string): Promise<void>;
    createDirectory(dirPath: string): Promise<void>;
    deleteDirectory(dirPath: string): Promise<void>;
    deleteDirectoryRecursively(dirPath: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    moveFile(sourcePath: string, destPath: string): Promise<void>;
    moveDirectory(sourcePath: string, destPath: string): Promise<void>;
}
