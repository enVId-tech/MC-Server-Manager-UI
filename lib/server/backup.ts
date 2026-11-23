import { PassThrough, Readable } from 'stream';
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
const SKIPPED_FOLDERS = new Set(['logs', 'cache', '.backups']);
const SKIPPED_FILES = new Set(['session.lock']);

function shouldSkipFile(rel: string, name: string, raw: boolean): boolean {
    const lower = name.toLowerCase();
    // Never read Minecraft lock files or in-progress temp/backup files
    if (SKIPPED_FILES.has(lower) || /\.(lck|partial)$/i.test(lower)) return true;
    if (!raw && /\.(deleted|backup)\.\d+$/i.test(rel)) return true;
    if (!raw && isHiddenFromUsers(`/${rel}`) && lower !== 'paper-global.yml' && lower !== 'paper.yml') return true;
    return false;
}

async function* walk(base: string, raw: boolean, folder = ''): AsyncGenerator<{ rel: string; name: string; size: number }> {
    let entries;
    try {
        entries = await serverStorage.getDirectoryContents(folder ? `${base}/${folder}` : base);
    } catch (error) {
        // Propagate root errors so missing server folders fail cleanly; skip transient/unreadable subfolders
        if (!folder) throw error;
        console.warn(`[backup] skipping unreadable folder ${folder}:`, error instanceof Error ? error.message : error);
        return;
    }

    for (const entry of entries) {
        const rel = folder ? `${folder}/${entry.basename}` : entry.basename;
        if (entry.type === 'directory') {
            const lower = entry.basename.toLowerCase();
            if (lower === '.backups' || (!raw && !folder && SKIPPED_FOLDERS.has(lower))) continue;
            yield* walk(base, raw, rel);
        } else {
            if (shouldSkipFile(rel, entry.basename, raw)) continue;
            yield { rel, name: entry.basename, size: entry.size };
        }
    }
}

function waitForDrainOrClose(stream: PassThrough): Promise<void> {
    if (stream.destroyed || !stream.writableNeedDrain) return Promise.resolve();
    return new Promise((resolve) => {
        const cleanup = () => {
            stream.off('drain', onDone);
            stream.off('close', onDone);
            stream.off('error', onDone);
        };
        const onDone = () => {
            cleanup();
            resolve();
        };
        stream.once('drain', onDone);
        stream.once('close', onDone);
        stream.once('error', onDone);
    });
}

/**
 * Streams a zip of a server folder. Unless `raw` is set, everything that belongs to the proxy network is left out
 * or cleaned: forwarding secrets, BungeeGuard, Geyser and Floodgate with their keys, the proxy flags in the
 * configuration files and the logs.
 */
export function createBackupStream(base: string, options: BackupOptions = {}): Readable {
    const zip = new yazl.ZipFile();
    const out = new PassThrough();
    const raw = options.raw === true;
    const secrets = options.secrets ?? [];
    let closed = false;

    out.once('close', () => { closed = true; });
    (zip.outputStream as unknown as Readable).on('error', (error) => {
        if (!out.destroyed) out.destroy(error);
    });
    (zip.outputStream as unknown as Readable).pipe(out);

    void (async () => {
        try {
            for await (const file of walk(base, raw)) {
                if (closed || out.destroyed) return;

                let data: Buffer;
                try {
                    data = await serverStorage.getFileContents(`${base}/${file.rel}`);
                } catch (error) {
                    // Never abort the whole zip mid-stream (which leaves it without an EOCD) if one file is locked or vanished
                    console.warn(`[backup] skipping unreadable file ${file.rel}:`, error instanceof Error ? error.message : error);
                    continue;
                }

                if (!raw) {
                    const cleaned = sanitizeForBackup(`/${file.rel}`, data);
                    if (cleaned === null) continue;
                    if (cleaned) data = cleaned;
                    if (secrets.length > 0 && file.size <= MAX_SCANNED_BYTES && TEXT_FILE.test(file.rel)) {
                        data = redactKnownSecrets(data, secrets);
                    }
                }

                if (closed || out.destroyed) return;
                zip.addBuffer(data, file.rel, { compress: true });
                await waitForDrainOrClose(out);
            }

            if (!closed && !out.destroyed) {
                zip.end();
            }
        } catch (error) {
            if (!out.destroyed) out.destroy(error as Error);
        }
    })();

    return out;
}
