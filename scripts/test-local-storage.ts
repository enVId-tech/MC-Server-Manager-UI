#!/usr/bin/env npx tsx

/**
 * Exercises the local storage backend against a temporary folder, including the checks that keep
 * every operation inside the storage root. Run with: npm run test:local-storage
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalStorage, parseOwner } from '../lib/server/storage/local';

async function expectRejects(label: string, action: () => Promise<unknown>, pattern?: RegExp) {
    try {
        await action();
    } catch (error) {
        if (pattern) assert.match((error as Error).message, pattern, label);
        console.log(`  ✓ ${label}`);
        return;
    }
    assert.fail(`${label}: expected the call to be rejected`);
}

async function main() {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'local-storage-test-'));
    const root = path.join(sandbox, 'root');
    const outside = path.join(sandbox, 'outside');
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, 'secret.txt'), 'top secret');

    const storage = new LocalStorage(root);
    const serverDir = '/minecraft-servers/alex/abc123';

    try {
        console.log('Basic operations');
        await storage.createDirectory(serverDir);
        assert.equal(await storage.exists(serverDir), true);
        assert.equal(await storage.exists('/'), true);
        assert.equal(await storage.exists(`${serverDir}/missing.txt`), false);

        await storage.uploadFile(`${serverDir}/server.properties`, 'motd=hello\n');
        assert.equal((await storage.getFileContents(`${serverDir}/server.properties`)).toString(), 'motd=hello\n');
        await storage.uploadFile(`${serverDir}/server.properties`, Buffer.from('motd=changed\n'));
        assert.equal((await storage.getFileContents(`${serverDir}/server.properties`)).toString(), 'motd=changed\n');
        console.log('  ✓ create, upload, overwrite, read, exists');

        await storage.uploadFile(`${serverDir}/plugins/README.md`, '# plugins');
        const listing = await storage.getDirectoryContents(serverDir);
        assert.deepEqual(listing.map(e => [e.basename, e.type, e.filename]).sort(), [
            ['plugins', 'directory', `${serverDir}/plugins`],
            ['server.properties', 'file', `${serverDir}/server.properties`],
        ]);
        assert.equal(listing.find(e => e.basename === 'server.properties')?.size, 13);
        assert.ok(!Number.isNaN(new Date(listing[0].lastmod).getTime()));
        const leftovers = (await fs.readdir(path.join(root, serverDir))).filter(name => name.endsWith('.tmp'));
        assert.deepEqual(leftovers, [], 'no temp files should remain after uploads');
        console.log('  ✓ listing uses virtual paths and leaves no temp files');

        const mode = (await fs.stat(path.join(root, serverDir, 'server.properties'))).mode & 0o777;
        assert.equal(mode, 0o644);
        console.log('  ✓ files are created with 0644');

        await storage.moveDirectory(serverDir, '/minecraft-servers/alex/DELETED_abc123');
        assert.equal(await storage.exists(serverDir), false);
        assert.equal(await storage.exists('/minecraft-servers/alex/DELETED_abc123/server.properties'), true);
        await storage.moveFile('/minecraft-servers/alex/DELETED_abc123/server.properties', '/minecraft-servers/alex/DELETED_abc123/old.properties');
        console.log('  ✓ move directory and file');

        await storage.deleteFile('/minecraft-servers/alex/DELETED_abc123/old.properties');
        await storage.deleteDirectoryRecursively('/minecraft-servers/alex/DELETED_abc123');
        assert.equal(await storage.exists('/minecraft-servers/alex/DELETED_abc123'), false);
        console.log('  ✓ delete file and directory tree');

        await expectRejects('reading a missing file reports not found', () => storage.getFileContents('/nope.txt'), /Not found: \/nope\.txt/);
        await expectRejects('listing a missing folder reports not found', () => storage.getDirectoryContents('/nope'), /Not found/);

        console.log('Containment');
        await expectRejects('.. segments are refused', () => storage.getFileContents('/minecraft-servers/../../outside/secret.txt'), /traversal/i);
        await expectRejects('.. in uploads is refused', () => storage.uploadFile('/a/../../evil.txt', 'x'), /traversal/i);
        await expectRejects('NUL bytes are refused', () => storage.exists('/a\0b'), /Invalid path/);
        await expectRejects('the root can not be deleted', () => storage.deleteFile('/'));
        await expectRejects('the root can not be moved', () => storage.moveFile('/', '/elsewhere'));
        assert.equal((await fs.stat(root)).isDirectory(), true);

        await storage.createDirectory('/links');
        await fs.symlink(outside, path.join(root, 'links', 'escape'));
        await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'links', 'secret-link.txt'));
        await expectRejects('reading through a symlinked folder is refused', () => storage.getFileContents('/links/escape/secret.txt'), /outside/i);
        await expectRejects('reading a symlinked file is refused', () => storage.getFileContents('/links/secret-link.txt'), /outside/i);
        await expectRejects('writing through a symlinked folder is refused', () => storage.uploadFile('/links/escape/pwned.txt', 'x'), /outside/i);
        await expectRejects('creating folders through a symlink is refused', () => storage.createDirectory('/links/escape/new/deep'), /outside/i);
        await expectRejects('listing a symlinked folder is refused', () => storage.getDirectoryContents('/links/escape'), /outside/i);
        await assert.rejects(fs.stat(path.join(outside, 'pwned.txt')));
        await assert.rejects(fs.stat(path.join(outside, 'new')));

        const visible = (await storage.getDirectoryContents('/links')).map(e => e.basename);
        assert.deepEqual(visible, [], 'links that leave the root are hidden from listings');
        console.log('  ✓ escaping links are hidden from listings');

        // Replacing or deleting a link must only touch the link, never its target
        await storage.uploadFile('/links/secret-link.txt', 'replaced');
        assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'top secret');
        assert.equal((await storage.getFileContents('/links/secret-link.txt')).toString(), 'replaced');
        await storage.deleteFile('/links/escape');
        assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'top secret');
        assert.equal(await storage.exists('/links/escape'), false);
        console.log('  ✓ replacing or deleting a link never touches its target');

        // Links that stay inside the root keep working
        await storage.uploadFile('/real/data.txt', 'inside');
        await fs.symlink(path.join(root, 'real'), path.join(root, 'alias'));
        assert.equal((await storage.getFileContents('/alias/data.txt')).toString(), 'inside');
        console.log('  ✓ links that stay inside the root still work');

        console.log('Ownership');
        assert.deepEqual(parseOwner('1000:1000'), { uid: 1000, gid: 1000 });
        assert.equal(parseOwner('  '), undefined);
        assert.throws(() => parseOwner('root'), /LOCAL_STORAGE_OWNER/);
        if (process.getuid?.() === 0) {
            const owned = new LocalStorage(path.join(sandbox, 'owned-root'), { owner: { uid: 1000, gid: 1000 } });
            await owned.uploadFile('/minecraft-servers/alex/abc/server.properties', 'x');
            for (const relative of ['minecraft-servers', 'minecraft-servers/alex/abc', 'minecraft-servers/alex/abc/server.properties']) {
                const stats = await fs.stat(path.join(sandbox, 'owned-root', relative));
                assert.deepEqual([stats.uid, stats.gid], [1000, 1000], `${relative} should belong to 1000:1000`);
            }
            console.log('  ✓ created folders and files belong to the configured owner');
        } else {
            console.log('  - skipped chown check (needs root)');
        }

        console.log('Configuration');
        assert.throws(() => new LocalStorage('relative/path'), /absolute/);
        assert.throws(() => new LocalStorage('/'), /filesystem root/);
        console.log('  ✓ unsafe roots are rejected');

        console.log('\nAll local storage checks passed.');
    } finally {
        await fs.rm(sandbox, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error('\n❌ Local storage test failed:', error);
    process.exit(1);
});
