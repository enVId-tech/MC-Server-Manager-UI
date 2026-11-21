/**
 * Checks that servers and a Velocity proxy in other folders are found and reachable, and that those folders stay
 * confined. No database or Docker is needed.
 *
 * Run with: npm run test:import-paths
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function main() {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'import-paths-'));
    const storageRoot = path.join(sandbox, 'storage');
    const external = path.join(sandbox, 'external');
    const outside = path.join(sandbox, 'outside');

    await fs.mkdir(path.join(external, 'survival', 'world'), { recursive: true });
    await fs.mkdir(path.join(external, 'proxy'), { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(external, 'survival', 'server.properties'), 'server-port=25570\n');
    await fs.writeFile(path.join(external, 'proxy', 'velocity.toml'), 'bind = "0.0.0.0:25565"\n[servers]\nlobby = "lobby:25565"\ntry = ["lobby"]\n[forced-hosts]\n');
    await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');

    process.env.STORAGE_BACKEND = 'local';
    process.env.LOCAL_STORAGE_PATH = storageRoot;
    process.env.LOCAL_STORAGE_HOST_PATH = '/mnt/ssd/minecraft';
    process.env.IMPORT_SCAN_PATHS = `${external}=/mnt/ssd/docker/imported`;
    delete process.env.VELOCITY_CONFIG_PATH;
    // This test is about the escape protections of the folders it names, not about the folder above the storage folder
    process.env.PROXY_SCAN_PARENT = 'false';

    const paths = await import('../lib/server/importPaths');
    const { default: storage } = await import('../lib/server/storage');
    const { discoverVelocityInstances, clearVelocityDiscoveryCache } = await import('../lib/server/velocityDiscovery');
    const { default: velocity } = await import('../lib/server/velocity');

    console.log('Path mapping');
    assert.deepEqual(paths.getImportRoots(), [{ appPath: external, hostPath: '/mnt/ssd/docker/imported' }]);
    assert.equal(paths.hostPathToAppPath('/mnt/ssd/docker/imported/survival'), `${external}/survival`);
    assert.equal(paths.hostPathToAppPath('/mnt/ssd/minecraft/minecraft-servers/alex/abc'), '/minecraft-servers/alex/abc');
    assert.equal(paths.hostPathToAppPath('/somewhere/else'), null);
    assert.equal(paths.appPathToHostPath(`${external}/survival`), '/mnt/ssd/docker/imported/survival');
    assert.equal(paths.appPathToHostPath('/minecraft-servers/alex/abc'), '/mnt/ssd/minecraft/minecraft-servers/alex/abc');
    console.log('  ✓ host paths and app paths translate both ways');

    console.log('Storage in another folder');
    assert.equal((await storage.getFileContents(`${external}/survival/server.properties`)).toString(), 'server-port=25570\n');
    await storage.uploadFile(`${external}/survival/ops.json`, '[]');
    assert.equal(await fs.readFile(path.join(external, 'survival', 'ops.json'), 'utf8'), '[]');
    const listing = await storage.getDirectoryContents(`${external}/survival`);
    assert.ok(listing.some(entry => entry.basename === 'server.properties'));
    assert.ok(listing.every(entry => entry.filename.startsWith(`${external}/survival/`)));
    console.log('  ✓ files of an imported folder can be listed, read and written');

    await assert.rejects(() => storage.deleteFile(external), /Refusing|outside/);
    await fs.symlink(outside, path.join(external, 'survival', 'escape'));
    await assert.rejects(() => storage.getFileContents(`${external}/survival/escape/secret.txt`), /outside/i);
    await assert.rejects(() => storage.getFileContents(`${outside}/secret.txt`));
    console.log('  ✓ the folder itself is protected and links out of it are refused');

    console.log('Velocity discovery');
    clearVelocityDiscoveryCache();
    const instances = await discoverVelocityInstances({ force: true });
    assert.equal(instances[0]?.configPath, `${external}/proxy/velocity.toml`);
    assert.equal(instances[0]?.source, 'scan');
    console.log('  ✓ an existing velocity.toml in an import folder is found');

    assert.equal(await velocity.resolveConfigPath(), `${external}/proxy/velocity.toml`);
    assert.equal(await velocity.resolveConfigPath('/does/not/exist/velocity.toml'), `${external}/proxy/velocity.toml`);
    const config = await velocity.readVelocityConfig();
    assert.deepEqual(config.servers.lobby, { address: 'lobby:25565' });
    console.log('  ✓ reads go to the existing instance even when another path is given');

    const result = await velocity.configureServerForVelocity(
        { serverId: 'abc', serverName: 'survival', address: 'erick-survival:25565', port: 25565, playerInfoForwardingMode: 'legacy', forwardingSecret: 'x' },
        'alex@example.com',
        'abc',
        '/minecraft/velocity-test/velocity/velocity.toml',
        undefined,
        `${external}/survival`
    );
    assert.equal(result.success, true, result.error ?? 'configuring Velocity failed');
    const written = await fs.readFile(path.join(external, 'proxy', 'velocity.toml'), 'utf8');
    assert.match(written, /survival\s*=\s*"erick-survival:25565"/);
    await assert.rejects(() => fs.access(path.join(storageRoot, 'minecraft')), 'no second velocity.toml may be created');
    console.log('  ✓ a new server is added to the existing velocity.toml, and no second one is created');

    process.env.VELOCITY_CONFIG_PATH = `${external}/proxy/velocity.toml`;
    clearVelocityDiscoveryCache();
    assert.equal((await discoverVelocityInstances({ force: true }))[0]?.source, 'env');
    console.log('  ✓ VELOCITY_CONFIG_PATH takes priority');

    await fs.rm(sandbox, { recursive: true, force: true });
    console.log('\nAll import path checks passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
