#!/usr/bin/env npx tsx

/**
 * Checks world detection, the downgrade rules and the import. Run with: npm run test:world
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import nbt from 'prismarine-nbt';

function levelDat(version?: string, dataVersion?: number, snapshot = false): Buffer {
    const data: Record<string, nbt.Tags[keyof nbt.Tags]> = { LevelName: nbt.string('Test') };
    if (dataVersion !== undefined) data.DataVersion = nbt.int(dataVersion);
    if (version) data.Version = nbt.comp({ Name: nbt.string(version), Snapshot: nbt.byte(snapshot ? 1 : 0) });
    return zlib.gzipSync(nbt.writeUncompressed(nbt.comp({ Data: nbt.comp(data) }) as nbt.NBT, 'big'));
}

async function worldZip(root: string, name: string, files: Record<string, Buffer | string>): Promise<string> {
    const zip = new AdmZip();
    for (const [file, content] of Object.entries(files)) zip.addFile(file, Buffer.isBuffer(content) ? content : Buffer.from(content));
    const target = path.join(root, name);
    zip.writeZip(target);
    return target;
}

async function main() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mms-world-test-'));
    const storage = path.join(root, 'storage');
    await fs.mkdir(path.join(storage, 'srv'), { recursive: true });
    process.env.LOCAL_STORAGE_PATH = storage;
    process.env.STORAGE_BACKEND = 'local';

    const { eraOfVersion, judgeWorld, readLevelDat } = await import('../lib/server/world/analyze');
    const { extractWorldZip, installWorld } = await import('../lib/server/world/install');

    console.log('Eras');
    assert.equal(eraOfVersion('1.16.5'), 'legacy');
    assert.equal(eraOfVersion('1.17'), 'modern');
    assert.equal(eraOfVersion('1.21.4'), 'modern');
    assert.equal(eraOfVersion('26.1'), 'new');
    assert.equal(eraOfVersion('26.1.2'), 'new');
    assert.equal(eraOfVersion('LATEST'), 'new');

    console.log('level.dat');
    const info = await readLevelDat(levelDat('1.20.4', 3700));
    assert.deepEqual([info.versionName, info.dataVersion, info.levelName], ['1.20.4', 3700, 'Test']);

    console.log('Judging');
    const world = (version: string | undefined, era: 'legacy' | 'modern' | 'new', snapshot = false) => ({ found: true, era, versionName: version, snapshot, dataVersion: undefined });
    assert.equal(judgeWorld(world('1.20.1', 'modern'), '1.20.1').status, 'ok');
    assert.equal(judgeWorld(world('1.19.4', 'modern'), '1.20.1').status, 'upgrade');
    assert.equal(judgeWorld(world('1.12.2', 'legacy'), '1.20.1').status, 'upgrade');
    const down = judgeWorld(world('1.20.4', 'modern'), '1.19.2');
    assert.equal(down.status, 'downgrade');
    assert.equal(down.requiresAcknowledgement, true);
    assert.match(down.message, /NOT supported/);
    assert.equal(judgeWorld(world('1.18', 'modern'), '1.16.5').status, 'blocked');
    assert.equal(judgeWorld(world('26.1', 'new'), '1.21.4').status, 'blocked');
    assert.equal(judgeWorld(world('26.1.2', 'new'), '26.1').status, 'downgrade');
    assert.equal(judgeWorld(world('1.21.4', 'modern'), '26.1').status, 'upgrade');
    assert.equal(judgeWorld(world('1.16.5', 'legacy'), '1.12.2').status, 'downgrade');
    assert.equal(judgeWorld(world(undefined, 'legacy'), '1.8.9').status, 'upgrade');
    assert.equal(judgeWorld(world('24w14a', 'modern', true), '1.21').status, 'downgrade');
    assert.equal(judgeWorld({ found: false, snapshot: false }, '1.20.1').status, 'blocked');

    console.log('Installing');
    const files = {
        'My World/level.dat': levelDat('1.20.1', 3465),
        'My World/region/r.0.0.mca': 'chunks',
        'My World/DIM-1/region/r.0.0.mca': 'nether',
        'My World/DIM1/region/r.0.0.mca': 'end',
        'My World/playerdata/a.dat': 'p',
        'My World/evil.jar': 'jar',
        'My World/plugins/x.jar': 'jar',
        '__MACOSX/junk': 'x',
    };
    const zip = await worldZip(root, 'world.zip', files);
    const extracted = await extractWorldZip(zip);
    assert.equal(extracted.info.folder, 'My World');
    assert.equal(extracted.info.era, 'modern');
    assert.ok(extracted.info.hasNether && extracted.info.hasEnd);

    // Vanilla keeps the dimensions inside world/
    const vanilla = await installWorld(extracted, { serverFolder: '/srv', serverType: 'fabric', serverVersion: '1.20.1' });
    assert.equal(vanilla.installed, true, vanilla.error ?? "");
    const has = async (p: string) => fs.access(path.join(storage, 'srv', p)).then(() => true, () => false);
    assert.ok(await has('world/level.dat') && await has('world/DIM-1/region/r.0.0.mca') && await has('world/region/r.0.0.mca'));
    assert.ok(!(await has('world/evil.jar')) && !(await has('world/plugins/x.jar')), 'only world files are copied');

    // A second import keeps the first world in backups
    const paper = await installWorld(extracted, { serverFolder: '/srv', serverType: 'paper', serverVersion: '1.20.4' });
    assert.equal(paper.installed, true, paper.error ?? "");
    assert.ok(paper.previous?.includes('/backups/before-world-import-'));
    assert.ok(await has('world_nether/DIM-1/region/r.0.0.mca') && await has('world_the_end/DIM1/region/r.0.0.mca'));
    assert.ok(!(await has('world/DIM-1')), 'Bukkit servers keep the Nether in its own folder');

    // Downgrade needs the acknowledgement, a blocked version never works
    const refused = await installWorld(extracted, { serverFolder: '/srv2', serverType: 'paper', serverVersion: '1.19.2' });
    assert.equal(refused.installed, false);
    assert.match(refused.error ?? '', /not supported/);
    const accepted = await installWorld(extracted, { serverFolder: '/srv2', serverType: 'paper', serverVersion: '1.19.2', acknowledgeDowngrade: true });
    assert.equal(accepted.installed, true, accepted.error ?? "");
    const blocked = await installWorld(extracted, { serverFolder: '/srv3', serverType: 'paper', serverVersion: '1.16.5', acknowledgeDowngrade: true });
    assert.equal(blocked.installed, false);
    assert.equal(blocked.judgement?.status, 'blocked');
    await extracted.cleanup();

    // Not a world
    const junk = await worldZip(root, 'junk.zip', { 'readme.txt': 'hi' });
    const notWorld = await extractWorldZip(junk);
    assert.equal(notWorld.info.found, false);
    await notWorld.cleanup();

    await fs.rm(root, { recursive: true, force: true });
    console.log('All world checks passed');
}

main().catch(error => { console.error(error); process.exit(1); });
