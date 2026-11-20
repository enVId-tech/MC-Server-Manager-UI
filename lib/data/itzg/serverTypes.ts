import type { ServerTypeDefinition } from './types';

/**
 * Every value of the itzg/minecraft-server TYPE variable the manager can create.
 * Ids are lowercase so they can be stored, put in URLs and compared without case worries.
 */
export const SERVER_TYPES: ServerTypeDefinition[] = [
    {
        id: 'vanilla', type: 'VANILLA', name: 'Vanilla', family: 'vanilla',
        description: 'The official Mojang server with no plugin or mod support.',
        supportsPlugins: false, supportsMods: false, versionSource: 'mojang',
    },
    {
        id: 'paper', type: 'PAPER', name: 'Paper', family: 'bukkit',
        description: 'High performance Spigot fork and the usual choice for plugin servers.',
        supportsPlugins: true, supportsMods: false, versionSource: 'paper',
    },
    {
        id: 'folia', type: 'FOLIA', name: 'Folia', family: 'bukkit',
        description: 'Paper fork with regionised multithreading for very large servers. Many plugins are not compatible.',
        supportsPlugins: true, supportsMods: false, minVersion: '1.19.4', versionSource: 'folia',
    },
    {
        id: 'purpur', type: 'PURPUR', name: 'Purpur', family: 'bukkit',
        description: 'Paper fork with many extra gameplay options.',
        supportsPlugins: true, supportsMods: false, minVersion: '1.14', versionSource: 'purpur',
    },
    {
        id: 'pufferfish', type: 'PUFFERFISH', name: 'Pufferfish', family: 'bukkit',
        description: 'Paper fork focused on performance for large servers.',
        supportsPlugins: true, supportsMods: false, versionSource: 'mojang',
    },
    {
        id: 'leaf', type: 'LEAF', name: 'Leaf', family: 'bukkit',
        description: 'Paper fork that merges performance patches from several projects.',
        supportsPlugins: true, supportsMods: false, versionSource: 'mojang',
    },
    {
        id: 'spigot', type: 'SPIGOT', name: 'Spigot', family: 'bukkit',
        description: 'The classic plugin server, built from source on first start.',
        supportsPlugins: true, supportsMods: false, versionSource: 'mojang',
        note: 'The first start compiles the server and takes several minutes.',
    },
    {
        id: 'bukkit', type: 'BUKKIT', name: 'CraftBukkit', family: 'bukkit',
        description: 'The original Bukkit plugin server, built from source on first start.',
        supportsPlugins: true, supportsMods: false, versionSource: 'mojang',
        note: 'The first start compiles the server and takes several minutes.',
    },
    {
        id: 'forge', type: 'FORGE', name: 'Forge', family: 'modded',
        description: 'The long standing mod loader with the largest mod library.',
        supportsPlugins: false, supportsMods: true, versionSource: 'forge',
    },
    {
        id: 'neoforge', type: 'NEOFORGE', name: 'NeoForge', family: 'modded',
        description: 'Community continuation of Forge for current Minecraft versions.',
        supportsPlugins: false, supportsMods: true, minVersion: '1.20.1', versionSource: 'neoforge',
    },
    {
        id: 'fabric', type: 'FABRIC', name: 'Fabric', family: 'modded',
        description: 'Lightweight mod loader that updates quickly for new Minecraft releases.',
        supportsPlugins: false, supportsMods: true, minVersion: '1.14', versionSource: 'fabric',
    },
    {
        id: 'quilt', type: 'QUILT', name: 'Quilt', family: 'modded',
        description: 'Fabric compatible mod loader with its own tooling.',
        supportsPlugins: false, supportsMods: true, minVersion: '1.14', versionSource: 'quilt',
    },
    {
        id: 'spongevanilla', type: 'SPONGEVANILLA', name: 'SpongeVanilla', family: 'other',
        description: 'Sponge plugin platform on top of the vanilla server.',
        supportsPlugins: true, supportsMods: false, versionSource: 'mojang',
    },
    {
        id: 'mohist', type: 'MOHIST', name: 'Mohist', family: 'hybrid',
        description: 'Runs Forge mods and Bukkit plugins together.',
        supportsPlugins: true, supportsMods: true, versionSource: 'mojang',
    },
    {
        id: 'banner', type: 'BANNER', name: 'Banner', family: 'hybrid',
        description: 'Runs Fabric mods and Bukkit plugins together (Mohist project).',
        supportsPlugins: true, supportsMods: true, versionSource: 'mojang',
    },
    {
        id: 'arclight', type: 'ARCLIGHT', name: 'Arclight', family: 'hybrid',
        description: 'Runs Forge, NeoForge or Fabric mods together with Bukkit plugins.',
        supportsPlugins: true, supportsMods: true, versionSource: 'mojang',
    },
    {
        id: 'magma', type: 'MAGMA', name: 'Magma', family: 'hybrid',
        description: 'Forge and Bukkit hybrid for older Minecraft versions.',
        supportsPlugins: true, supportsMods: true, versionSource: 'mojang',
    },
    {
        id: 'magma_maintained', type: 'MAGMA_MAINTAINED', name: 'Magma (maintained)', family: 'hybrid',
        description: 'Actively maintained Magma fork for current Minecraft versions.',
        supportsPlugins: true, supportsMods: true, versionSource: 'mojang',
    },
    {
        id: 'ketting', type: 'KETTING', name: 'Ketting', family: 'hybrid',
        description: 'Forge and Bukkit hybrid.',
        supportsPlugins: true, supportsMods: true, versionSource: 'mojang',
    },
    {
        id: 'youer', type: 'YOUER', name: 'Youer', family: 'hybrid',
        description: 'NeoForge and Bukkit hybrid.',
        supportsPlugins: true, supportsMods: true, versionSource: 'mojang',
    },
    {
        id: 'glowstone', type: 'GLOWSTONE', name: 'Glowstone', family: 'bukkit',
        description: 'Open source, lightweight reimplementation of the Bukkit API.',
        supportsPlugins: true, supportsMods: false, versionSource: 'mojang',
    },
    {
        id: 'crucible', type: 'CRUCIBLE', name: 'Crucible', family: 'hybrid',
        description: 'Forge and Bukkit hybrid for Minecraft 1.7.10.',
        supportsPlugins: true, supportsMods: true, fixedVersion: '1.7.10', versionSource: 'none',
    },
    {
        id: 'limbo', type: 'LIMBO', name: 'Limbo', family: 'other',
        description: 'Minimal lobby server with a single empty world. Useful behind a proxy.',
        supportsPlugins: false, supportsMods: false, versionSource: 'mojang',
    },
    {
        id: 'modrinth', type: 'MODRINTH', name: 'Modrinth modpack', family: 'modpack',
        description: 'Installs a modpack from Modrinth together with the loader it needs.',
        supportsPlugins: false, supportsMods: true, versionFromPack: true, versionSource: 'none',
    },
    {
        id: 'auto_curseforge', type: 'AUTO_CURSEFORGE', name: 'CurseForge modpack', family: 'modpack',
        description: 'Installs and updates a CurseForge modpack. Needs a CurseForge API key.',
        supportsPlugins: false, supportsMods: true, versionFromPack: true, versionSource: 'none',
    },
    {
        id: 'ftba', type: 'FTBA', name: 'Feed the Beast modpack', family: 'modpack',
        description: 'Installs a modpack from the Feed the Beast app catalogue.',
        supportsPlugins: false, supportsMods: true, versionFromPack: true, versionSource: 'none',
    },
    {
        id: 'custom', type: 'CUSTOM', name: 'Custom server jar', family: 'other',
        description: 'Runs a server jar you provide by URL or file path.',
        supportsPlugins: false, supportsMods: false, versionSource: 'none',
    },
];

