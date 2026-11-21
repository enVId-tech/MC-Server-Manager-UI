#!/usr/bin/env npx tsx

/**
 * Checks what ordinary users may see and what goes into a downloaded backup. Run with: npm run test:access
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';
import { LocalStorage } from '../lib/server/storage/local';
import {
    canUseFiles, cleanRelativePath, dropLocked, getFileAccess, isHiddenFromUsers, protectServerProperties,
    redactServerProperties, sanitizeForBackup, MANAGEMENT_LOCKED_PROPERTIES,
} from '../lib/server/accessPolicy';

async function main() {
    console.log('Hidden paths');
    for (const hidden of ['/forwarding.secret', '/config/paper-global.yml', '/plugins/Geyser-Spigot.jar', '/plugins/floodgate/key.pem', '/plugins/BungeeGuard/config.yml', '/plugins/Geyser-Spigot/config.yml', '/KEY.PEM']) {
        assert.equal(isHiddenFromUsers(hidden), true, hidden);
    }
    for (const visible of ['/server.properties', '/plugins/EssentialsX.jar', '/world/level.dat', '/geyser-notes.txt', '/plugins/ViaVersion.jar']) {
        assert.equal(isHiddenFromUsers(visible), false, visible);
    }
    console.log('  ✓ proxy files are hidden, ordinary files are not');

    assert.equal(cleanRelativePath('/a/../b'), null);
    assert.equal(cleanRelativePath('a//b/./c'), '/a/b/c');
    assert.equal(cleanRelativePath('\\x\\y'), '/x/y');
    console.log('  ✓ paths cannot climb out of the server folder');

    console.log('File toggles');
    const user = { isAdmin: false };
    const admin = { isAdmin: true };
    const off = { serverConfig: {} } as never;
    const on = { serverConfig: { fileAccess: { uploads: true, editing: false } } } as never;
    assert.equal(canUseFiles(user, off, 'read'), true);
    assert.equal(canUseFiles(user, off, 'upload'), false);
    assert.equal(canUseFiles(user, off, 'edit'), false);
    assert.equal(canUseFiles(user, on, 'upload'), true);
    assert.equal(canUseFiles(user, on, 'edit'), false);
    assert.equal(canUseFiles(admin, off, 'edit'), true);
    assert.deepEqual(getFileAccess(off), { uploads: false, editing: false });
    console.log('  ✓ uploads and editing are off by default and toggle separately');

    console.log('server.properties');
    const existing = 'motd=Hi\nonline-mode=false\nrcon.password=hunter2\nserver-port=25570\n';
    assert.equal(redactServerProperties(existing).includes('hunter2'), false);
    const edited = 'motd=Changed\nonline-mode=true\nserver-port=1234\nrcon.password=\nnew-key=1\n';
    const merged = protectServerProperties(existing, edited);
    assert.match(merged, /motd=Changed/);
    assert.match(merged, /online-mode=false/);
    assert.match(merged, /server-port=25570/);
    assert.match(merged, /rcon\.password=hunter2/);
    assert.match(merged, /new-key=1/);
    assert.equal(dropLocked({ 'online-mode': 'x', motd: 'y' }, MANAGEMENT_LOCKED_PROPERTIES).dropped[0], 'online-mode');
    console.log('  ✓ locked lines survive a user edit');

    console.log('Backup');
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'access-test-'));
    try {
        const storage = new LocalStorage(path.join(sandbox, 'root'));
        const base = '/minecraft-servers/alex/abc';
        const files: Record<string, string> = {
            'server.properties': 'online-mode=false\nrcon.password=hunter2\nmotd=x\n',
            'forwarding.secret': 'SECRET',
            'config/paper-global.yml': 'proxies:\n  velocity:\n    enabled: true\n    secret: topsecret\n',
            'spigot.yml': 'settings:\n  bungeecord: true\n',
            'plugins/Geyser-Spigot.jar': 'jar',
            'plugins/floodgate/key.pem': 'KEY',
            'plugins/EssentialsX.jar': 'ess',
            'world/level.dat': 'level',
            'logs/latest.log': 'proxy ip 1.2.3.4',
        };
        for (const [name, content] of Object.entries(files)) {
            await storage.createDirectory(`${base}/${path.posix.dirname(name)}`).catch(() => undefined);
            await storage.uploadFile(`${base}/${name}`, content);
        }

        process.env.LOCAL_STORAGE_PATH = path.join(sandbox, 'root');
        process.env.STORAGE_BACKEND = 'local';
        const { createBackupStream } = await import('../lib/server/backup');
        const chunks: Buffer[] = [];
        for await (const chunk of createBackupStream(base) as Readable) chunks.push(chunk as Buffer);
        const zip = new AdmZip(Buffer.concat(chunks));
        const names = zip.getEntries().map(entry => entry.entryName).sort();
        assert.deepEqual(names, ['config/paper-global.yml', 'plugins/EssentialsX.jar', 'server.properties', 'spigot.yml', 'world/level.dat']);
        const read = (name: string) => zip.readAsText(name);
        assert.equal(read('config/paper-global.yml').includes('topsecret'), false);
        assert.match(read('config/paper-global.yml'), /enabled: false/);
        assert.match(read('spigot.yml'), /bungeecord: false/);
        assert.match(read('server.properties'), /online-mode=true/);
        assert.equal(read('server.properties').includes('hunter2'), false);
        console.log('  ✓ the zip has no secrets, no Geyser, no keys, no logs, and works on its own');

        assert.equal(sanitizeForBackup('/plugins/x.jar', Buffer.from('a')), undefined);
        assert.equal(sanitizeForBackup('/forwarding.secret', Buffer.from('a')), null);
    } finally {
        await fs.rm(sandbox, { recursive: true, force: true });
    }

    console.log('\nAll access checks passed.');
}

main().catch(error => { console.error(error); process.exit(1); });
