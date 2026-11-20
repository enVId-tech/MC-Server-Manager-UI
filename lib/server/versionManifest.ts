import axios from 'axios';
import { parseMinecraftVersion } from '@/lib/utils/versionUtils';

const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // The release list changes rarely, once an hour is plenty
const MINIMUM_SUPPORTED = { major: 1, minor: 8 }; // Oldest version the wizard offers

// Used when Mojang can not be reached, so the wizard never ends up with an empty version list
const FALLBACK_VERSIONS = [
    '1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1',
    '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.15.2', '1.14.4', '1.13.2',
    '1.12.2', '1.11.2', '1.10.2', '1.9.4', '1.8.8',
];

interface ManifestVersion {
    id: string;
    type: string;
}

let cache: { versions: string[]; fetchedAt: number } | null = null;

/**
 * Release versions of Minecraft that can be deployed, newest first.
 */
export async function getMinecraftVersions(): Promise<string[]> {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.versions;
    }

    try {
        const response = await axios.get<{ versions: ManifestVersion[] }>(VERSION_MANIFEST_URL, { timeout: 5000 });

        const versions = response.data.versions
            .filter(version => version.type === 'release')
            .map(version => version.id)
            .filter(id => {
                const { major, minor } = parseMinecraftVersion(id);
                return major > MINIMUM_SUPPORTED.major || (major === MINIMUM_SUPPORTED.major && minor >= MINIMUM_SUPPORTED.minor);
            });

        if (versions.length === 0) {
            throw new Error('The version manifest did not contain any release versions.');
        }

        cache = { versions, fetchedAt: Date.now() };
        return versions;
    } catch (error) {
        console.warn('Could not load the Minecraft version manifest, using the built in list:', error instanceof Error ? error.message : error);

        // Keep serving the last good list when there is one
        return cache?.versions ?? FALLBACK_VERSIONS;
    }
}