const BY_ID = new Map(SERVER_TYPES.map(definition => [definition.id, definition]));
const BY_TYPE = new Map(SERVER_TYPES.map(definition => [definition.type, definition]));

/**
 * Look a server type up by its lowercase id or by the TYPE value.
 */
export function getServerType(idOrType: string | undefined | null): ServerTypeDefinition | undefined {
    if (!idOrType) return undefined;
    return BY_ID.get(idOrType.toLowerCase()) ?? BY_TYPE.get(idOrType.toUpperCase());
}

/**
 * The TYPE value for an id, falling back to VANILLA for unknown ids.
 */
export function toContainerType(idOrType: string | undefined | null): string {
    return getServerType(idOrType)?.type ?? 'VANILLA';
}

/**
 * Whether a selector entry ("paper" or "family:bukkit") matches a server type.
 */
export function matchesSelector(selector: string[] | undefined, idOrType: string | undefined | null): boolean {
    if (!selector || selector.length === 0) return true;

    const definition = getServerType(idOrType);
    if (!definition) return false;

    return selector.some(entry => {
        if (entry.startsWith('family:')) return definition.family === entry.slice('family:'.length);
        if (entry === 'plugins') return definition.supportsPlugins;
        if (entry === 'mods') return definition.supportsMods;
        return entry.toLowerCase() === definition.id;
    });
}

export function supportsPlugins(idOrType: string | undefined | null): boolean {
    return getServerType(idOrType)?.supportsPlugins ?? false;
}

export function supportsMods(idOrType: string | undefined | null): boolean {
    return getServerType(idOrType)?.supportsMods ?? false;
}
