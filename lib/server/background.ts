import { checkStartFailures } from './startGuard';
import { runAutoUpdate } from './autoUpdate';
import { adoptForSoleAdmin } from './existingServers';

const globalState = globalThis as unknown as { __mcsmJobs?: boolean };

/**
 * Jobs that run inside the server process: stopping servers that keep failing to start, and keeping images up to
 * date. Started once from instrumentation.ts. Set BACKGROUND_JOBS=false to run none of them.
 */
export function startBackgroundJobs(): void {
    if (globalState.__mcsmJobs || process.env.BACKGROUND_JOBS?.trim().toLowerCase() === 'false') return;
    globalState.__mcsmJobs = true;

    const guard = () => void checkStartFailures().catch(error => console.warn('[start-guard]', error instanceof Error ? error.message : error));
    const update = () => void runAutoUpdate().catch(error => console.warn('[auto-update]', error instanceof Error ? error.message : error));

    const adopt = () => void adoptForSoleAdmin();

    setInterval(guard, 60 * 1000).unref();
    setInterval(adopt, 10 * 60 * 1000).unref();
    setInterval(update, 60 * 60 * 1000).unref();
    // Soon after the start, once everything else is up
    setTimeout(guard, 20 * 1000).unref();
    setTimeout(update, 2 * 60 * 1000).unref();
    setTimeout(adopt, 45 * 1000).unref();
    console.log('Background jobs started: start failure guard (every minute), image updates (every hour), existing server detection (every 10 minutes)');
}
