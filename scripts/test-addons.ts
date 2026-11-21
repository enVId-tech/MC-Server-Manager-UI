#!/usr/bin/env npx tsx

/**
 * Checks link recognition, jar inspection and the rule that private hosts are never contacted.
 * Run with: npm run test:addons
 */
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { identifyLink, loadersFor } from '../lib/server/addons/sources';
import { inspectJar } from '../lib/server/addons/jar';
import { assertPublicUrl, isPrivateAddress } from '../lib/server/addons/net';

function jar(files: Record<string, string>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
    return zip.toBuffer();
}

async function main() {
    // Links
    assert.deepEqual(identifyLink('https://modrinth.com/plugin/luckperms'), { source: 'modrinth', ref: 'luckperms', url: 'https://modrinth.com/plugin/luckperms' });
    assert.equal(identifyLink('https://modrinth.com/mod/fabric-api/versions')?.ref, 'fabric-api');
    assert.equal(identifyLink('https://www.spigotmc.org/resources/essentialsx.9089/')?.ref, '9089');
    assert.equal(identifyLink('https://dev.bukkit.org/projects/worldedit')?.source, 'bukkit');
    assert.equal(identifyLink('https://www.curseforge.com/minecraft/mc-mods/jei')?.ref, 'jei');
    assert.equal(identifyLink('https://example.org/files/x.jar')?.source, 'other');
    assert.equal(identifyLink('not a link'), null);
    assert.equal(identifyLink('ftp://modrinth.com/mod/x'), null);

    // Loaders by server type
    assert.deepEqual(loadersFor('FABRIC', 'mod'), ['fabric']);
    assert.ok(loadersFor('PAPER', 'plugin').includes('paper'));
    assert.deepEqual(loadersFor('FORGE', 'mod'), ['forge']);

    // Jars
    const plugin = inspectJar(jar({ 'plugin.yml': 'name: Demo\nversion: 1.2\nmain: a.B\n' }));
    assert.equal(plugin?.kind, 'plugin');
    assert.equal(plugin?.name, 'Demo');
    const fabric = inspectJar(jar({ 'fabric.mod.json': JSON.stringify({ id: 'demo', name: 'Demo Mod', version: '3' }) }));
    assert.equal(fabric?.kind, 'mod');
    assert.equal(fabric?.platform, 'fabric');
    const velocity = inspectJar(jar({ 'velocity-plugin.json': JSON.stringify({ id: 'v', name: 'V', version: '1' }) }));
    assert.equal(velocity?.platform, 'velocity');
    assert.equal(inspectJar(Buffer.from('hello world')), null);
    assert.equal(inspectJar(jar({ 'readme.txt': 'x' })), null);

    // Private hosts
    for (const address of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1']) {
        assert.equal(isPrivateAddress(address), true, address);
    }
    assert.equal(isPrivateAddress('8.8.8.8'), false);
    await assert.rejects(() => assertPublicUrl('http://127.0.0.1/x.jar'));
    await assert.rejects(() => assertPublicUrl('http://localhost/x.jar'));
    await assert.rejects(() => assertPublicUrl('file:///etc/passwd'));

    console.log('Add-on tests passed.');
}

main().catch(error => { console.error(error); process.exit(1); });
