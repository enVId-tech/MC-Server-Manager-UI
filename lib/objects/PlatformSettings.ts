import pkg from 'mongoose';

/**
 * Limits and rules set by administrators for the whole installation. One document, key `platform`.
 */
export interface IPlatformSettings extends pkg.Document {
    key: string;
    /** Largest heap, in MB, a server gets from the automatic sizing */
    maxMemoryMb: number;
    /** Smallest heap a server gets */
    minMemoryMb: number;
    /** Heap of a plain server before plugins, mods and players are counted */
    baseMemoryMb: number;
    /** Extra heap for a modded server (Forge, NeoForge, Fabric, Quilt) */
    moddedExtraMb: number;
    /** Extra heap for a modpack */
    modpackExtraMb: number;
    perPluginMb: number;
    perModMb: number;
    /** Heap for every player above the first ten */
    perPlayerMb: number;
    /** Containers stop being restarted after this many failed starts in a row */
    maxStartFailures: number;
}

const PlatformSettingsSchema = new pkg.Schema({
    key: { type: String, required: true, unique: true, default: 'platform' },
    maxMemoryMb: { type: Number, default: 8192, min: 512 },
    minMemoryMb: { type: Number, default: 1024, min: 256 },
    baseMemoryMb: { type: Number, default: 1024, min: 256 },
    moddedExtraMb: { type: Number, default: 1024, min: 0 },
    modpackExtraMb: { type: Number, default: 2048, min: 0 },
    perPluginMb: { type: Number, default: 24, min: 0 },
    perModMb: { type: Number, default: 40, min: 0 },
    perPlayerMb: { type: Number, default: 40, min: 0 },
    maxStartFailures: { type: Number, default: 5, min: 1, max: 50 },
}, { timestamps: true });

const PlatformSettings = pkg.models.platformsettings || pkg.model<IPlatformSettings>('platformsettings', PlatformSettingsSchema);
export default PlatformSettings;
