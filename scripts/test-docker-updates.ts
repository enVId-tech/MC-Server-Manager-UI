/**
 * Checks Docker image reference normalization and registry digest comparison used by the updater.
 *
 * Run with: npm run test:docker-updates
 */
import assert from 'node:assert/strict';
import { isDigestOutdated, normalizeImageRef } from '../lib/server/docker-image-updater';

let failures = 0;

function check(name: string, run: () => void) {
    try {
        run();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failures++;
        console.log(`  ✗ ${name}\n    ${(error as Error).message}`);
    }
}

function main() {
    console.log('Checking Docker image updater helpers...');

    check('normalizeImageRef appends :latest when tag is omitted', () => {
        assert.equal(normalizeImageRef('itzg/mc-proxy'), 'itzg/mc-proxy:latest');
        assert.equal(normalizeImageRef('itzg/minecraft-server'), 'itzg/minecraft-server:latest');
        assert.equal(normalizeImageRef('registry.example.com:5000/mc/server'), 'registry.example.com:5000/mc/server:latest');
    });

    check('normalizeImageRef preserves explicit tags and digests', () => {
        assert.equal(normalizeImageRef('itzg/mc-proxy:java25'), 'itzg/mc-proxy:java25');
        assert.equal(normalizeImageRef('itzg/mc-proxy@sha256:abc123'), 'itzg/mc-proxy@sha256:abc123');
    });

    check('isDigestOutdated compares local RepoDigests against remote registry digest', () => {
        const remote = 'sha256:21afbfa80000';
        assert.equal(isDigestOutdated(['itzg/mc-proxy@sha256:21afbfa80000'], remote), false);
        assert.equal(isDigestOutdated(['itzg/mc-proxy@sha256:5cb7e9870000'], remote), true);
        assert.equal(isDigestOutdated([], remote), false);
        assert.equal(isDigestOutdated(['itzg/mc-proxy@sha256:5cb7e9870000'], null), false);
    });

    if (failures > 0) process.exit(1);
    console.log('All Docker image updater helper checks passed.');
}

main();
