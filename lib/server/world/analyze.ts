/**
 * Reads what a world folder says about itself and decides whether a server version may load it.
 *
 * Minecraft upgrades old worlds when a newer server opens them, but cannot take them back. Going back is
 * unsupported here, and only possible at all within the same "era" of the world format:
 *   legacy  below 1.17   old chunk format and world height
 *   modern  1.17 to 1.21.x
 *   new     26.1 and later, which moved every dimension into the dimensions folder and reworked level.dat
 * A downgrade across an era is refused: that would need a converter that does not exist. A downgrade inside an
 * era is allowed after the user acknowledged that it is not supported.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import nbt from 'prismarine-nbt';
import { compareMinecraftVersions, isFloatingVersion } from '@/lib/data/itzg/versions';

export type WorldEra = 'legacy' | 'modern' | 'new';

export const MODERN_ERA_START = '1.17';
export const NEW_ERA_START = '26.1';
/** DataVersion of the first 1.17 release, used when level.dat has no version name */
export const MODERN_DATA_VERSION = 2724;

export const ERA_LABEL: Record<WorldEra, string> = {
    legacy: 'before 1.17',
    modern: '1.17 to 1.21',
    new: '26.1 and newer',
};

export function eraOfVersion(version: string | undefined | null): WorldEra {
    if (isFloatingVersion(version)) return 'new';
    if (compareMinecraftVersions(version, NEW_ERA_START) >= 0) return 'new';
    if (compareMinecraftVersions(version, MODERN_ERA_START) >= 0) return 'modern';
    return 'legacy';
}

export interface LevelInfo {
    levelName?: string;
    dataVersion?: number;
    /** Name of the Minecraft version that last saved the world, for example 1.20.4. Missing before 1.9 */
    versionName?: string;
    snapshot: boolean;
}

/** Reads level.dat (gzip compressed NBT) */
export async function readLevelDat(buffer: Buffer): Promise<LevelInfo> {
    const { parsed } = await nbt.parse(buffer);
    const root = nbt.simplify(parsed) as Record<string, unknown>;
    const data = (root.Data && typeof root.Data === 'object' ? root.Data : root) as Record<string, unknown>;
    const version = (data.Version && typeof data.Version === 'object' ? data.Version : {}) as Record<string, unknown>;
    const dataVersion = typeof data.DataVersion === 'number' ? data.DataVersion : typeof data.data_version === 'number' ? data.data_version : undefined;
    return {
        levelName: typeof data.LevelName === 'string' ? data.LevelName : typeof data.level_name === 'string' ? data.level_name : undefined,
        dataVersion,
        versionName: typeof version.Name === 'string' ? version.Name : undefined,
        snapshot: version.Snapshot === 1 || version.Snapshot === true || /\d\dw\d\d[a-z]|pre|rc/i.test(String(version.Name ?? '')),
    };
}

export interface WorldInfo {
    found: boolean;
    /** Folder of the world inside the extracted archive, relative to it ('' for the root) */
    folder: string;
    levelName?: string;
    dataVersion?: number;
    versionName?: string;
    snapshot: boolean;
    era?: WorldEra;
    /** The world keeps its dimensions in dimensions/ (26.1 layout) */
    dimensionsFolder: boolean;
    hasNether: boolean;
    hasEnd: boolean;
    problems: string[];
}

async function isDirectory(target: string): Promise<boolean> {
    try {
        return (await fs.stat(target)).isDirectory();
    } catch {
        return false;
    }
}

/** The folder that holds level.dat: the root first, then the shallowest folder below it */
export async function locateWorldFolder(root: string, maxDepth = 4): Promise<string | null> {
    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    while (queue.length > 0) {
        const { dir, depth } = queue.shift() as { dir: string; depth: number };
        let entries: import('node:fs').Dirent[];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        if (entries.some(entry => entry.isFile() && entry.name === 'level.dat')) return dir;
        if (depth >= maxDepth) continue;
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('__MACOSX') && !entry.name.startsWith('.')) queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
    }
    return null;
}

