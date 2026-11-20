import { compareMinecraftVersions, isVersionInRange } from './versions';
import type { ServerTypeDefinition } from './types';

/**
 * Pure functions that turn the answers of the version APIs of the different server platforms into a
 * list of Minecraft versions, newest first. The network calls live in lib/server/versionProviders.ts.
 */

const RELEASE_PATTERN = /^\d+(?:\.\d+){1,2}$/;

/** Newest first, without duplicates. */
export function sortNewestFirst(versions: Iterable<string>): string[] {
    return [...new Set(versions)].sort((a, b) => compareMinecraftVersions(b, a));
}

/** Release versions only: 1.21.4 or 26.1, no snapshots, pre-releases or release candidates. */
export function onlyReleases(versions: Iterable<string>): string[] {
    return [...versions].filter(version => RELEASE_PATTERN.test(version));
}

/**
 * https://fill.papermc.io/v3/projects/{project} (versions grouped by release line, as an object)
 * and https://api.purpurmc.org/v2/purpur (flat array).
 */
export function parseProjectVersions(data: unknown): string[] {
    const versions = (data as { versions?: unknown })?.versions;
    const flat: unknown[] = Array.isArray(versions)
        ? versions
        : versions && typeof versions === 'object'
            ? Object.values(versions).flat()
            : [];
    return sortNewestFirst(onlyReleases(flat.filter((entry): entry is string => typeof entry === 'string')));
}

/** https://meta.fabricmc.net/v2/versions/game and https://meta.quiltmc.org/v3/versions/game */
export function parseLoaderMetaVersions(data: unknown): string[] {
    if (!Array.isArray(data)) return [];
    const stable = data
        .filter((entry): entry is { version: string; stable?: boolean } => typeof entry?.version === 'string' && entry.stable !== false)
        .map(entry => entry.version);
    return sortNewestFirst(onlyReleases(stable));
}

/** https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json */
export function parseForgePromotions(data: unknown): string[] {
    const promos = (data as { promos?: Record<string, unknown> })?.promos;
    if (!promos || typeof promos !== 'object') return [];

    const versions = Object.keys(promos)
        .map(key => key.match(/^(.+)-(?:latest|recommended)$/)?.[1])
        .filter((version): version is string => !!version);
    return sortNewestFirst(onlyReleases(versions));
}

/**
 * NeoForge versions name the Minecraft version they are for: 21.4.5 is for 1.21.4 and 20.4.1 for
 * 1.20.4 (a zero patch such as 21.0.3 means 1.21). Year based releases keep their number.
 * https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge
 */
export function parseNeoForgeVersions(data: unknown): string[] {
    const versions = (data as { versions?: unknown })?.versions;
    if (!Array.isArray(versions)) return [];

    const minecraft = new Set<string>();
    for (const entry of versions) {
        if (typeof entry !== 'string' || entry.includes('-')) continue; // skip -beta and similar

        const [first, second] = entry.split('.').map(Number);
        if (!Number.isFinite(first) || !Number.isFinite(second)) continue;

        minecraft.add(first >= 26 ? `${first}.${second}` : second === 0 ? `1.${first}` : `1.${first}.${second}`);
    }
    return sortNewestFirst(minecraft);
}

/** Keep the versions a server type can run. */
export function limitToType(versions: string[], definition: Pick<ServerTypeDefinition, 'minVersion' | 'maxVersion'>): string[] {
    return versions.filter(version => isVersionInRange(version, definition.minVersion, definition.maxVersion));
}
