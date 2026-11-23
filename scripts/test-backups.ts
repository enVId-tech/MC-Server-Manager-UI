#!/usr/bin/env npx tsx

/**
 * Builds a backup zip from a fake server folder and checks that no proxy secret, key or backend setting is in it,
 * and that the backup rules resolve as intended. Run with: npm run test:backups
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

const SECRET = 'S3cretForwardingValue-xyz';
const RCON = 'rconPassw0rd-123';

async function main() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
    process.env.STORAGE_BACKEND = 'local';
    process.env.LOCAL_STORAGE_PATH = root;
    const { createBackupStream, redactKnownSecrets } = await import('../lib/server/backup');
    const { effectivePolicy, cleanPolicy } = await import('../lib/server/backups/settings');

    const server = path.join(root, 'minecraft-servers', 'alex', 'abc');
    const write = async (rel: string, content: string | Buffer) => {
        await fs.mkdir(path.dirname(path.join(server, rel)), { recursive: true });
        await fs.writeFile(path.join(server, rel), content);
    };
    await write('server.properties', `online-mode=false\nrcon.password=${RCON}\nserver-ip=10.0.0.5\nmotd=hello\n`);
    await write('config/paper-global.yml', `proxies:\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: '${SECRET}'\n`);
    await write('spigot.yml', 'settings:\n  bungeecord: true\n');
    await write('forwarding.secret', SECRET);
    await write('plugins/Geyser-Spigot/config.yml', 'auth-key: abc');
    await write('plugins/floodgate/key.pem', 'PRIVATE KEY');
    await write('plugins/SomePlugin/config.yml', `note: pasted by mistake ${SECRET} and ${RCON}\n`);
    await write('plugins/SomePlugin.jar', Buffer.from(`binary ${SECRET}`));
    await write('logs/latest.log', 'player joined from proxy 10.0.0.1');
    await write('world/level.dat', 'world data');
    await write('world/session.lock', 'lock');

    const chunks: Buffer[] = [];
    for await (const chunk of createBackupStream(`/minecraft-servers/alex/abc`, { secrets: [SECRET, RCON] })) chunks.push(Buffer.from(chunk as Buffer));
    const zip = new AdmZip(Buffer.concat(chunks));
    const names = zip.getEntries().map(entry => entry.entryName).sort();
    const text = (name: string) => zip.readAsText(name);

    assert.ok(names.includes('world/level.dat'), 'the world is in the backup');
    assert.ok(names.includes('server.properties'));
    for (const hidden of ['forwarding.secret', 'plugins/Geyser-Spigot/config.yml', 'plugins/floodgate/key.pem', 'logs/latest.log', 'world/session.lock']) {
        assert.ok(!names.includes(hidden), `${hidden} is left out`);
    }
    // No text file holds a secret
    for (const name of names.filter(item => /\.(yml|properties)$/.test(item))) {
        assert.ok(!text(name).includes(SECRET), `${name} has no forwarding secret`);
        assert.ok(!text(name).includes(RCON), `${name} has no rcon password`);
    }
    assert.match(text('server.properties'), /online-mode=true/);
    assert.match(text('server.properties'), /rcon\.password=\n/);
    assert.match(text('server.properties'), /motd=hello/);
    assert.match(text('spigot.yml'), /bungeecord: false/);
    assert.match(text('config/paper-global.yml'), /enabled: false/);
    assert.ok(!text('plugins/SomePlugin/config.yml').includes('pasted by mistake ' + SECRET), 'a secret pasted into a plugin config is blanked');
    assert.match(text('plugins/SomePlugin/config.yml'), /note: pasted by mistake/);
    console.log('  ✓ backup zip holds no proxy secret');

    assert.equal(redactKnownSecrets(Buffer.from('a short'), ['short']).toString(), 'a short', 'short values are not treated as secrets');
    assert.equal(redactKnownSecrets(Buffer.from(`x ${SECRET} y`), [SECRET]).toString(), 'x  y');

    const defaults = { enabled: true, intervalHours: 24, keep: 7 };
    assert.deepEqual(effectivePolicy({}, defaults), { ...defaults, source: 'default' });
    assert.equal(effectivePolicy({ backupPolicy: { mode: 'off' } }, defaults).enabled, false);
    assert.deepEqual(effectivePolicy({ backupPolicy: { mode: 'custom', intervalHours: 6, keep: 3 } }, defaults), { enabled: true, intervalHours: 6, keep: 3, source: 'custom' });
    assert.equal(effectivePolicy({ backupPolicy: { mode: 'custom', intervalHours: 99999, keep: 0 } }, defaults).intervalHours, 720);
    assert.equal(effectivePolicy({ backupPolicy: { mode: 'custom', intervalHours: 99999, keep: 0 } }, defaults).keep, 1);
    assert.equal(cleanPolicy({ mode: 'nope' }), null);
    assert.deepEqual(cleanPolicy({ mode: 'default' }), { mode: 'default' });
    console.log('  ✓ backup rules');

    await fs.rm(root, { recursive: true, force: true });
    console.log('backup tests passed');
}

main().catch(error => { console.error(error); process.exit(1); });
