#!/usr/bin/env npx tsx

/**
 * Checks link recognition, jar inspection, compatibility warnings, server-added addon discovery (e.g. ViaVersion),
 * update comparison, and the rule that private hosts are never contacted.
 * Run with: npm run test:addons
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

const tempStorageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-addons-test-'));
process.env.STORAGE_BACKEND = 'local';
process.env.LOCAL_STORAGE_PATH = tempStorageRoot;

const {
    buildSearchQueries,
    evaluateVersionCompatibility,
    identifyLink,
    isExactMcVersionMatch,
    loadersFor,
    normalizeMcVersionTag,
} = await import('../lib/server/addons/sources');
const { inspectJar } = await import('../lib/server/addons/jar');
const { assertPublicUrl, isPrivateAddress } = await import('../lib/server/addons/net');
const { checkAddonCompatibility } = await import('../lib/server/addons/compatibility');
const {
    applyStagedAddons,
    extractVersionFromFilename,
    isNewerVersionAvailable,
    switchAddonSource,
    syncDiscoveredServerAddons,
} = await import('../lib/server/addons/manager');
const { default: serverStorage } = await import('../lib/server/storage');
const { default: Server } = await import('../lib/objects/Server');

function jar(files: Record<string, string>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
    return zip.toBuffer();
}

async function main() {
    try {
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

        // Compatibility warnings (mod on plugin-only server, plugin on mod-only server, loader mismatch)
        const modOnPaper = checkAddonCompatibility(
            { name: 'Sodium', source: 'modrinth', kinds: ['mod'], loaders: ['fabric', 'quilt'] },
            { plugins: true, mods: false, type: 'PAPER', typeName: 'Paper' }
        );
        assert.ok(modOnPaper && /mod/i.test(modOnPaper) && /no plugin version/i.test(modOnPaper));

        const pluginOnFabric = checkAddonCompatibility(
            { name: 'EssentialsX', source: 'modrinth', kinds: ['plugin'], loaders: ['paper', 'spigot'] },
            { plugins: false, mods: true, type: 'FABRIC', typeName: 'Fabric' }
        );
        assert.ok(pluginOnFabric && /plugin/i.test(pluginOnFabric) && /no mod version/i.test(pluginOnFabric));

        const dualOnPaper = checkAddonCompatibility(
            { name: 'ViaVersion', source: 'modrinth', kinds: ['plugin', 'mod'], loaders: ['paper', 'fabric'] },
            { plugins: true, mods: false, type: 'PAPER', typeName: 'Paper' }
        );
        assert.equal(dualOnPaper, null);

        const forgeOnFabric = checkAddonCompatibility(
            { name: 'SomeForgeMod', source: 'modrinth', kinds: ['mod'], loaders: ['forge'] },
            { plugins: false, mods: true, type: 'FABRIC', typeName: 'Fabric' }
        );
        assert.ok(forgeOnFabric && /forge/i.test(forgeOnFabric));

        // Update comparison & server-added ViaVersion discovery
        assert.equal(extractVersionFromFilename('ViaVersion-5.2.0.jar'), '5.2.0');
        assert.equal(
            isNewerVersionAvailable({ version: '5.2.0' }, { versionId: 'v530', version: '5.3.0' }),
            true
        );
        assert.equal(
            isNewerVersionAvailable({ version: '5.2.0' }, { versionId: 'v520', version: 'v5.2.0' }),
            false
        );
        assert.equal(
            isNewerVersionAvailable(
                { version: '5.2.0', versionId: 'id-1', staged: { versionId: 'id-2', file: 'plugins/update/ViaVersion.jar' } },
                { versionId: 'id-2', version: '5.3.0' }
            ),
            false
        );

        const folder = '/minecraft-servers/tester/addon-srv';
        await serverStorage.createDirectory(`${folder}/plugins`);
        await serverStorage.uploadFile(
            `${folder}/plugins/ViaVersion-5.2.0.jar`,
            jar({ 'plugin.yml': 'name: ViaVersion\nversion: 5.2.0\nmain: com.viaversion.ViaVersionPlugin\n' }),
            true
        );

        const origUpdateOne = Server.updateOne;
        (Server as unknown as { updateOne: unknown }).updateOne = async () => ({ acknowledged: true });
        try {
            const fakeServer = {
                _id: 'srv-1',
                uniqueId: 'srv-1',
                email: 'tester@example.com',
                folderPath: folder,
                addons: [],
                serverConfig: { serverType: 'PAPER', version: '1.21.4' },
            } as unknown as Parameters<typeof syncDiscoveredServerAddons>[0];

            const discovered = await syncDiscoveredServerAddons(fakeServer, { skipRemoteMatch: true });
            assert.equal(discovered.length, 1);
            assert.equal(discovered[0].ref, 'viaversion');
            assert.equal(discovered[0].source, 'modrinth');
            assert.equal(discovered[0].installedByServer, true);
            assert.equal(discovered[0].version, '5.2.0');

            // Arbitrary pre-existing/manual plugins and mods are discovered too (not only KNOWN_SERVER_ADDONS)
            await serverStorage.uploadFile(
                `${folder}/plugins/CustomClaimer-2.4.1.jar`,
                jar({ 'plugin.yml': 'name: CustomClaimer\nversion: 2.4.1\nmain: com.example.CustomClaimer\n' }),
                true
            );
            await serverStorage.createDirectory(`${folder}/mods`);
            await serverStorage.uploadFile(
                `${folder}/mods/CustomSodium-0.6.0.jar`,
                jar({ 'fabric.mod.json': JSON.stringify({ id: 'sodium', name: 'Sodium', version: '0.6.0' }) }),
                true
            );
            const allDiscovered = await syncDiscoveredServerAddons(fakeServer, { skipRemoteMatch: true });
            assert.equal(allDiscovered.length, 3);
            const customPlugin = allDiscovered.find(a => a.name === 'CustomClaimer');
            const customMod = allDiscovered.find(a => a.name === 'Sodium');
            assert.ok(customPlugin && customPlugin.source === 'discovered' && customPlugin.version === '2.4.1');
            assert.ok(customMod && customMod.kind === 'mod' && customMod.source === 'discovered' && customMod.version === '0.6.0');

            // Removing a jar from disk prunes its stale non-staged record cleanly
            await serverStorage.deleteFile(`${folder}/plugins/CustomClaimer-2.4.1.jar`);
            const afterPrune = await syncDiscoveredServerAddons(fakeServer, { skipRemoteMatch: true });
            assert.equal(afterPrune.some(a => a.name === 'CustomClaimer'), false);

            // Source switching between matched known sources and local-only
            const multiSourceServer = {
                _id: 'srv-src',
                uniqueId: 'srv-src',
                email: 'tester@example.com',
                folderPath: folder,
                addons: [{
                    id: 'vv-id',
                    kind: 'plugin',
                    origin: 'existing',
                    source: 'modrinth',
                    ref: 'viaversion',
                    url: 'https://modrinth.com/plugin/viaversion',
                    name: 'ViaVersion',
                    file: 'plugins/ViaVersion-5.2.0.jar',
                    version: '5.2.0',
                    versionId: 'mr-1',
                    auto: true,
                    matchedSources: [
                        { source: 'modrinth', ref: 'viaversion', url: 'https://modrinth.com/plugin/viaversion', name: 'ViaVersion', downloadable: true, kinds: ['plugin'] },
                        { source: 'spigot', ref: '19254', url: 'https://www.spigotmc.org/resources/19254/', name: 'ViaVersion', downloadable: true, kinds: ['plugin'] },
                    ],
                    addedAt: new Date(),
                }],
                serverConfig: { serverType: 'PAPER', version: '1.21.4' },
            } as unknown as Parameters<typeof switchAddonSource>[0];

            const switchedToSpigot = await switchAddonSource(multiSourceServer, 'vv-id', { source: 'spigot', ref: '19254' });
            assert.equal(switchedToSpigot.source, 'spigot');
            assert.equal(switchedToSpigot.ref, '19254');
            assert.equal(switchedToSpigot.versionId, undefined);
            assert.equal(switchedToSpigot.version, '5.2.0');

            const switchedLocal = await switchAddonSource(multiSourceServer, 'vv-id', { source: 'local' });
            assert.equal(switchedLocal.source, 'discovered');
            assert.equal(switchedLocal.auto, false);

            // Staged plugin update creates new versioned file and deletes old plugin version cleanly on applyStagedAddons
            const stagedJar = jar({ 'plugin.yml': 'name: ViaVersion\nversion: 5.3.0\nmain: com.viaversion.ViaVersionPlugin\n' });
            await serverStorage.createDirectory(`${folder}/.mms/staged`);
            await serverStorage.uploadFile(`${folder}/.mms/staged/ViaVersion-5.3.0.jar`, stagedJar, true);

            const stagedServer = {
                _id: 'srv-1',
                uniqueId: 'srv-1',
                email: 'tester@example.com',
                folderPath: folder,
                addons: [{
                    ...discovered[0],
                    staged: {
                        versionId: 'v530',
                        version: '5.3.0',
                        file: '.mms/staged/ViaVersion-5.3.0.jar',
                        targetFile: 'plugins/ViaVersion-5.3.0.jar',
                    },
                }],
                serverConfig: { serverType: 'PAPER', version: '1.21.4' },
            } as unknown as Parameters<typeof applyStagedAddons>[0];

            const appliedCount = await applyStagedAddons(stagedServer);
            assert.equal(appliedCount, 1);
            assert.equal(await serverStorage.exists(`${folder}/plugins/ViaVersion-5.3.0.jar`), true);
            assert.equal(await serverStorage.exists(`${folder}/plugins/ViaVersion-5.2.0.jar`), false);
            assert.equal(await serverStorage.exists(`${folder}/.mms/staged/ViaVersion-5.3.0.jar`), false);
            assert.equal((stagedServer.addons as Array<{ file: string; version?: string; staged?: unknown }>)[0].file, 'plugins/ViaVersion-5.3.0.jar');
            assert.equal((stagedServer.addons as Array<{ file: string; version?: string; staged?: unknown }>)[0].version, '5.3.0');
            assert.equal((stagedServer.addons as Array<{ staged?: unknown }>)[0].staged, undefined);
        } finally {
            (Server as unknown as { updateOne: unknown }).updateOne = origUpdateOne;
        }

        // Strict 1:1 version checks for mods vs cross-version flexibility for plugins
        assert.equal(normalizeMcVersionTag('1.21.0'), '1.21');
        assert.equal(isExactMcVersionMatch('1.21.4', ['1.21.3', '1.21.4']), true);
        assert.equal(isExactMcVersionMatch('1.21', ['1.21.0']), true);
        assert.equal(isExactMcVersionMatch('1.21.4', ['1.21.1', '1.21.5']), false);

        assert.equal(
            evaluateVersionCompatibility(
                { gameVersions: ['1.21.4'], loaders: ['fabric'] },
                { kind: 'mod', loaders: ['fabric'], mcVersion: '1.21.4' }
            ).compatible,
            true
        );
        assert.equal(
            evaluateVersionCompatibility(
                { gameVersions: ['1.21.1'], loaders: ['fabric'] },
                { kind: 'mod', loaders: ['fabric'], mcVersion: '1.21.4' }
            ).compatible,
            false
        );
        assert.equal(
            evaluateVersionCompatibility(
                { gameVersions: ['1.21.4'], loaders: ['forge'] },
                { kind: 'mod', loaders: ['fabric'], mcVersion: '1.21.4' }
            ).compatible,
            false
        );
        // Plugins allow cross-version compatibility on Paper/Spigot
        const crossPlugin = evaluateVersionCompatibility(
            { gameVersions: ['1.20.4'], loaders: ['paper', 'spigot'] },
            { kind: 'plugin', loaders: ['paper', 'spigot', 'bukkit'], mcVersion: '1.21.4' }
        );
        assert.equal(crossPlugin.compatible, true);
        assert.ok(crossPlugin.note);

        // Search query cleaning for jar filenames
        assert.deepEqual(buildSearchQueries({ name: 'EssentialsX', filename: 'EssentialsX-2.20.1.jar' }), ['EssentialsX']);
        assert.deepEqual(buildSearchQueries({ filename: 'BlueMap-5.29-paper.jar' }), ['BlueMap']);

        // Private hosts
        for (const address of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1']) {
            assert.equal(isPrivateAddress(address), true, address);
        }
        assert.equal(isPrivateAddress('8.8.8.8'), false);
        await assert.rejects(() => assertPublicUrl('http://127.0.0.1/x.jar'));
        await assert.rejects(() => assertPublicUrl('http://localhost/x.jar'));
        await assert.rejects(() => assertPublicUrl('file:///etc/passwd'));

        console.log('Add-on tests passed.');
    } finally {
        await fs.rm(tempStorageRoot, { recursive: true, force: true }).catch(() => undefined);
    }
}

main().catch(error => { console.error(error); process.exit(1); });
