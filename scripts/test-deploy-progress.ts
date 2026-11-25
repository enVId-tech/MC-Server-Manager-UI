/**
 * Checks weighted deployment progress calculation and startup log parsing.
 *
 * Run with: npm run test:deploy-progress
 */
import assert from 'node:assert/strict';
import {
    calculateDeploymentProgress,
    calculateStartupWaitStepProgress,
    extractLatestStartupLogLine,
    type WeightedStep,
} from '../lib/server/deployProgress';

const baseSteps = (): WeightedStep[] => [
    { id: 'prerequisites', status: 'completed', progress: 100 },
    { id: 'validate', status: 'completed', progress: 100 },
    { id: 'docker', status: 'completed', progress: 100 },
    { id: 'deploy', status: 'pending', progress: 0 },
    { id: 'files', status: 'pending', progress: 0 },
    { id: 'upload', status: 'pending', progress: 0 },
    { id: 'velocity', status: 'pending', progress: 0 },
    { id: 'finalize', status: 'pending', progress: 0 },
];

// Early fast steps after docker generation stay well below 54%
const afterDocker = calculateDeploymentProgress(baseSteps());
assert.ok(afterDocker > 0 && afterDocker < 25, `Expected <25% after docker step, got ${afterDocker}%`);

// Slow startup wait advances smoothly across time & file readiness inside velocity step
const waitStart = calculateStartupWaitStepProgress(1000, 0, 3);
const waitMid = calculateStartupWaitStepProgress(25000, 1, 3);
const waitLater = calculateStartupWaitStepProgress(60000, 2, 3);
assert.ok(waitStart < waitMid && waitMid < waitLater && waitLater <= 85);

const overallStart = calculateDeploymentProgress([
    ...baseSteps().slice(0, 3),
    { id: 'deploy', status: 'completed', progress: 100 },
    { id: 'files', status: 'completed', progress: 100 },
    { id: 'upload', status: 'completed', progress: 100 },
    { id: 'velocity', status: 'running', progress: waitStart },
    { id: 'finalize', status: 'pending', progress: 0 },
]);
const overallLater = calculateDeploymentProgress([
    ...baseSteps().slice(0, 3),
    { id: 'deploy', status: 'completed', progress: 100 },
    { id: 'files', status: 'completed', progress: 100 },
    { id: 'upload', status: 'completed', progress: 100 },
    { id: 'velocity', status: 'running', progress: waitLater },
    { id: 'finalize', status: 'pending', progress: 0 },
]);
assert.ok(overallLater > overallStart, `Expected overall progress to rise smoothly (${overallStart} -> ${overallLater})`);

// Completed steps reach 100%
const done = calculateDeploymentProgress(baseSteps().map(step => ({ ...step, status: 'completed', progress: 100 })));
assert.equal(done, 100);

// Log sanitizer strips Docker/init prefixes cleanly
assert.equal(
    extractLatestStartupLogLine('\u0001\u0000\u0000\u0000[init] Downloading mojang_26.3.jar\n[12:00:01 INFO]: Preparing spawn area: 68%'),
    'Preparing spawn area: 68%'
);

console.log('All deployment progress checks passed.');
