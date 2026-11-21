import dbConnect from '@/lib/db/dbConnect';
import Server, { type ProxySettings } from '@/lib/objects/Server';
import portainer from '@/lib/server/portainer';
import { getContainerName } from '@/lib/server/containerNames';
import { getPlatformSettings } from '@/lib/server/memory';
import { createMinecraftServerFromRecord } from '@/lib/server/minecraft';
import { getEnvironmentId } from '@/lib/server/network/service';
import { defaultProxyImage } from '@/lib/server/network/proxyTemplates';
import { updateProxy } from '@/lib/server/network/proxyManagement';
import { getImageTag, getServerType } from '@/lib/data/itzg';

export interface AutoUpdateResult {
    at: Date;
    pulled: string[];
    updated: string[];
    failed: string[];
    skipped: string[];
    details: string[];
}

let last: AutoUpdateResult | null = null;
let running = false;

export function getLastAutoUpdate(): AutoUpdateResult | null {
    return last;
}

function inWindow(start: number, end: number, hour = new Date().getHours()): boolean {
    if (start === end) return true;
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Image a game server runs. The tag follows the Java version of the Minecraft version, modpacks use `latest` */
function gameImage(record: { serverConfig?: { serverType?: string; version?: string } }): string {
    const definition = getServerType(record.serverConfig?.serverType);
    return `itzg/minecraft-server:${definition?.versionFromPack ? 'latest' : getImageTag(record.serverConfig?.version)}`;
}

/**
 * Pulls newer images and recreates the containers that still run an older one. Pulling happens on every run, so
 * images stay fresh; containers are only recreated inside the update window (and only the running ones), one at a
 * time, with the same settings. The world and files are kept.
 */
export async function runAutoUpdate(options: { force?: boolean } = {}): Promise<AutoUpdateResult> {
    const result: AutoUpdateResult = { at: new Date(), pulled: [], updated: [], failed: [], skipped: [], details: [] };
    if (running) { result.details.push('An update is already running'); return result; }
    running = true;

    try {
        await dbConnect();
        const settings = await getPlatformSettings();
        if (!options.force && !settings.autoUpdateImages) { result.details.push('Automatic updates are switched off'); return result; }

        const environmentId = await getEnvironmentId();
        portainer.DefaultEnvironmentId = environmentId;
        const records = await Server.find({ imported: { $ne: true } });
        const containers = await portainer.getContainers(environmentId);
        const byName = new Map(containers.map(container => [container.Names[0]?.replace(/^\//, '') ?? '', container]));

        const imageOf = (record: (typeof records)[number]): string => record.kind === 'proxy'
            ? ((record.proxy as ProxySettings).image || defaultProxyImage((record.proxy as ProxySettings).type))
            : gameImage(record as never);

        // Pull every image once
        const ids = new Map<string, string | null>();
        for (const image of new Set(records.map(imageOf))) {
            try {
                await portainer.pullImage(image, environmentId);
                result.pulled.push(image);
            } catch (error) {
                result.details.push(`Could not pull ${image}: ${error instanceof Error ? error.message : 'unknown error'}`);
            }
            ids.set(image, await portainer.getImageId(image, environmentId));
        }

        const mayRecreate = options.force || inWindow(settings.updateWindowStart, settings.updateWindowEnd);
        for (const record of records) {
            const image = imageOf(record);
            const container = byName.get(getContainerName(record));
            const newId = ids.get(image);
            if (!container || !newId || container.ImageID === newId) continue;
            if (container.State !== 'running') { result.skipped.push(`${record.serverName} (not running)`); continue; }
            if (!mayRecreate) { result.skipped.push(`${record.serverName} (waiting for the update window)`); continue; }

            try {
                if (record.kind === 'proxy') {
                    await updateProxy(record.uniqueId, { pullImage: true });
                } else {
                    const stack = await portainer.getStackByName(`minecraft-${record.uniqueId}`);
                    if (!stack) throw new Error('its stack was not found');
                    await portainer.updateStack(stack.Id, createMinecraftServerFromRecord(record, environmentId, record.email).generateDockerComposeYaml(), environmentId, true);
                    await Server.updateOne({ _id: record._id }, { $unset: { startGuard: '' } });
                }
                result.updated.push(record.serverName);
            } catch (error) {
                result.failed.push(record.serverName);
                result.details.push(`${record.serverName}: ${error instanceof Error ? error.message : 'unknown error'}`);
            }
        }
        if (result.updated.length > 0) result.details.push(`Recreated ${result.updated.length} container${result.updated.length === 1 ? '' : 's'} on the newer image`);
    } catch (error) {
        result.details.push(error instanceof Error ? error.message : 'The update failed');
    } finally {
        running = false;
        last = result;
    }
    return result;
}
