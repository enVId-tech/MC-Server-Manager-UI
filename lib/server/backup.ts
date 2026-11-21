import { Readable } from 'stream';
import yazl from 'yazl';
import serverStorage from '@/lib/server/storage';
import { isHiddenFromUsers, sanitizeForBackup } from '@/lib/server/accessPolicy';

export interface BackupOptions {
    /** Keep everything as it is. Only for administrators */
    raw?: boolean;
    /**
     * Secrets that must not leave the machine (forwarding secrets of the proxies, the RCON password). Besides the
     * files that are dropped or cleaned by name, every text file is searched for them and they are blanked wherever
     * they turn up, for example in a plugin's config that somebody pasted the secret into.
     */
    secrets?: string[];
}

/** Text files that are searched for secrets. Everything else (jars, worlds, images) is copied as it is */
const TEXT_FILE = /\.(ya?ml|properties|toml|json|json5|txt|conf|cfg|ini|xml|env|secret|key|sh|bat)$/i;
const MAX_SCANNED_BYTES = 5 * 1024 * 1024;

/** Blanks every occurrence of the given secrets in a text file */
export function redactKnownSecrets(content: Buffer, secrets: string[]): Buffer {
    let text = content.toString('utf8');
    let changed = false;
    for (const secret of secrets) {
        if (secret.length >= 8 && text.includes(secret)) {
            text = text.split(secret).join('');
            changed = true;
        }
    }
    return changed ? Buffer.from(text) : content;
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
function lazyFile(path: string, rel: string, raw: boolean, size: number, secrets: string[]): Readable {
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
                    if (secrets.length > 0 && size <= MAX_SCANNED_BYTES && TEXT_FILE.test(rel)) data = redactKnownSecrets(data, secrets);
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
    const secrets = options.secrets ?? [];

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
                zip.addReadStream(lazyFile(`${base}/${file.rel}`, file.rel, raw, file.size, secrets), file.rel, { compress: true });
            }
            zip.end();
        } catch (error) {
            (zip.outputStream as unknown as Readable).destroy(error as Error);
        }
    })();

    return zip.outputStream as unknown as Readable;
}
