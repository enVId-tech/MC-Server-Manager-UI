import net from 'net';

/**
 * Checks of what is really listening on the network, independent of what Portainer or the database think.
 * Containers that were started outside the manager, other services on the host or a crashed deployment that left
 * a process behind all show up here.
 */

const CONNECT_TIMEOUT_MS = 800;

/**
 * Hosts probed for listeners. The Docker host is where published ports end up, which is the machine Portainer
 * runs on, so its host name is probed next to the local machine. PORT_CHECK_HOSTS (comma separated) replaces the list.
 */
export function getProbeHosts(): string[] {
    const configured = process.env.PORT_CHECK_HOSTS?.split(',').map(host => host.trim()).filter(Boolean);
    if (configured && configured.length > 0) return configured;

    const hosts = new Set<string>(['127.0.0.1']);
    try {
        if (process.env.PORTAINER_URL) hosts.add(new URL(process.env.PORTAINER_URL).hostname);
    } catch {
        // an invalid PORTAINER_URL only means one probe target less
    }
    return [...hosts];
}

/** True when something accepts connections on the port of this host */
export function isListening(port: number, host: string, timeoutMs: number = CONNECT_TIMEOUT_MS): Promise<boolean> {
    return new Promise(resolve => {
        const socket = new net.Socket();
        let settled = false;
        const finish = (result: boolean) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        // refused, unreachable, unknown host and timeouts all mean that nothing answers there
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(port, host);
    });
}

/** True when this process can claim the port itself, which fails while any local process holds it */
export function canBind(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, '0.0.0.0');
    });
}

export interface NetworkPortCheck {
    free: boolean;
    reason?: string;
}

/** Checks the port on this machine and on every probe host */
export async function checkPortOnNetwork(port: number, hosts: string[] = getProbeHosts()): Promise<NetworkPortCheck> {
    if (!(await canBind(port))) {
        return { free: false, reason: `Port ${port} is in use on the machine running the manager` };
    }

    const listening = await Promise.all(hosts.map(host => isListening(port, host)));
    const busyIndex = listening.findIndex(Boolean);
    if (busyIndex >= 0) {
        return { free: false, reason: `Port ${port} is already accepting connections on ${hosts[busyIndex]}` };
    }

    return { free: true };
}
