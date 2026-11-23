/**
 * A new server only creates server.properties, spigot.yml and paper-global.yml when it starts for the first time,
 * so the proxy setup that writes the forwarding settings into them can be missing files when it runs. A server in
 * that state lets players through the proxy only to refuse them ("Your server did not send a forwarding request").
 * This finishes the setup as soon as the files exist and restarts the server once so it reads them.
 */
import Server from '@/lib/objects/Server';
import portainer from '@/lib/server/portainer';
import serverStorage from '@/lib/server/storage';
import { getContainerName } from '@/lib/server/containerNames';
import { getEnvironmentId, syncServerNetwork } from './service';

const RETRY_AFTER_MS = 90_000;

async function pendingFileExists(folder: string, pending: string[]): Promise<boolean> {
    const candidates = new Map<string, string[]>([
        ['server.properties', [`${folder}/server.properties`]],
        ['spigot.yml', [`${folder}/spigot.yml`]],
        ['paper-global.yml', [`${folder}/config/paper-global.yml`, `${folder}/paper.yml`]],
    ]);
    for (const file of pending) {
        const paths = candidates.get(file) ?? [`${folder}/${file}`];
        for (const candidate of paths) {
            if (await serverStorage.exists(candidate).catch(() => false)) return true;
        }
    }
    return false;
}

export async function finishPendingNetworkSetups(): Promise<string[]> {
    const servers = await Server.find({ kind: { $ne: 'proxy' }, 'network.pendingFiles.0': { $exists: true } });
    if (servers.length === 0) return [];

    const notes: string[] = [];
    const environmentId = await getEnvironmentId().catch(() => undefined);
    for (const server of servers) {
        const last = server.network?.syncedAt ? new Date(server.network.syncedAt).getTime() : 0;
        if (Date.now() - last < RETRY_AFTER_MS) continue;

        try {
            // Only once the server has actually finished booting and created at least one pending file
            const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId ?? null);
            if (container?.State !== 'running') continue;
            if (/health:\s*starting/i.test(container.Status ?? '')) continue;
            const pending = (server.network?.pendingFiles ?? []) as string[];
            if (pending.length > 0 && !(await pendingFileExists(server.folderPath, pending))) continue;

            const result = await syncServerNetwork(server, { restart: true, environmentId });
            notes.push(`${server.serverName}: ${result.details.filter(line => /server\.properties|spigot|paper|Restarted/i.test(line)).join('; ') || 'checked'}`);
        } catch (error) {
            notes.push(`${server.serverName}: ${error instanceof Error ? error.message : 'failed'}`);
        }
    }
    return notes;
}
