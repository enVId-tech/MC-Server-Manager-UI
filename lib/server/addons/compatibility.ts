import type { AddonKind } from './jar';

const SOURCE_LABELS: Record<string, string> = {
    modrinth: 'Modrinth',
    spigot: 'SpigotMC',
    bukkit: 'Bukkit',
    curseforge: 'CurseForge',
    other: 'Direct link',
};

const MOD_LOADER_IDS = new Set(['fabric', 'forge', 'neoforge', 'quilt', 'liteloader', 'rift']);

export interface AddonCompatibilityTarget {
    plugins: boolean;
    mods: boolean;
    type?: string;
    typeName?: string;
    loaders?: string[];
}

export interface AddonCompatibilitySubject {
    name?: string | null;
    source: string;
    kinds: AddonKind[];
    loaders?: string[];
}

function defaultLoadersForServerType(typeId: string | undefined): string[] {
    const id = (typeId ?? '').toLowerCase();
    if (['forge', 'mohist', 'magma', 'magma_maintained', 'ketting', 'crucible'].includes(id)) return ['forge'];
    if (['neoforge', 'youer'].includes(id)) return ['neoforge'];
    if (['fabric', 'banner'].includes(id)) return ['fabric'];
    if (id === 'quilt') return ['quilt', 'fabric'];
    if (id === 'arclight') return ['forge', 'neoforge', 'fabric'];
    return [];
}

/**
 * Returns a human-readable warning when a linked plugin/mod does not match what the server can load
 * (e.g. a mod-only project added to a plugin-only server, or vice versa). Returns null when compatible or unknown.
 */
export function checkAddonCompatibility(
    addon: AddonCompatibilitySubject,
    server: AddonCompatibilityTarget
): string | null {
    if (addon.source === 'other' || addon.kinds.length === 0) return null;

    const projectName = addon.name?.trim() || 'This item';
    const sourceLabel = SOURCE_LABELS[addon.source] ?? addon.source;
    const serverLabel = server.typeName?.trim() || server.type?.trim() || 'this server';

    if (!server.plugins && !server.mods) {
        return `${serverLabel} does not load plugins or mods, so ${projectName} may not be compatible.`;
    }

    if (server.plugins && !server.mods && !addon.kinds.includes('plugin')) {
        return `${projectName} is listed as a mod and no plugin version was found on ${sourceLabel}. ${serverLabel} only loads plugins, so it may not be compatible.`;
    }

    if (server.mods && !server.plugins && !addon.kinds.includes('mod')) {
        return `${projectName} is listed as a plugin and no mod version was found on ${sourceLabel}. ${serverLabel} only loads mods, so it may not be compatible.`;
    }

    if (server.mods && !server.plugins && addon.kinds.includes('mod') && addon.loaders && addon.loaders.length > 0) {
        const modLoaders = addon.loaders.filter(loader => MOD_LOADER_IDS.has(loader.toLowerCase())).map(loader => loader.toLowerCase());
        const expected = (server.loaders && server.loaders.length > 0 ? server.loaders : defaultLoadersForServerType(server.type))
            .map(loader => loader.toLowerCase());
        if (modLoaders.length > 0 && expected.length > 0 && !expected.some(loader => modLoaders.includes(loader))) {
            return `${projectName} targets ${modLoaders.join('/')} on ${sourceLabel}, while ${serverLabel} uses ${expected.join('/')}, so it may not be compatible.`;
        }
    }

    return null;
}