/** Looks at an extracted world archive */
export async function analyzeWorldFolder(root: string): Promise<WorldInfo> {
    const info: WorldInfo = { found: false, folder: '', snapshot: false, dimensionsFolder: false, hasNether: false, hasEnd: false, problems: [] };
    const folder = await locateWorldFolder(root);
    if (folder === null) {
        info.problems.push('There is no level.dat in this file, so it does not look like a Minecraft world. Zip the world folder itself (the one that holds level.dat and region).');
        return info;
    }
    info.found = true;
    info.folder = path.relative(root, folder).split(path.sep).join('/');

    try {
        const level = await readLevelDat(await fs.readFile(path.join(folder, 'level.dat')));
        info.levelName = level.levelName;
        info.dataVersion = level.dataVersion;
        info.versionName = level.versionName;
        info.snapshot = level.snapshot;
    } catch {
        info.problems.push('level.dat could not be read. The world may be damaged.');
    }

    info.dimensionsFolder = await isDirectory(path.join(folder, 'dimensions'));
    info.hasNether = info.dimensionsFolder ? await isDirectory(path.join(folder, 'dimensions', 'minecraft', 'the_nether')) : await isDirectory(path.join(folder, 'DIM-1'));
    info.hasEnd = info.dimensionsFolder ? await isDirectory(path.join(folder, 'dimensions', 'minecraft', 'the_end')) : await isDirectory(path.join(folder, 'DIM1'));

    if (info.dimensionsFolder) info.era = 'new';
    else if (info.versionName && !info.snapshot) info.era = eraOfVersion(info.versionName);
    else if (info.dataVersion !== undefined) info.era = info.dataVersion >= MODERN_DATA_VERSION ? 'modern' : 'legacy';
    else info.era = 'legacy'; // no version at all: saved before 1.9
    return info;
}

export type WorldStatus = 'ok' | 'upgrade' | 'downgrade' | 'blocked';

export interface WorldJudgement {
    status: WorldStatus;
    worldEra?: WorldEra;
    serverEra: WorldEra;
    worldVersion?: string;
    serverVersion: string;
    /** The user has to confirm that downgrading is unsupported before the world is used */
    requiresAcknowledgement: boolean;
    message: string;
}

export const DOWNGRADE_WARNING = 'Downgrading a world is NOT supported. Minecraft does not convert worlds to an older version: chunks can be corrupted, blocks and items from newer versions disappear, and the world may not load at all. Nobody will be able to fix a world that breaks this way. Keep a copy of the original world and only continue if you accept this.';

/** Decides what loading this world on a server of this version means */
export function judgeWorld(world: Pick<WorldInfo, 'found' | 'era' | 'versionName' | 'snapshot' | 'dataVersion'>, serverVersion: string): WorldJudgement {
    const serverEra = eraOfVersion(serverVersion);
    const shownServer = isFloatingVersion(serverVersion) ? 'the latest version' : serverVersion;
    const base = { serverEra, worldEra: world.era, worldVersion: world.versionName, serverVersion, requiresAcknowledgement: false };

    if (!world.found || !world.era) return { ...base, status: 'blocked', message: 'This file does not contain a Minecraft world.' };

    const worldName = world.versionName ?? 'an old version (before 1.9)';

    if (world.era !== serverEra && eraRank(world.era) > eraRank(serverEra)) {
        return {
            ...base, status: 'blocked',
            message: `This world was saved with ${worldName} (${ERA_LABEL[world.era]}) and cannot be loaded on ${shownServer} (${ERA_LABEL[serverEra]}). Worlds cannot be downgraded across the ${world.era === 'new' ? NEW_ERA_START : MODERN_ERA_START} boundary, that would need a converter that does not exist. Pick ${world.era === 'new' ? NEW_ERA_START : MODERN_ERA_START} or newer for this server.`,
        };
    }

    if (world.era !== serverEra) {
        return { ...base, status: 'upgrade', message: `This world was saved with ${worldName} and is upgraded to ${shownServer} the first time the server loads it. Upgrading cannot be undone: keep a copy of the original.` };
    }

    // Same era: compare the versions themselves
    if (world.snapshot || !world.versionName) {
        if (!world.versionName) return { ...base, status: 'upgrade', message: `The world does not say which version saved it, it is assumed to be older than ${shownServer} and is upgraded when the server loads it. Keep a copy of the original.` };
        return { ...base, status: 'downgrade', requiresAcknowledgement: true, message: `This world was saved by the snapshot ${world.versionName}, so it cannot be checked against ${shownServer}. ${DOWNGRADE_WARNING}` };
    }
    const order = compareMinecraftVersions(world.versionName, serverVersion);
    if (order > 0) return { ...base, status: 'downgrade', requiresAcknowledgement: true, message: `This world was saved with ${world.versionName}, which is NEWER than ${shownServer}. ${DOWNGRADE_WARNING}` };
    if (order < 0) return { ...base, status: 'upgrade', message: `This world was saved with ${world.versionName} and is upgraded to ${shownServer} the first time the server loads it. Upgrading cannot be undone: keep a copy of the original.` };
    return { ...base, status: 'ok', message: `This world matches ${shownServer}.` };
}

function eraRank(era: WorldEra): number {
    return era === 'legacy' ? 0 : era === 'modern' ? 1 : 2;
}
