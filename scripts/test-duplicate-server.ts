/**
 * Checks server duplication validation (name + folder name uniqueness, IP/subdomain differentiation,
 * server.properties normalization, and directory copying excluding runtime lock files).
 *
 * Run with: npm run test:duplicate
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempStorageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-duplicate-test-'));
process.env.STORAGE_BACKEND = 'local';
process.env.LOCAL_STORAGE_PATH = tempStorageRoot;

const {
    copyServerDirectory,
    hasNameOrFolderCollision,
    leafFolderName,
    prepareDuplicateServerProperties,
    suggestDuplicateName,
    suggestDuplicateSubdomain,
} = await import('../lib/server/duplicateServer');
const { default: serverStorage } = await import('../lib/server/storage');

let failures = 0;

async function check(name: string, run: () => Promise<void> | void) {
    try {
        await run();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failures++;
        console.log(`  ✗ ${name}\n    ${(error as Error).message}`);
    }
}

async function main() {
    console.log('Checking server duplication helpers and file cloning...');

    try {
        await check('hasNameOrFolderCollision rejects matching server names and folder names (case-insensitive)', () => {
            const names = ['Survival World', 'Lobby'];
            const folders = ['survival-original', 'uuid-1234', 'My_Folder'];

            assert.equal(hasNameOrFolderCollision('survival world', names, folders).conflict, true);
            assert.equal(hasNameOrFolderCollision('Survival-Original', names, folders).conflict, true);
            assert.equal(hasNameOrFolderCollision('My/Folder', names, folders).conflict, true);
            assert.equal(hasNameOrFolderCollision('Survival Two', names, folders).conflict, false);
        });

        await check('suggestDuplicateName skips existing server names and folder names and stays <= 50 chars', () => {
            const names = ['Survival', 'Survival (Copy)'];
            const folders = ['Survival (Copy 2)'];
            assert.equal(suggestDuplicateName('Survival', names, folders), 'Survival (Copy 3)');

            const longName = 'A'.repeat(50);
            const suggested = suggestDuplicateName(longName, [longName], []);
            assert.ok(suggested.length <= 50);
            assert.notEqual(suggested, longName);
        });

        await check('suggestDuplicateSubdomain produces a valid, unused subdomain different from source', () => {
            const taken = ['survival', 'survival-copy'];
            const suggested = suggestDuplicateSubdomain('survival', taken);
            assert.equal(suggested, 'survival-copy-2');
            assert.match(suggested, /^[a-z0-9]+(-[a-z0-9]+)*$/);
        });

        await check('prepareDuplicateServerProperties resets server-port, clears server-ip, and sets rcon.port', () => {
            const input = [
                'motd=Test World',
                'server-port=25570',
                'server-ip=127.0.0.1',
                'rcon.port=25599',
                'difficulty=hard',
            ].join('\n');

            const output = prepareDuplicateServerProperties(input, { rconEnabled: true });
            assert.match(output, /^server-port=25565$/m);
            assert.match(output, /^server-ip=$/m);
            assert.match(output, /^rcon\.port=25575$/m);
            assert.match(output, /^motd=Test World$/m);
            assert.match(output, /^difficulty=hard$/m);
        });

        await check('leafFolderName extracts the trailing folder name across separators', () => {
            assert.equal(leafFolderName('/minecraft-servers/alex/survival'), 'survival');
            assert.equal(leafFolderName('C:\\data\\servers\\bedwars\\'), 'bedwars');
        });

        await check('copyServerDirectory clones worlds/plugins/configs while skipping lock and compose files', async () => {
            const src = '/minecraft-servers/tester/source-srv';
            const dst = '/minecraft-servers/tester/target-srv';

            await serverStorage.createDirectory(`${src}/world`);
            await serverStorage.createDirectory(`${src}/plugins`);
            await serverStorage.createDirectory(`${src}/config`);

            await serverStorage.uploadFile(`${src}/server.properties`, 'motd=Hello\nserver-port=25569\n', true);
            await serverStorage.uploadFile(`${src}/world/level.dat`, Buffer.from('world-bytes'), true);
            await serverStorage.uploadFile(`${src}/world/session.lock`, Buffer.from('locked'), true);
            await serverStorage.uploadFile(`${src}/plugins/Custom.jar`, Buffer.from('jar-bytes'), true);
            await serverStorage.uploadFile(`${src}/config/paper-global.yml`, 'proxies:\n  velocity:\n    enabled: true\n', true);
            await serverStorage.uploadFile(`${src}/docker-compose-abc.yml`, 'version: "3.8"\n', true);

            const copiedCount = await copyServerDirectory(src, dst);
            assert.equal(copiedCount, 4);

            assert.equal(await serverStorage.exists(`${dst}/world/level.dat`), true);
            assert.equal(await serverStorage.exists(`${dst}/plugins/Custom.jar`), true);
            assert.equal(await serverStorage.exists(`${dst}/config/paper-global.yml`), true);
            assert.equal(await serverStorage.exists(`${dst}/world/session.lock`), false);
            assert.equal(await serverStorage.exists(`${dst}/docker-compose-abc.yml`), false);
            assert.equal((await serverStorage.getFileContents(`${dst}/world/level.dat`)).toString('utf8'), 'world-bytes');
        });
    } finally {
        await fs.rm(tempStorageRoot, { recursive: true, force: true }).catch(() => undefined);
    }

    if (failures > 0) process.exit(1);
    console.log('All duplicate server checks passed.');
}

void main();
