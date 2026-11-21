#!/usr/bin/env npx tsx

/**
 * Checks the modded server support: which types can be created, the forwarding mod config edits, the files that
 * users may not see or change, and which proxies modded servers join. Run with: npm run test:modded
 */
import assert from 'node:assert/strict';
import { CREATABLE_SERVER_TYPES, isModdedType, isVelocityCompatible } from '../lib/data/itzg/serverTypes';
import { loaderForType, setTomlKey } from '../lib/server/network/modded';
import { isHiddenFromUsers, sanitizeForBackup } from '../lib/server/accessPolicy';
import { touchesManagedFile } from '../lib/server/fileAccess';
import { pickProxies } from '../lib/server/network/service';
import type { NetworkProxy } from '../lib/server/network/service';

function proxy(id: string, forwarding: 'modern' | 'legacy' | 'bungeeguard'): NetworkProxy {
    return {
        id, name: id, enabled: true, forwarding, secret: 'abc', kind: forwarding === 'modern' ? 'velocity' : 'bungeecord',
        linkedServers: 0, priority: 0, networkName: 'net', folder: `/p/${id}`, containerName: id, port: 25565,
    } as unknown as NetworkProxy;
}

console.log('Creatable types');
const creatable = CREATABLE_SERVER_TYPES.map(type => type.id);
for (const id of ['forge', 'neoforge', 'fabric', 'quilt', 'modrinth', 'auto_curseforge', 'ftba', 'paper', 'mohist']) assert.ok(creatable.includes(id), id);
for (const id of ['vanilla', 'limbo', 'custom']) assert.ok(!creatable.includes(id), id);
assert.equal(isModdedType('Fabric'), true);
assert.equal(isModdedType('paper'), false);
assert.equal(isVelocityCompatible('neoforge'), true);
assert.equal(loaderForType('FORGE'), 'forge');
assert.equal(loaderForType('modrinth'), null);

console.log('TOML edits');
assert.equal(setTomlKey('secret = "old"\nhackOnlineMode = true\n', null, 'secret', 'new'), 'secret = "new"\nhackOnlineMode = true\n');
assert.equal(setTomlKey('hackOnlineMode = true\n\n[other]\nx = 1\n', null, 'secret', 'k'), 'hackOnlineMode = true\nsecret = "k"\n\n[other]\nx = 1\n');
const forge = '[forwarding]\n\tenabled = false\n\tmode = "MODERN"\n\tsecret = ""\n\n[advanced]\n\tmodernForwardingVersion = "AUTO"\n';
const edited = setTomlKey(setTomlKey(forge, 'forwarding', 'enabled', true), 'forwarding', 'secret', 'S3cret"x');
assert.ok(edited.includes('\tenabled = true') && edited.includes('\tsecret = "S3cret\\"x"') && edited.includes('[advanced]\n\tmodernForwardingVersion = "AUTO"'));
assert.equal(setTomlKey('a = 1\n', 'forwarding', 'secret', 'z'), 'a = 1\n\n[forwarding]\n\tsecret = "z"\n');
assert.ok(setTomlKey('# c\nannounce-forge = false\n[servers]\nlobby = "x"\n', null, 'announce-forge', true).startsWith('# c\nannounce-forge = true\n[servers]'));

console.log('Hidden and managed files');
for (const hidden of ['/config/FabricProxy-Lite.toml', '/config/proxy-compatible-forge.toml', '/mods/FabricProxy-Lite-2.9.jar', '/mods/proxy-compatible-forge-1.2.jar', '/mods/crossstitch-0.1.jar']) {
    assert.equal(isHiddenFromUsers(hidden), true, hidden);
    assert.equal(sanitizeForBackup(hidden, Buffer.from('secret = "x"')), null, hidden);
}
assert.equal(isHiddenFromUsers('/mods/fabric-api-0.1.jar'), false);
const managed = [{ path: 'mods/fabric-api-0.1.jar' }];
assert.equal(touchesManagedFile(managed, '/mods/fabric-api-0.1.jar'), true);
assert.equal(touchesManagedFile(managed, '/mods'), true);
assert.equal(touchesManagedFile(managed, '/'), true);
assert.equal(touchesManagedFile(managed, '/mods/other.jar'), false);
assert.equal(touchesManagedFile(undefined, '/mods'), false);

console.log('Proxy choice');
const velocity = proxy('v', 'modern');
const bungee = proxy('b', 'legacy');
assert.equal(pickProxies([velocity, bungee], '1.20.1', 'fabric', 'all', 25566).chosen.length, 1);
const onlyBungee = pickProxies([bungee], '1.20.1', 'forge', 'all', 25566);
assert.equal(onlyBungee.chosen.length, 0);
assert.equal(onlyBungee.concerns[0].code, 'unsupported-type');
assert.equal(pickProxies([bungee], '1.20.1', 'paper', 'all', 25566).chosen.length, 1);
assert.equal(pickProxies([velocity], '1.12.2', 'forge', 'all', 25566).chosen.length, 0);

console.log('All modded server checks passed');
