/**
 * The two ways a server's folder can be named, both equally valid and both found again by the scanners:
 *   uuid  the server's unique id (the default; the name says nothing about the server)
 *   name  the server's own name, which is easier to find by hand but gives the name away to anyone who can see
 *         the folder, and is guessable
 * With names, a folder that exists already (another server, or what an incompletely deleted server left behind)
 * is never reused: the new one gets -2, -3 and so on, so the oldest keeps the plain name.
 */
import serverStorage from '@/lib/server/storage';

export type FolderNaming = 'uuid' | 'name';

export function isFolderNaming(value: unknown): value is FolderNaming {
    return value === 'uuid' || value === 'name';
}

/** The server name as a folder name: letters, digits, spaces, dots, dashes and underscores; everything else becomes _ */
export function literalFolderName(serverName: string): string {
    const cleaned = serverName
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9 ._-]+/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/^[ .]+|[ .]+$/g, '')
        .slice(0, 64)
        .replace(/[ .]+$/g, '');
    return cleaned || 'server';
}

/**
 * Picks the folder name. `taken` holds the names that exist in the owner's folder; names are compared without
 * regard to case because the storage may be case insensitive.
 */
export function pickFolderName(options: { mode: FolderNaming; uniqueId: string; serverName: string; taken: Iterable<string> }): string {
    if (options.mode === 'uuid') return options.uniqueId;
    const taken = new Set([...options.taken].map(name => name.toLowerCase()));
    const base = literalFolderName(options.serverName);
    if (!taken.has(base.toLowerCase())) return base;
    for (let id = 2; id < 10_000; id++) {
        const candidate = `${base}-${id}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base}-${options.uniqueId.slice(0, 8)}`;
}

/** Folder names that exist below the owner's folder in the storage */
export async function listTakenFolderNames(ownerFolder: string): Promise<string[]> {
    try {
        return (await serverStorage.getDirectoryContents(ownerFolder)).filter(entry => entry.type === 'directory').map(entry => entry.basename);
    } catch {
        return [];
    }
}
