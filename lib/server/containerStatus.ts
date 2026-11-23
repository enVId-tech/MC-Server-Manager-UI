/**
 * What a server's container is doing, as shown on the dashboard and the server page.
 *
 * Docker only says "running" or "exited". Two more states are worth showing: a container that is running but has
 * not finished starting (its health check says `starting`), and one that is shutting down. Docker has no state
 * for the second, so the routes that stop a server write a short-lived marker that is read here.
 */
export type LiveStatus = 'online' | 'offline' | 'starting' | 'stopping' | 'crashed' | 'unhealthy' | 'paused';

export interface Transition {
    action: 'starting' | 'stopping';
    at: Date | string | number;
}

/** How long a marker counts: a stop that takes longer than this is shown as what the container reports */
const STOPPING_MS = 3 * 60_000;
const STARTING_MS = 5 * 60_000;

interface ContainerLike {
    State?: string;
    Status?: string;
}

export function statusFromContainer(container: ContainerLike | null | undefined, transition?: Transition | null, now = Date.now()): LiveStatus {
    const age = transition ? now - new Date(transition.at).getTime() : Infinity;
    const stopping = transition?.action === 'stopping' && age < STOPPING_MS;
    const starting = transition?.action === 'starting' && age < STARTING_MS;

    if (!container) return starting ? 'starting' : 'offline';

    const state = (container.State ?? '').toLowerCase();
    const text = (container.Status ?? '').toLowerCase();

    if (state === 'paused' || text.includes('paused')) return 'paused';
    if (state === 'restarting' || text.startsWith('restarting')) return stopping ? 'stopping' : 'starting';

    const running = state === 'running' || (!state && text.startsWith('up'));
    if (running) {
        if (stopping) return 'stopping';
        // Containers created without a long start_period can report unhealthy during first-time jar/world init
        if (text.includes('unhealthy')) return starting ? 'starting' : 'unhealthy';
        if (text.includes('health: starting')) return 'starting';
        return 'online';
    }

    if (state === 'exited' || text.startsWith('exited') || state === 'dead') {
        const exit = text.match(/\((\d+)\)/);
        const code = exit ? parseInt(exit[1], 10) : 0;
        // 143 is a normal SIGTERM shutdown
        if (code !== 0 && code !== 143) return 'crashed';
        return starting ? 'starting' : 'offline';
    }

    // created, removing and anything unknown
    return starting ? 'starting' : 'offline';
}
