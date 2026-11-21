#!/usr/bin/env npx tsx

/**
 * Checks that existing proxies are found: next to the storage folder, nested, and of every kind, without
 * mistaking other applications for proxies. Run with: npm run test:proxy-discovery
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BUNGEE = 'ip_forward: true\nlisteners:\n- host: 0.0.0.0:25577\n  motd: x\nservers:\n  lobby:\n    address: lobby:25565\n';

async function write(file: string, content = '') {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
}

async function main() {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-discovery-'));
    const docker = path.join(sandbox, 'docker');
    const storage = path.join(docker, 'minecraft-servers');
    await fs.mkdir(storage, { recursive: true });

    await write(path.join(docker, 'velocity', 'velocity.toml'), 'bind = "0.0.0.0:25577"\n');
    await write(path.join(docker, 'velocity', 'forwarding.secret'), 's');
    await write(path.join(docker, 'mc-proxy', 'config', 'velocity.toml'), 'bind = "0.0.0.0:25565"\n');
    await write(path.join(docker, 'bungee', 'config.yml'), BUNGEE);
    await write(path.join(docker, 'bungee', 'modules.yml'), 'modules: []');
    await write(path.join(docker, 'water', 'config.yml'), BUNGEE);
    await write(path.join(docker, 'water', 'waterfall.yml'), 'x: 1');
    await write(path.join(docker, 'jarproxy', 'config.yml'), BUNGEE.replace('ip_forward: true\n', ''));
    await write(path.join(docker, 'jarproxy', 'BungeeCord.jar'), 'jar');
    await write(path.join(docker, 'plex', 'config.yml'), 'server:\n  name: plex\n');
    await write(path.join(docker, 'gameserver', 'config.yml'), 'listeners:\n- a\nservers:\n- b\n');
    await write(path.join(storage, 'alex', 'abc', 'server.properties'), 'motd=x');
    await write(path.join(storage, 'alex', 'abc', 'velocity.toml'), 'bind = "0.0.0.0:25577"\n');

    process.env.STORAGE_BACKEND = 'local';
    process.env.LOCAL_STORAGE_PATH = storage;
    const { scanForProxies } = await import('../lib/server/network/discovery');

    console.log('With the folder above the storage folder');
    const found = await scanForProxies(undefined, { force: true });
    const byPath = new Map(found.map(finding => [finding.configPath.replace(docker, ''), finding]));
    const kinds = Object.fromEntries([...byPath].map(([key, finding]) => [key, finding.kind]));
    assert.equal(kinds['/velocity/velocity.toml'], 'velocity');
    assert.equal(kinds['/mc-proxy/config/velocity.toml'], 'velocity');
    assert.equal(kinds['/bungee/config.yml'], 'bungeecord');
    assert.equal(kinds['/water/config.yml'], 'waterfall');
    assert.equal(kinds['/jarproxy/config.yml'], 'bungeecord');
    assert.equal('/plex/config.yml' in kinds, false);
    assert.equal('/gameserver/config.yml' in kinds, false, 'listeners and servers alone are not enough');
    assert.ok(byPath.get('/velocity/velocity.toml')?.evidence.includes('forwarding.secret'));
    console.log('  ✓ Velocity, nested itzg layout, BungeeCord and Waterfall are found; other apps are not');

    console.log('Without it');
    process.env.PROXY_SCAN_PARENT = 'false';
    const narrow = await scanForProxies(undefined, { force: true });
    assert.equal(narrow.some(finding => finding.configPath.includes('/velocity/velocity.toml')), false);
    assert.equal(narrow.some(finding => finding.configPath.endsWith('/abc/velocity.toml')), true, 'the storage folder is still searched');
    console.log('  ✓ PROXY_SCAN_PARENT=false limits the search to the storage folder');

    await fs.rm(sandbox, { recursive: true, force: true });
    console.log('\nAll proxy discovery checks passed.');
}

main().catch(error => { console.error(error); process.exit(1); });
