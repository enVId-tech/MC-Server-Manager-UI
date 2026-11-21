import { Readable } from 'stream';
import yazl from 'yazl';
import serverStorage from '@/lib/server/storage';
import { isHiddenFromUsers, sanitizeForBackup } from '@/lib/server/accessPolicy';

export interface BackupOptions {
    /** Keep everything as it is. Only for administrators */
    raw?: boolean;
}

/** Folders that are skipped in a cleaned backup: logs show the addresses of the proxy */
const SKIPPED_FOLDERS = new Set(['logs', 'cache']);

async function* walk(base: string, folder = ''): AsyncGenerator<{ rel: string; size: number }> {
    const entries = await serverStorage.getDirectoryContents(folder ? `${base}/${folder}` : base);
    for (const entry of entries) {
        const rel = folder ? `${folder}/${entry.basename}` : entry.basename;
        if (entry.type === 'directory') yield* walk(base, rel);
        else yield { rel, size: entry.size };
    }
}

/** Reads a file only when the zip reaches it, so a large world never sits in memory all at once */
function lazyFile(path: string, rel: string, raw: boolean): Readable {
    let started = false;
    return new Readable({
        async read() {
            if (started) return;
            started = true;
            try {
                let data: Buffer = await serverStorage.getFileContents(path);
                if (!raw) {
                    const cleaned = sanitizeForBackup(`/${rel}`, data);
                    if (cleaned) data = cleaned;
                }
                this.push(data);
                this.push(null);
            } catch (error) {
                this.destroy(error as Error);
            }
        },
    });
}

/**
 * Streams a zip of a server folder. Unless `raw` is set, everything that belongs to the proxy network is left out
 * or cleaned: forwarding secrets, BungeeGuard, Geyser and Floodgate with their keys, the proxy flags in the
 * configuration files and the logs.
 */
export function createBackupStream(base: string, options: BackupOptions = {}): Readable {
    const zip = new yazl.ZipFile();
    const raw = options.raw === true;

    void (async () => {
        try {
            for await (const file of walk(base)) {
                const top = file.rel.split('/')[0].toLowerCase();
                if (!raw) {
                    if (SKIPPED_FOLDERS.has(top)) continue;
                    if (/\.(deleted|backup)\.\d+$/.test(file.rel)) continue;
                    const name = file.rel.split('/').pop()?.toLowerCase() ?? '';
                    if (isHiddenFromUsers(`/${file.rel}`) && name !== 'paper-global.yml' && name !== 'paper.yml') continue;
                }
                zip.addReadStream(lazyFile(`${base}/${file.rel}`, file.rel, raw), file.rel, { compress: true });
            }
            zip.end();
        } catch (error) {
            (zip.outputStream as unknown as Readable).destroy(error as Error);
        }
    })();

    return zip.outputStream as unknown as Readable;
}
