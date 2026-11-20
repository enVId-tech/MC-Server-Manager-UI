import { getMinecraftVersions } from '@/lib/server/versionManifest';

export interface CreateOptions {
    versions: string[];
    serverTypes: { id: string; name: string }[];
    worldTypes: { id: string; name: string }[];
    gameModes: { value: string; label: string }[];
    difficulties: { value: string; label: string }[];
    worldFeatures: { name: string; label: string; enabled?: boolean }[];
}

/**
 * Options the server creation wizard offers when nothing has been customised in the `create` collection.
 * The ids match what convertClientConfigToServerConfig understands.
 */
export const DEFAULT_CREATE_OPTIONS: Omit<CreateOptions, 'versions'> = {
    serverTypes: [
        { id: 'vanilla', name: 'Vanilla' },
        { id: 'paper', name: 'Paper' },
        { id: 'spigot', name: 'Spigot' },
        { id: 'bukkit', name: 'Bukkit' },
        { id: 'purpur', name: 'Purpur' },
        { id: 'forge', name: 'Forge' },
        { id: 'fabric', name: 'Fabric' },
    ],
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
 * Combine the options stored in the database with the defaults: every list that an administrator stored wins,
 * everything that is missing (including a completely empty database) falls back to the defaults.
 */
export async function resolveCreateOptions(stored: Partial<CreateOptions> | null): Promise<CreateOptions> {
    const pick = <T>(value: T[] | undefined, fallback: T[]): T[] => (Array.isArray(value) && value.length > 0 ? value : fallback);

    return {
        versions: pick(stored?.versions, await getMinecraftVersions()),
        serverTypes: pick(stored?.serverTypes, DEFAULT_CREATE_OPTIONS.serverTypes),
        worldTypes: pick(stored?.worldTypes, DEFAULT_CREATE_OPTIONS.worldTypes),
        gameModes: pick(stored?.gameModes, DEFAULT_CREATE_OPTIONS.gameModes),
        difficulties: pick(stored?.difficulties, DEFAULT_CREATE_OPTIONS.difficulties),
        worldFeatures: pick(stored?.worldFeatures, DEFAULT_CREATE_OPTIONS.worldFeatures),
    };
}
