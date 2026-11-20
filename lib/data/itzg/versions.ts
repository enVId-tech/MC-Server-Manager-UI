/**
 * Minecraft version helpers shared by the option catalog, the create wizard and the container setup.
 *
 * Releases up to 1.21.x are numbered "1.<minor>.<patch>". Newer releases use the year based scheme
 * ("26.1", "26.1.2"), which always sorts above every 1.x release.
 */

export type VersionTuple = [era: number, major: number, patch: number];

const SPECIAL_LATEST = new Set(['LATEST', 'SNAPSHOT', '']);

/**
 * True for values that are not a concrete version (LATEST, SNAPSHOT or nothing at all).
 */
export function isFloatingVersion(version: string | undefined | null): boolean {
    return !version || SPECIAL_LATEST.has(version.trim().toUpperCase());
}

/**
 * Turn a version such as "1.20.4", "26.1" or "1.21-pre1" into something comparable.
 * Floating versions (LATEST, SNAPSHOT) are treated as newer than everything.
 */
export function toVersionTuple(version: string | undefined | null): VersionTuple {
    if (isFloatingVersion(version)) {
        return [Number.MAX_SAFE_INTEGER, 0, 0];
    }

    const numbers = (version as string).trim().match(/\d+/g)?.map(Number) ?? [];
    if (numbers.length === 0) {
        return [Number.MAX_SAFE_INTEGER, 0, 0];
    }

    const [first, second = 0, third = 0] = numbers;
    return [first, second, third];
}

/**
 * Negative when a is older than b, positive when it is newer, zero when they are equal.
 */
export function compareMinecraftVersions(a: string | undefined | null, b: string | undefined | null): number {
    const left = toVersionTuple(a);
    const right = toVersionTuple(b);

    for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) {
            return left[index] < right[index] ? -1 : 1;
        }
    }
    return 0;
}

export function isAtLeast(version: string | undefined | null, minimum: string): boolean {
    return compareMinecraftVersions(version, minimum) >= 0;
}

export function isBelow(version: string | undefined | null, limit: string): boolean {
    return compareMinecraftVersions(version, limit) < 0;
}

/**
 * Whether a version falls inside an optional inclusive minimum and exclusive maximum.
 */
export function isVersionInRange(version: string | undefined | null, minVersion?: string, maxVersion?: string): boolean {
    if (minVersion && !isAtLeast(version, minVersion)) return false;
    if (maxVersion && !isBelow(version, maxVersion)) return false;
    return true;
}

export type JavaTag = 'java8' | 'java17' | 'java21' | 'java25';

/**
 * Java major version a Minecraft version needs. Fixed by the game, so the interface shows it as read only.
 */
export function getRequiredJavaVersion(version: string | undefined | null): 8 | 17 | 21 | 25 {
    if (isFloatingVersion(version)) return 25;
    if (isBelow(version, '1.17')) return 8;
    if (isBelow(version, '1.20.5')) return 17;
    if (isBelow(version, '26.1')) return 21;
    return 25;
}

/**
 * Tag of the itzg/minecraft-server image that ships the right Java for a version.
 * Floating versions use the untagged image, which always carries a Java that can run the newest release.
 */
export function getImageTag(version: string | undefined | null): string {
    if (isFloatingVersion(version)) return 'latest';
    return `java${getRequiredJavaVersion(version)}`;
}
