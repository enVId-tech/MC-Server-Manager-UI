import serverStorage from '@/lib/server/storage';
import portainer from '@/lib/server/portainer';
import { getImportRoots, hostPathToAppPath } from '@/lib/server/importPaths';

export interface VelocityInstance {
    /** Storage path of velocity.toml */
    configPath: string;
    /** Storage path of the folder that holds it */
    folder: string;
    source: 'env' | 'docker' | 'scan';
    containerName?: string;
}

const CONFIG_NAME = 'velocity.toml';
const SKIPPED_FOLDERS = new Set(['world', 'world_nether', 'world_the_end', 'plugins', 'mods', 'logs', 'cache', 'libraries', 'versions', 'backups', 'node_modules', '.git', 'crash-reports']);
const MAX_DEPTH = 3;
const MAX_FOLDERS = 600;
const CACHE_MS = 60_000;

let cache: { at: number; instances: VelocityInstance[] } | null = null;

function parentOf(filePath: string): string {
    const index = filePath.lastIndexOf('/');
    return index <= 0 ? '/' : filePath.slice(0, index);
}

/** Looks for velocity.toml in the storage folder and in every import folder. */
async function scanStorage(): Promise<VelocityInstance[]> {
    const roots = ['/', ...getImportRoots().map(root => root.appPath)];
    const found = new Map<string, VelocityInstance>();
    let visited = 0;

    const walk = async (folder: string, depth: number): Promise<void> => {
        if (visited >= MAX_FOLDERS) return;
        visited++;

        let entries;
        try {
            entries = await serverStorage.getDirectoryContents(folder);
        } catch {
            return;
        }

        if (entries.some(entry => entry.type === 'file' && entry.basename === CONFIG_NAME)) {
            const configPath = `${folder === '/' ? '' : folder}/${CONFIG_NAME}`;
            found.set(configPath, { configPath, folder, source: 'scan' });
        }
        if (depth >= MAX_DEPTH) return;

        for (const entry of entries) {
            if (entry.type === 'directory' && !SKIPPED_FOLDERS.has(entry.basename) && !entry.basename.startsWith('DELETED_')) {
                await walk(entry.filename, depth + 1);
            }
        }
    };

    for (const root of roots) {
        await walk(root, 0);
    }
    return [...found.values()];
}

/** Looks at the running Velocity containers and finds velocity.toml through their mounts. */
async function scanContainers(environmentId?: number): Promise<VelocityInstance[]> {
    const instances: VelocityInstance[] = [];
    try {
        const envId = await portainer.getValidEnvironmentId(environmentId ?? (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null));
        const containers = await portainer.getContainers(envId);

        for (const container of containers) {
            const name = container.Names[0]?.replace(/^\//, '') ?? container.Id;
            if (!/velocity/i.test(container.Image) && !/velocity/i.test(name)) continue;

            for (const mount of container.Mounts ?? []) {
                if (!mount.Source) continue;
                const candidates = mount.Destination.endsWith(CONFIG_NAME)
                    ? [mount.Source]
                    : [`${mount.Source.replace(/\/+$/, '')}/${CONFIG_NAME}`];

                for (const candidate of candidates) {
                    const appPath = hostPathToAppPath(candidate);
                    if (!appPath) continue;
                    try {
                        if (await serverStorage.exists(appPath)) {
                            instances.push({ configPath: appPath, folder: parentOf(appPath), source: 'docker', containerName: name });
                        }
                    } catch {
                        // not reachable from here
                    }
                }
            }
        }
    } catch {
        // Portainer is optional for discovery; scanning the folders still works
    }
    return instances;
}

/**
 * Every Velocity instance this app can reach, best first: VELOCITY_CONFIG_PATH, then the ones a running
 * Velocity container actually uses, then velocity.toml files found in the storage and import folders.
 */
export async function discoverVelocityInstances(options: { environmentId?: number; force?: boolean } = {}): Promise<VelocityInstance[]> {
    if (!options.force && cache && Date.now() - cache.at < CACHE_MS) {
        return cache.instances;
    }

    const instances: VelocityInstance[] = [];
    const add = (instance: VelocityInstance) => {
        if (!instances.some(existing => existing.configPath === instance.configPath)) instances.push(instance);
    };

    const configured = process.env.VELOCITY_CONFIG_PATH?.trim();
    if (configured) {
        try {
            if (await serverStorage.exists(configured)) {
                add({ configPath: configured, folder: parentOf(configured), source: 'env' });
            } else {
                console.warn(`VELOCITY_CONFIG_PATH ${configured} does not exist, looking for a Velocity instance instead.`);
            }
        } catch {
            // fall through to discovery
        }
    }

    (await scanContainers(options.environmentId)).forEach(add);
    // Shallower folders first: velocity/velocity.toml beats some/deep/old-copy/velocity.toml
    (await scanStorage())
        .sort((a, b) => a.configPath.split('/').length - b.configPath.split('/').length)
        .forEach(add);

    cache = { at: Date.now(), instances };
    return instances;
}

/** Forget what was discovered, for example after the admin registered a different proxy. */
export function clearVelocityDiscoveryCache(): void {
    cache = null;
}

/**
 * The velocity.toml every change goes to. An existing Velocity instance is always used; only when none exists
 * the given fallback (the long-standing default location) is returned and created by the caller.
 */
export async function resolveVelocityConfigPath(fallback: string): Promise<string> {
    try {
        const [first] = await discoverVelocityInstances();
        return first?.configPath ?? fallback;
    } catch {
        return fallback;
    }
}

/**
 * Whether a Velocity proxy already exists, as a container (running or not) or as a velocity.toml this app can reach.
 * Used before anything creates a proxy of its own.
 */
export async function findExistingVelocity(environmentId?: number): Promise<{ exists: boolean; description: string }> {
    const instances = await discoverVelocityInstances({ environmentId });
    if (instances.length > 0) {
        return { exists: true, description: instances[0].containerName ? `container ${instances[0].containerName} (${instances[0].configPath})` : instances[0].configPath };
    }

    try {
        const envId = await portainer.getValidEnvironmentId(environmentId ?? (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null));
        const containers = await portainer.getContainers(envId, true);
        const match = containers.find(container => /velocity/i.test(container.Image) || container.Names.some(name => /velocity/i.test(name)));
        if (match) {
            return { exists: true, description: `container ${match.Names[0]?.replace(/^\//, '') ?? match.Id}` };
        }
    } catch {
        // Portainer unreachable: nothing is known, the caller decides what that means
    }
    return { exists: false, description: '' };
}
