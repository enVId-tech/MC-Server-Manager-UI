/**
 * Puts an uploaded world into a server's folder.
 *
 * The archive is extracted into a temporary folder first and looked at (analyze.ts); only the files that belong
 * to a world are copied, so an uploaded zip cannot drop jars, scripts or configuration into the server.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import extractZip from 'extract-zip';
import serverStorage from '@/lib/server/storage';
import { getServerType } from '@/lib/data/itzg/serverTypes';
import { analyzeWorldFolder, judgeWorld, type WorldInfo, type WorldJudgement } from './analyze';

/** Files and folders of a world. Anything else in the archive is left out */
const WORLD_ENTRIES = new Set([
    'level.dat', 'level.dat_old', 'icon.png', 'region', 'entities', 'poi', 'data', 'playerdata', 'stats', 'advancements',
    'dim-1', 'dim1', 'dimensions', 'datapacks', 'generated', 'raids', 'uid.dat', 'players',
]);

const MAX_FILES = 300_000;
export const MAX_WORLD_MB = Number(process.env.MAX_WORLD_UPLOAD_MB) || 4096;

export interface ExtractedWorld {
    dir: string;
    info: WorldInfo;
    cleanup: () => Promise<void>;
}

/** Extracts a zip into a temporary folder and analyses it. The caller has to run cleanup() */
export async function extractWorldZip(zipPath: string): Promise<ExtractedWorld> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mms-world-'));
    const cleanup = () => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    try {
        const stat = await fs.stat(zipPath);
        if (stat.size > MAX_WORLD_MB * 1024 * 1024) throw new Error(`The world is larger than ${MAX_WORLD_MB} MB.`);
        await extractZip(zipPath, { dir });
        return { dir, info: await analyzeWorldFolder(dir), cleanup };
    } catch (error) {
        await cleanup();
        throw error;
    }
}

export interface InstallOptions {
    /** Storage path of the server folder */
    serverFolder: string;
    serverType: string;
    serverVersion: string;
    /** The user confirmed that a downgrade is unsupported */
    acknowledgeDowngrade?: boolean;
}

export interface InstallResult {
    installed: boolean;
    judgement?: WorldJudgement;
    files: number;
    skipped: string[];
    /** Where the world that was there before went, when there was one */
    previous?: string;
    error?: string;
}

async function listFiles(root: string, relative = ''): Promise<{ files: string[]; skipped: string[] }> {
    const files: string[] = [];
    const skipped: string[] = [];
    const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
        const next = relative ? `${relative}/${entry.name}` : entry.name;
        // Links in an archive could point anywhere on this machine
        if (entry.isSymbolicLink()) { skipped.push(next); continue; }
        if (entry.isDirectory()) {
            const inner = await listFiles(root, next);
            files.push(...inner.files);
            skipped.push(...inner.skipped);
        } else if (entry.isFile()) {
            files.push(next);
        }
    }
    return { files, skipped };
}

/** Checks, then installs the world found in an extracted archive */
export async function installWorld(extracted: ExtractedWorld, options: InstallOptions): Promise<InstallResult> {
    const { info } = extracted;
    const judgement = judgeWorld(info, options.serverVersion);
    const result: InstallResult = { installed: false, judgement, files: 0, skipped: [] };

    if (judgement.status === 'blocked') return { ...result, error: judgement.message };
    if (judgement.requiresAcknowledgement && !options.acknowledgeDowngrade) {
        return { ...result, error: 'Downgrading a world is not supported. Confirm that you understand this to continue.' };
    }

    const worldRoot = path.join(extracted.dir, info.folder);
    const top = await fs.readdir(worldRoot, { withFileTypes: true });
    const wanted = top.filter(entry => WORLD_ENTRIES.has(entry.name.toLowerCase()) && !entry.isSymbolicLink());
    result.skipped.push(...top.filter(entry => !wanted.includes(entry)).map(entry => entry.name));

    // Bukkit based servers keep the Nether and the End in their own folders, up to the 26.1 layout
    const bukkit = getServerType(options.serverType)?.family === 'bukkit';
    const split = bukkit && info.era !== 'new';

    const plan: Array<{ from: string; to: string }> = [];
    let count = 0;
    for (const entry of wanted) {
        const lower = entry.name.toLowerCase();
        const base = entry.name;
        const target = split && lower === 'dim-1' ? `world_nether/DIM-1`
            : split && lower === 'dim1' ? `world_the_end/DIM1`
            : `world/${base}`;
        if (entry.isDirectory()) {
            const { files, skipped } = await listFiles(worldRoot, base);
            result.skipped.push(...skipped);
            for (const file of files) plan.push({ from: file, to: `${target}/${file.slice(base.length + 1)}` });
        } else {
            plan.push({ from: base, to: target });
        }
        count = plan.length;
        if (count > MAX_FILES) return { ...result, error: 'This world has too many files.' };
    }
    if (plan.length === 0) return { ...result, error: 'The archive has no world files in it.' };

    // The world that is there now is kept, so nothing is lost when the import turns out to be a mistake
    const existing = ['world', 'world_nether', 'world_the_end'];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupRoot = `${options.serverFolder}/backups/before-world-import-${stamp}`;
    for (const name of existing) {
        if (!(await serverStorage.exists(`${options.serverFolder}/${name}`))) continue;
        const entries = await serverStorage.getDirectoryContents(`${options.serverFolder}/${name}`).catch(() => []);
        if (entries.length === 0) continue;
        try { await serverStorage.createDirectory(`${options.serverFolder}/backups`); } catch { /* exists */ }
        try { await serverStorage.createDirectory(backupRoot); } catch { /* exists */ }
        await serverStorage.moveDirectory(`${options.serverFolder}/${name}`, `${backupRoot}/${name}`);
        result.previous = backupRoot;
    }

    const made = new Set<string>();
    const ensureFolder = async (folder: string) => {
        if (made.has(folder)) return;
        const parts = folder.split('/');
        for (let i = 1; i <= parts.length; i++) {
            const partial = parts.slice(0, i).join('/');
            if (made.has(partial)) continue;
            try { await serverStorage.createDirectory(`${options.serverFolder}/${partial}`); } catch { /* exists */ }
            made.add(partial);
        }
    };
    for (const item of plan) {
        await ensureFolder(item.to.split('/').slice(0, -1).join('/'));
        await serverStorage.uploadFile(`${options.serverFolder}/${item.to}`, await fs.readFile(path.join(worldRoot, item.from)), true);
        result.files++;
    }
    result.installed = true;
    return result;
}
