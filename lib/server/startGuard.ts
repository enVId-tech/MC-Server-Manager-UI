import dbConnect from '@/lib/db/dbConnect';
import Server from '@/lib/objects/Server';
import portainer from '@/lib/server/portainer';
import { getContainerName } from '@/lib/server/containerNames';
import { getPlatformSettings } from '@/lib/server/memory';
import { getEnvironmentId } from '@/lib/server/network/service';

/**
 * Stops servers that keep failing to start. The containers restart on their own, so a server that cannot start
 * (a broken plugin, no memory, a bad world) would restart for ever. Once Docker has restarted one more than the
 * administrators' limit allows, it is stopped, its restart policy is switched off and the reason is stored.
 * Starting it again from the dashboard puts the restart policy back.
 */
export async function checkStartFailures(): Promise<string[]> {
    await dbConnect();
    const settings = await getPlatformSettings();
    const stopped: string[] = [];

    let environmentId: number;
    try { environmentId = await getEnvironmentId(); } catch { return stopped; }

    const containers = await portainer.getContainers(environmentId);
    const byName = new Map(containers.map(container => [container.Names[0]?.replace(/^\//, '') ?? '', container]));

    const records = await Server.find({ startGuard: { $exists: false } }, 'uniqueId serverName containerName kind').lean<Array<{ uniqueId: string; serverName: string; containerName?: string; kind?: string }>>();
    for (const record of records) {
        const container = byName.get(getContainerName(record));
        // Only a container that is waiting to be restarted is in a failure loop
        if (!container || (container.State !== 'restarting' && container.State !== 'exited')) continue;

        try {
            const state = await portainer.getRestartState(container.Id, environmentId);
            if (state.restartCount < settings.maxStartFailures) continue;
            if (!state.restarting && state.exitCode === 0) continue;

            let lastLog = '';
            try {
                lastLog = (await portainer.getContainerLogs(container.Id, environmentId, 12)).split('\n').filter(line => !/secret|password|token/i.test(line)).slice(-8).join('\n').slice(-1500);
            } catch { /* the reason is optional */ }

            await portainer.setRestartPolicy(container.Id, 'no', environmentId);
            if (state.running || state.restarting) await portainer.stopContainer(container.Id, environmentId, 5).catch(() => undefined);
            await Server.updateOne({ uniqueId: record.uniqueId }, { $set: { isOnline: false, startGuard: { stoppedAt: new Date(), failures: state.restartCount, exitCode: state.exitCode, lastLog } } });
            console.warn(`[start-guard] ${record.serverName} was stopped after ${state.restartCount} failed starts (exit code ${state.exitCode})`);
            stopped.push(record.serverName);
        } catch (error) {
            console.warn(`[start-guard] could not check ${record.serverName}:`, error instanceof Error ? error.message : error);
        }
    }
    return stopped;
}

/** Called when somebody starts a server by hand: it may restart on its own again and the stop reason is cleared */
export async function clearStartGuard(uniqueId: string, containerId: string, environmentId: number): Promise<void> {
    await portainer.setRestartPolicy(containerId, 'unless-stopped', environmentId).catch(() => undefined);
    await Server.updateOne({ uniqueId }, { $unset: { startGuard: '' } });
}
