import axios from 'axios';
import { getServerType, type ServerTypeDefinition } from '@/lib/data/itzg';
import {
    limitToType,
    parseForgePromotions,
    parseLoaderMetaVersions,
    parseNeoForgeVersions,
    parseProjectVersions,
} from '@/lib/data/itzg/versionSources';
import { getMinecraftVersions } from './versionManifest';

/**
 * Minecraft versions each server platform can run, fetched from the platform's own API so the list
 * follows new releases without a code change or a database edit.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

const SOURCES: Record<string, { url: string; parse: (data: unknown) => string[] }> = {
    paper: { url: 'https://fill.papermc.io/v3/projects/paper', parse: parseProjectVersions },
    folia: { url: 'https://fill.papermc.io/v3/projects/folia', parse: parseProjectVersions },
    purpur: { url: 'https://api.purpurmc.org/v2/purpur', parse: parseProjectVersions },
    fabric: { url: 'https://meta.fabricmc.net/v2/versions/game', parse: parseLoaderMetaVersions },
    quilt: { url: 'https://meta.quiltmc.org/v3/versions/game', parse: parseLoaderMetaVersions },
    forge: { url: 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', parse: parseForgePromotions },
    neoforge: { url: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge', parse: parseNeoForgeVersions },
};

export interface VersionList {
    type: string;
    versions: string[];
    /** Where the list came from. "fallback" means the platform API could not be reached */
    source: 'platform' | 'mojang' | 'fixed' | 'none' | 'fallback';
}

const cache = new Map<string, { list: VersionList; fetchedAt: number }>();

async function fromPlatform(definition: ServerTypeDefinition): Promise<string[] | null> {
    const source = SOURCES[definition.versionSource];
    if (!source) return null;

    try {
        const response = await axios.get(source.url, { timeout: REQUEST_TIMEOUT_MS });
        const versions = source.parse(response.data);
        return versions.length > 0 ? versions : null;
    } catch (error) {
        console.warn(`Could not load the ${definition.name} version list:`, error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Versions a server type can run, newest first. Modpack types return no list because the pack
 * decides the version.
 */
export async function getVersionsForType(idOrType: string | undefined | null): Promise<VersionList> {
    const definition = getServerType(idOrType) ?? getServerType('vanilla')!;

    const cached = cache.get(definition.id);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.list;
    }

    let list: VersionList;

    if (definition.fixedVersion) {
        list = { type: definition.id, versions: [definition.fixedVersion], source: 'fixed' };
    } else if (definition.versionSource === 'none') {
        list = { type: definition.id, versions: [], source: 'none' };
    } else if (definition.versionSource === 'mojang') {
        list = { type: definition.id, versions: limitToType(await getMinecraftVersions(), definition), source: 'mojang' };
    } else {
        const platform = await fromPlatform(definition);
        if (platform) {
            list = { type: definition.id, versions: limitToType(platform, definition), source: 'platform' };
        } else {
            // The platform API is down: offer what Mojang lists instead of an empty picker
            list = { type: definition.id, versions: limitToType(await getMinecraftVersions(), definition), source: 'fallback' };
        }
    }

    // A failed lookup is not kept for an hour, so the next request tries the platform again
    if (list.source !== 'fallback') {
        cache.set(definition.id, { list, fetchedAt: Date.now() });
    }
    return list;
}
