import path from 'path';

/** Folder where files that are uploaded before a server exists wait for the deployment */
export const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * The path of a temporary upload of one user. Only the file name of what the browser sent counts: the folder is
 * always the user's own, so a stored path can never point at another file of this machine.
 */
export function userUploadPath(email: string, sentPathOrName: string | null | undefined): string | null {
    if (!sentPathOrName) return null;
    const name = path.basename(sentPathOrName.replace(/\\/g, '/'));
    if (!name || name === '.' || name === '..') return null;
    return path.join(UPLOAD_DIR, email, name);
}

/** File name for a plugin or mod jar: no folders, only safe characters, always ending in .jar */
export function safeJarName(name: string | null | undefined): string {
    const base = path.basename((name ?? 'addon').replace(/\\/g, '/')).replace(/[^\w.\-+ ()]/g, '_').replace(/^\.+/, '');
    const stem = base.replace(/\.jar$/i, '') || 'addon';
    return `${stem}.jar`;
}
