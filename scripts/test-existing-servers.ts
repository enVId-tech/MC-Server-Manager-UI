#!/usr/bin/env npx tsx

/**
 * Checks that servers next to and inside the storage folder are found. Run with: npm run test:existing-servers
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function main() {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'mms-existing-'));
    const storage = path.join(parent, 'storage');
    const write = async (file: string, text = '') => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };

    // Managed layouts: uuid folder and literal name folder, a server beside the storage folder, a nested one, a proxy
    await write(path.join(storage, 'minecraft-servers', 'alex', 'abc-uuid', 'server.properties'), 'server-port=25570\n');
    await write(path.join(storage, 'minecraft-servers', 'alex', 'Survival', 'server.properties'), 'server-port=25571\n');
    await write(path.join(parent, 'old-survival', 'server.properties'), 'server-port=25572\n');
    await write(path.join(parent, 'old-survival', 'paper-global.yml'), '');
    await write(path.join(parent, 'games', 'creative', 'data', 'server.properties'), 'server-port=25573\n');
    await write(path.join(parent, 'proxy', 'velocity.toml'), '');
    await write(path.join(parent, 'proxy', 'server.properties'), '');
    await write(path.join(parent, 'notes', 'readme.txt'), '');

    process.env.LOCAL_STORAGE_PATH = storage;
    process.env.STORAGE_BACKEND = 'local';
    delete process.env.PROXY_SCAN_PARENT;
    delete process.env.IMPORT_SCAN_PATHS;

    const { scanFolders } = await import('../lib/server/importServers');
    const found = await scanFolders(new Set(['/minecraft-servers/alex/abc-uuid']));
    const names = found.map(candidate => candidate.name).sort();
    console.log('Found:', names.join(', '));
    assert.ok(names.includes('Survival'), 'literal name folder inside the storage');
    assert.ok(names.includes('old-survival'), 'server next to the storage folder');
    assert.ok(names.includes('creative'), 'nested server named after the folder above data');
    assert.ok(!names.includes('abc-uuid'), 'managed folder is skipped');
    assert.ok(!names.includes('proxy'), 'a proxy is not a server');
    assert.equal(found.find(candidate => candidate.name === 'old-survival')?.type, 'paper');

    process.env.PROXY_SCAN_PARENT = 'false';
    const narrow = await scanFolders(new Set());
    assert.ok(!narrow.some(candidate => candidate.name === 'old-survival'), 'parent scan can be switched off');

    await fs.rm(parent, { recursive: true, force: true });
    console.log('All existing server checks passed');
}

main().catch(error => { console.error(error); process.exit(1); });
