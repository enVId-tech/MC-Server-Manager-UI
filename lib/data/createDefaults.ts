import { SERVER_TYPES } from '@/lib/data/itzg';
import { getVersionsForType } from '@/lib/server/versionProviders';

export interface ServerTypeOption {
    id: string;
    name: string;
    family?: string;
    description?: string;
    supportsPlugins?: boolean;
    supportsMods?: boolean;
    /** The Minecraft version comes from the modpack, so no version is chosen */
    versionFromPack?: boolean;
}

export interface CreateOptions {
    /** Versions of the first server type. The wizard loads the list of other types from /api/server/versions */
    versions: string[];
    serverTypes: ServerTypeOption[];
    worldTypes: { id: string; name: string }[];
    gameModes: { value: string; label: string }[];
    difficulties: { value: string; label: string }[];
    worldFeatures: { name: string; label: string; enabled?: boolean }[];
}

/**
 * Options the server creation wizard offers when nothing has been customised in the `create` collection.
 * The ids match what convertClientConfigToServerConfig understands.
 */
export const DEFAULT_CREATE_OPTIONS: Omit<CreateOptions, 'versions' | 'serverTypes'> = {
    worldTypes: [
        { id: 'default', name: 'Default' },
        { id: 'flat', name: 'Superflat' },
        { id: 'largebiomes', name: 'Large Biomes' },
        { id: 'amplified', name: 'Amplified' },
    ],
    gameModes: [
        { value: 'survival', label: 'Survival' },
        { value: 'creative', label: 'Creative' },
        { value: 'adventure', label: 'Adventure' },
        { value: 'spectator', label: 'Spectator' },
    ],
    difficulties: [
        { value: 'peaceful', label: 'Peaceful' },
        { value: 'easy', label: 'Easy' },
        { value: 'normal', label: 'Normal' },
        { value: 'hard', label: 'Hard' },
    ],
    worldFeatures: [
        { name: 'generateStructuresEnabled', label: 'Generate Structures', enabled: true },
        { name: 'spawnAnimalsEnabled', label: 'Spawn Animals', enabled: true },
        { name: 'spawnMonstersEnabled', label: 'Spawn Monsters', enabled: true },
        { name: 'spawnNpcsEnabled', label: 'Spawn Villagers', enabled: true },
        { name: 'pvpEnabled', label: 'Enable PVP', enabled: true },
        { name: 'commandBlocksEnabled', label: 'Enable Command Blocks', enabled: false },
        { name: 'flightEnabled', label: 'Allow Flight', enabled: false },
    ],
};

/**
 * Server types the wizard offers. They come from the itzg catalog, never from the database, so new
 * types and their rules show up with the code.
 */
export const SERVER_TYPE_OPTIONS: ServerTypeOption[] = SERVER_TYPES.map(definition => ({
    id: definition.id,
    name: definition.name,
    family: definition.family,
    description: definition.description,
    supportsPlugins: definition.supportsPlugins,
    supportsMods: definition.supportsMods,
    versionFromPack: definition.versionFromPack,
}));

/**
 * Combine the options stored in the database with the defaults: every list that an administrator stored wins,
 * everything that is missing (including a completely empty database) falls back to the defaults.
 *
 * Versions and server types are the exception. They are always resolved live (see lib/server/versionProviders.ts
 * and lib/data/itzg), so anything an older setup stored under those names is ignored.
 */
export async function resolveCreateOptions(stored: Partial<CreateOptions> | null): Promise<CreateOptions> {
    const pick = <T>(value: T[] | undefined, fallback: T[]): T[] => (Array.isArray(value) && value.length > 0 ? value : fallback);

    return {
        versions: (await getVersionsForType(SERVER_TYPE_OPTIONS[0].id)).versions,
        serverTypes: SERVER_TYPE_OPTIONS,
        worldTypes: pick(stored?.worldTypes, DEFAULT_CREATE_OPTIONS.worldTypes),
        gameModes: pick(stored?.gameModes, DEFAULT_CREATE_OPTIONS.gameModes),
        difficulties: pick(stored?.difficulties, DEFAULT_CREATE_OPTIONS.difficulties),
        worldFeatures: pick(stored?.worldFeatures, DEFAULT_CREATE_OPTIONS.worldFeatures),
    };
}
