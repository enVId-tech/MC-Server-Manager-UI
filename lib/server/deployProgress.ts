export type DeployStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WeightedStep {
    id: string;
    status: DeployStepStatus;
    progress?: number;
}

const STEP_WEIGHTS: Record<string, number> = {
    prerequisites: 5,
    validate: 5,
    subdomain: 4,
    ports: 4,
    folder: 4,
    docker: 8,
    deploy: 18,
    files: 10,
    upload: 12,
    velocity: 32,
    finalize: 10,
};

/**
 * Computes overall deployment percentage (0-100) using step weights and per-step progress so quick setup steps
 * do not jump straight past 50% and slow container/startup waits advance smoothly.
 */
export function calculateDeploymentProgress(steps: WeightedStep[]): number {
    if (steps.length === 0) return 0;

    let totalWeight = 0;
    let earnedWeight = 0;

    for (const step of steps) {
        const weight = STEP_WEIGHTS[step.id] ?? 10;
        totalWeight += weight;

        if (step.status === 'completed') {
            earnedWeight += weight;
        } else if (step.status === 'running') {
            const pct = Number.isFinite(step.progress) ? Math.max(0, Math.min(100, step.progress as number)) : 0;
            earnedWeight += weight * (pct / 100);
        }
    }

    if (totalWeight <= 0) return 0;
    const allCompleted = steps.every(step => step.status === 'completed');
    if (allCompleted) return 100;

    return Math.min(99, Math.max(0, Math.round((earnedWeight / totalWeight) * 100)));
}

/**
 * Maps container startup wait elapsed time and discovered config files to a 15-85% range inside the proxy/startup step.
 */
export function calculateStartupWaitStepProgress(elapsedMs: number, foundCount: number, requiredCount: number): number {
    const fileRatio = requiredCount > 0 ? Math.min(1, Math.max(0, foundCount / requiredCount)) : 0;
    const timeCurve = 1 - Math.exp(-Math.max(0, elapsedMs) / 45000);
    return Math.min(85, Math.max(15, Math.round(15 + fileRatio * 40 + timeCurve * 30)));
}

/** Extracts the last informative single-line log entry from Docker/Portainer logs for progress display. */
export function extractLatestStartupLogLine(rawLogs: string): string | undefined {
    if (!rawLogs) return undefined;
    // Strip Docker multiplexed 8-byte header characters and ANSI escape codes if present.
    const cleaned = rawLogs
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');

    const lines = cleaned
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length >= 4 && !line.startsWith('>') && !/^[\s.=_-]+$/.test(line));

    if (lines.length === 0) return undefined;
    const last = lines[lines.length - 1]
        .replace(/^\[[^\]]*INFO\s*\]:\s*/i, '')
        .replace(/^\[init\]\s*/i, '')
        .replace(/^\[mc-image-helper\]\s*[\d:.]+\s*\w+\s*:\s*/i, '')
        .trim();

    if (!last) return undefined;
    return last.length > 90 ? `${last.slice(0, 87)}...` : last;
}
