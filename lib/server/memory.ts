import dbConnect from '@/lib/db/dbConnect';
import PlatformSettings from '@/lib/objects/PlatformSettings';

export interface MemorySettings {
    maxMemoryMb: number;
    minMemoryMb: number;
    baseMemoryMb: number;
    moddedExtraMb: number;
    modpackExtraMb: number;
    perPluginMb: number;
    perModMb: number;
    perPlayerMb: number;
    maxStartFailures: number;
    autoUpdateImages: number;
    updateWindowStart: number;
    updateWindowEnd: number;
}

export const DEFAULT_PLATFORM_SETTINGS: MemorySettings = {
    maxMemoryMb: Number(process.env.MAX_SERVER_MEMORY_MB) || 8192,
    minMemoryMb: 1024,
    baseMemoryMb: 1024,
    moddedExtraMb: 1024,
    modpackExtraMb: 2048,
    perPluginMb: 24,
    perModMb: 40,
    perPlayerMb: 40,
    maxStartFailures: 5,
    autoUpdateImages: 1,
    updateWindowStart: 3,
    updateWindowEnd: 5,
};

export async function getPlatformSettings(): Promise<MemorySettings> {
    try {
        await dbConnect();
        const stored = await PlatformSettings.findOne({ key: 'platform' }).lean<Partial<MemorySettings> | null>();
        return { ...DEFAULT_PLATFORM_SETTINGS, ...(stored ?? {}) };
    } catch {
        return DEFAULT_PLATFORM_SETTINGS;
    }
}

export async function savePlatformSettings(update: Partial<MemorySettings>): Promise<MemorySettings> {
    await dbConnect();
    const clean: Partial<MemorySettings> = {};
    for (const key of Object.keys(DEFAULT_PLATFORM_SETTINGS) as Array<keyof MemorySettings>) {
        const value = Number(update[key]);
        if (update[key] !== undefined && Number.isFinite(value) && value >= 0) clean[key] = Math.round(value);
    }
    if (clean.maxMemoryMb !== undefined && clean.maxMemoryMb < 512) clean.maxMemoryMb = 512;
    await PlatformSettings.updateOne({ key: 'platform' }, { $set: clean }, { upsert: true });
    return getPlatformSettings();
}

export interface MemoryInput {
    serverType?: string;
    plugins?: number;
    mods?: number;
    /** Player slots the server is set up for */
    players?: number;
}

const MODDED = new Set(['forge', 'neoforge', 'fabric', 'quilt', 'magma', 'mohist', 'arclight', 'ketting', 'youer']);
const MODPACKS = new Set(['auto_curseforge', 'modrinth', 'ftba', 'curseforge', 'packwiz', 'generic_pack']);

/**
 * Heap, in MB, for a server: a base size, more for modded servers and modpacks, a little for every plugin and mod
 * and for every player above ten, kept between the administrators' minimum and maximum and rounded to 256 MB.
 */
export function computeMemoryMb(input: MemoryInput, settings: MemorySettings): number {
    const type = (input.serverType ?? '').toLowerCase();
    let memory = settings.baseMemoryMb;
    if (MODPACKS.has(type)) memory += settings.modpackExtraMb;
    else if (MODDED.has(type)) memory += settings.moddedExtraMb;
    memory += Math.max(0, input.plugins ?? 0) * settings.perPluginMb;
    memory += Math.max(0, input.mods ?? 0) * settings.perModMb;
    memory += Math.max(0, (input.players ?? 0) - 10) * settings.perPlayerMb;

    const rounded = Math.ceil(memory / 256) * 256;
    return Math.max(settings.minMemoryMb, Math.min(settings.maxMemoryMb, rounded));
}
