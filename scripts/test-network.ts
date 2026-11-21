/**
 * Checks the proxy network rules: which proxy a server joins, the Velocity and BungeeCord file editing and what
 * is read from proxy files. No database or Docker is needed.
 *
 * Run with: npm run test:network
 */
import assert from 'node:assert/strict';
import {
    chooseProxies, forwardingSupportsVersion, versionAllowance, type RoutableProxy,
} from '../lib/server/network/versions';
import { getTomlTable, getTomlValue, removeTomlKey, setTomlValue, tomlArray } from '../lib/server/network/toml';
import {
    addServerToBungeeYaml, addServerToVelocityToml, takenForcedHosts, detectPlugins, disableVelocityFallback, parseBungeeYaml,
    parseEducationJoinOutput, parseGeyserConfig, parseVelocityToml, removeServerFromBungeeYaml,
    removeServerFromVelocityToml, setVelocityForwarding,
} from '../lib/server/network/parse';

const proxy = (id: string, forwarding: RoutableProxy['forwarding'], extra: Partial<RoutableProxy> = {}): RoutableProxy =>
    ({ id, enabled: true, forwarding, ...extra });

// ---- version rules
assert.equal(forwardingSupportsVersion('modern', '1.12.2'), false);
assert.equal(forwardingSupportsVersion('modern', '1.13'), true);
assert.equal(forwardingSupportsVersion('modern', 'LATEST'), true);
assert.equal(forwardingSupportsVersion('modern', '26.1'), true);
assert.equal(forwardingSupportsVersion('legacy', '1.8.8'), true);
assert.equal(forwardingSupportsVersion('bungeeguard', '1.7.10'), true);

// only a modern proxy: nothing older than 1.13
const onlyModern = [proxy('v1', 'modern')];
assert.equal(versionAllowance(onlyModern, '1.12.2').allowed, false);
assert.equal(versionAllowance(onlyModern, '1.12.2').minVersion, '1.13');
assert.equal(versionAllowance(onlyModern, '1.20.4').allowed, true);
// a bungeeguard or legacy proxy takes any version
assert.equal(versionAllowance([proxy('v1', 'bungeeguard')], '1.8.8').allowed, true);
assert.equal(versionAllowance([proxy('v1', 'legacy')], '1.8.8').minVersion, null);
// disabled proxies do not count, no proxy at all allows everything
assert.equal(versionAllowance([proxy('v1', 'modern', { enabled: false })], '1.8').allowed, true);
assert.equal(versionAllowance([], '1.8').allowed, true);

// mixed network: the most modern supported mode wins
const mixed = [proxy('legacy', 'legacy'), proxy('modern', 'modern'), proxy('guard', 'bungeeguard')];
assert.deepEqual(chooseProxies(mixed, '1.20.4').proxies.map(p => p.id), ['modern']);
assert.equal(chooseProxies(mixed, '1.20.4').forwarding, 'modern');
assert.deepEqual(chooseProxies(mixed, '1.12.2').proxies.map(p => p.id), ['guard']);
assert.deepEqual(chooseProxies([proxy('legacy', 'legacy'), proxy('modern', 'modern')], '1.8.9').proxies.map(p => p.id), ['legacy']);
assert.equal(chooseProxies([], '1.20').forwarding, null);
assert.match(chooseProxies(onlyModern, '1.8').reason, /None of the proxies/);

// load balancing between instances of the same kind
const pair = [proxy('a', 'modern', { linkedServers: 5, priority: 1 }), proxy('b', 'modern', { linkedServers: 2, priority: 9 })];
assert.deepEqual(chooseProxies(pair, '1.21', 'all').proxies.map(p => p.id), ['a', 'b']);
assert.deepEqual(chooseProxies(pair, '1.21', 'balanced').proxies.map(p => p.id), ['b']);
assert.deepEqual(chooseProxies(pair, '1.21', 'priority').proxies.map(p => p.id), ['b']);
assert.deepEqual(chooseProxies([...pair, proxy('c', 'modern', { enabled: false, linkedServers: 0 })], '1.21', 'balanced').proxies.map(p => p.id), ['b']);

// ---- TOML editing keeps what it does not know
const VELOCITY = `# Config version. Do not change this
config-version = "2.7"

# What port should the proxy be bound to?
bind = "0.0.0.0:25565"
motd = "<#09add3>A Velocity Server"
show-max-players = 500
online-mode = true
player-info-forwarding-mode = "NONE"
forwarding-secret-file = "forwarding.secret"

[servers]
# Configure your servers here.
lobby = "127.0.0.1:30066"
factions = "127.0.0.1:30067"

# In what order we should try servers when a player logs in or is kicked from a server.
try = [
    "lobby",
    "factions"
]

[forced-hosts]
"lobby.example.com" = [ "lobby" ] # comment

[advanced]
compression-threshold = 256
`;

const parsed = parseVelocityToml(VELOCITY);
assert.equal(parsed.forwarding, 'none');
assert.equal(parsed.secretFile, 'forwarding.secret');
assert.deepEqual(parsed.servers, { lobby: '127.0.0.1:30066', factions: '127.0.0.1:30067' });
assert.deepEqual(parsed.tryOrder, ['lobby', 'factions']);
assert.deepEqual(parsed.forcedHosts, { 'lobby.example.com': ['lobby'] });
assert.equal(parsed.maxPlayers, 500);

const added = addServerToVelocityToml(VELOCITY, { name: 'survival', address: 'mc-abc:25565', hostnames: ['survival.example.com'] });
const afterAdd = parseVelocityToml(added);
assert.equal(afterAdd.servers.survival, 'mc-abc:25565');
assert.deepEqual(afterAdd.forcedHosts['survival.example.com'], ['survival']);
assert.deepEqual(afterAdd.tryOrder, ['lobby', 'factions'], 'a new server never joins the try list');
assert.ok(added.includes('# Config version. Do not change this'), 'comments stay');
assert.ok(added.includes('compression-threshold = 256'), 'unknown sections stay');
assert.ok(added.includes('"lobby.example.com" = [ "lobby" ] # comment'), 'other entries stay untouched');

// an older manager put the server in try: it comes out again
const oldStyle = setTomlValue(added, 'servers', 'try', tomlArray(['lobby', 'survival']));
assert.deepEqual(parseVelocityToml(addServerToVelocityToml(oldStyle, { name: 'survival', address: 'mc-abc:25565', hostnames: [] })).tryOrder, ['lobby']);

// updating replaces the address in place, no duplicates
const moved = addServerToVelocityToml(added, { name: 'survival', address: 'mc-abc:25566', hostnames: ['survival.example.com'] });
assert.equal((moved.match(/^survival = /gm) ?? []).length, 1);
assert.equal(parseVelocityToml(moved).servers.survival, 'mc-abc:25566');

const removed = removeServerFromVelocityToml(moved, 'survival');
assert.equal(parseVelocityToml(removed).servers.survival, undefined);
assert.equal(parseVelocityToml(removed).forcedHosts['survival.example.com'], undefined);
assert.equal(parseVelocityToml(removed).forcedHosts['lobby.example.com']?.[0], 'lobby');

// no fallback: try is emptied
assert.deepEqual(parseVelocityToml(disableVelocityFallback(VELOCITY)).tryOrder, []);
assert.equal(disableVelocityFallback(disableVelocityFallback(VELOCITY)), disableVelocityFallback(VELOCITY));
assert.deepEqual(parseVelocityToml(disableVelocityFallback(VELOCITY, 'lobby')).tryOrder, ['lobby']);
assert.deepEqual(parseVelocityToml(disableVelocityFallback(VELOCITY, 'missing')).tryOrder, []);

// forwarding mode
assert.equal(parseVelocityToml(setVelocityForwarding(VELOCITY, 'modern')).forwarding, 'modern');
assert.equal(parseVelocityToml(setVelocityForwarding(VELOCITY, 'bungeeguard')).forwarding, 'bungeeguard');

// a file without any tables or without [forced-hosts] still works
const bare = addServerToVelocityToml('bind = "0.0.0.0:25565"\n', { name: 'one', address: 'x:1', hostnames: ['one.example.com'] });
assert.equal(parseVelocityToml(bare).servers.one, 'x:1');
assert.equal(parseVelocityToml(bare).forcedHosts['one.example.com']?.[0], 'one');
assert.equal(getTomlValue(bare, '', 'bind'), '0.0.0.0:25565');
assert.equal(getTomlValue(removeTomlKey(bare, '', 'bind'), '', 'bind'), undefined);
assert.deepEqual(Object.keys(getTomlTable(bare, 'servers')), ['one']);

// ---- BungeeCord / Waterfall
const BUNGEE = `# bungee
ip_forward: false
online_mode: true
listeners:
- query_port: 25577
  motd: '&1Another Bungee'
  priorities:
  - lobby
  bind_local_address: true
  host: 0.0.0.0:25577
  max_players: 1
  forced_hosts:
    pvp.md-5.net: pvp
servers:
  lobby:
    motd: '&1Just another BungeeCord - Forced Host'
    address: localhost:25565
    restricted: false
`;
const bungeeParsed = parseBungeeYaml(BUNGEE);
assert.equal(bungeeParsed.forwarding, 'none');
assert.equal(parseBungeeYaml(BUNGEE.replace('ip_forward: false', 'ip_forward: true')).forwarding, 'legacy');
assert.equal(parseBungeeYaml(BUNGEE.replace('ip_forward: false', 'ip_forward: true'), true).forwarding, 'bungeeguard');
const bungeeAdded = addServerToBungeeYaml(BUNGEE, { name: 'survival', address: 'mc-abc:25565', hostnames: ['survival.example.com'] });
const bungeeAfter = parseBungeeYaml(bungeeAdded);
assert.equal(bungeeAfter.servers.survival, 'mc-abc:25565');
assert.equal(bungeeAfter.forcedHosts['survival.example.com'], 'survival');
assert.equal(bungeeAfter.forcedHosts['pvp.md-5.net'], 'pvp');
assert.ok(!bungeeAfter.priorities.includes('lobby') && !bungeeAfter.priorities.includes('survival'), 'no real server is the fallback');
assert.ok(bungeeAdded.includes('# bungee'));
const bungeeRemoved = parseBungeeYaml(removeServerFromBungeeYaml(bungeeAdded, 'survival'));
assert.equal(bungeeRemoved.servers.survival, undefined);
assert.equal(bungeeRemoved.forcedHosts['survival.example.com'], undefined);
assert.equal(bungeeRemoved.forcedHosts['pvp.md-5.net'], 'pvp');

// ---- plugins, Geyser, education join output
const flags = detectPlugins(['ViaVersion-5.0.jar', 'ViaBackwards-5.0.jar', 'Geyser-Velocity.jar', 'floodgate-velocity.jar', 'EduGeyser-Velocity.jar']);
assert.deepEqual([flags.viaversion, flags.viabackwards, flags.viarewind, flags.geyser, flags.floodgate, flags.edugeyser], [true, true, false, true, true, true]);
assert.equal(detectPlugins(['Geyser-Velocity.jar']).edugeyser, false);
assert.equal(detectPlugins(['EduGeyser-Velocity.jar']).geyser, true);
assert.equal(detectPlugins([]).viaversion, false);

assert.deepEqual(parseGeyserConfig('bedrock:\n  address: 0.0.0.0\n  port: 19133\n  clone-remote-port: false\n'), { bedrockPort: 19133, bedrockAddress: '0.0.0.0', clonesRemotePort: false, broadcastPort: undefined });
assert.equal(parseGeyserConfig('motd1: hi\n').bedrockPort, 19132);

const edu = parseEducationJoinOutput('[INFO]: Join codes:\n[INFO]: 1. Join code: ABC DEF GHI (https://education.minecraft.net/joinworld/abc123)\n[INFO]: something else');
assert.deepEqual(edu.links, ['https://education.minecraft.net/joinworld/abc123']);
assert.equal(edu.lines.length, 2);
const eduIcons = parseEducationJoinOutput('[11:05:03 INFO]: Join code (active): Agent, Panda, Carrot, Water Bucket (https://education.minecraft.net/joinworld/x1)');
assert.deepEqual(eduIcons.codes, [{ label: 'Join code (active)', icons: ['Agent', 'Panda', 'Carrot', 'Water Bucket'] }]);
assert.equal(eduIcons.lines.length, 0);
const eduLog = [
    '2026-11-21T20:57:16Z >.... [20:57:16 INFO] [geyser]: [edu] [JoinCode] Account #1 active: Agent, Panda, Carrot, Pickaxe (1071039@student.auhsd.us) | https://education.minecraft.net/joinworld/NiwxMywxMiw4',
    '2026-11-21T21:24:50Z >.... [21:24:50 INFO] [geyser]: [edu] [JoinCode] Connection ID:',
    '35238128130451310abcde1b274c521331c66ba12cad6241e7',
    '2026-11-21T21:24:50Z >.... [21:24:50 INFO] [geyser]: [edu] [JoinCode] 1071039@student.auhsd.us: Agent, Panda, Carrot, Pickaxe | https://education.minecraft.net/joinworld/NiwxMywxMiw4',
    '2026-11-21T21:39:50Z >.... [21:39:50 INFO] [geyser]: [edu] [JoinCode] Connection ID:',
    '35238128130451310abcde1b274c521331c66ba12cad6241e7',
].join('\n');
const eduReal = parseEducationJoinOutput(eduLog);
assert.equal(eduReal.codes?.length, 1, 'the same code printed twice is one entry');
assert.deepEqual(eduReal.codes?.[0].icons, ['Agent', 'Panda', 'Carrot', 'Pickaxe']);
assert.equal(eduReal.connectionIds?.length, 1);
assert.equal(eduReal.links.length, 1);
assert.equal(eduReal.lines.length, 0);

// ---- warnings
import { mergeWarnings, visibleWarnings, warningMessage } from '../lib/server/network/warnings';
assert.match(warningMessage('no-proxy', 25570), /port 25570 is forwarded or exposed to the internet/);
const first = mergeWarnings(undefined, [{ code: 'no-proxy', port: 25570 }]);
assert.equal(visibleWarnings(first).length, 1);
const cleared = first.map(warning => ({ ...warning, dismissed: true }));
assert.equal(visibleWarnings(mergeWarnings(cleared, [{ code: 'no-proxy', port: 25570 }])).length, 0, 'a cleared warning stays cleared while it applies');
assert.equal(visibleWarnings(mergeWarnings(cleared, [{ code: 'no-secret', port: 25570 }])).length, 1, 'a different problem shows up');
assert.equal(mergeWarnings(cleared, []).length, 0, 'a warning that no longer applies is dropped');
assert.equal(visibleWarnings(mergeWarnings(mergeWarnings(cleared, []), [{ code: 'no-proxy', port: 25570 }])).length, 1, 'and returns if the problem returns');

// ---- templates for proxies the manager creates
import { bungeeYamlTemplate, proxyCompose, velocityTomlTemplate } from '../lib/server/network/proxyTemplates';
import YAML from 'yaml';
const created = parseVelocityToml(velocityTomlTemplate({ motd: 'My "network"', maxPlayers: 100, forwarding: 'modern' }));
assert.equal(created.forwarding, 'modern');
assert.equal(created.motd, 'My "network"');
assert.deepEqual(created.tryOrder, [], 'a new proxy has nowhere to fall back to');
assert.equal(created.secretFile, 'forwarding.secret');
assert.equal(getTomlValue(velocityTomlTemplate({ motd: 'x', maxPlayers: 1, forwarding: 'legacy' }), 'advanced', 'failover-on-unexpected-server-disconnect'), false);
const createdBungee = parseBungeeYaml(bungeeYamlTemplate({ motd: 'hi', maxPlayers: 20, forwarding: 'bungeeguard' }), true);
assert.equal(createdBungee.forwarding, 'bungeeguard');
assert.deepEqual(createdBungee.priorities, ['unavailable']);
const compose = YAML.parse(proxyCompose({ kind: 'waterfall', name: 'w', containerName: 'waterfall-1', image: 'itzg/mc-proxy:latest', hostPort: 25565, hostFolder: '/mnt/p/w', networkName: 'proxy-net', memory: '512M', udpPorts: [19132] }));
assert.deepEqual(compose.services['waterfall-1'].ports, ['25565:25577', '19132:19132/udp']);
assert.ok(compose.services['waterfall-1'].environment.includes('TYPE=WATERFALL'));
const velocityCompose = YAML.parse(proxyCompose({ kind: 'velocity', name: 'v', containerName: 'velocity-1', image: 'envidtech/velocity:latest', hostPort: 25565, hostFolder: '/mnt/p/v', networkName: 'proxy-net', memory: '512M' }));
assert.deepEqual(velocityCompose.services['velocity-1'].volumes, ['/mnt/p/v:/velocity']);
assert.equal(velocityCompose.networks['proxy-net'].external, true);

// Forced hosts that exist are kept; a server only replaces its own
const withHost = 'bind = "0.0.0.0:25565"\n[servers]\nlobby = "lobby:25565"\ntry = ["lobby"]\n[forced-hosts]\n"Play.example.com" = ["lobby"]\n';
const keptOther = addServerToVelocityToml(withHost, { name: 'survival', address: 's:25565', hostnames: ['play.example.com', 'survival.example.com'] });
assert.deepEqual(parseVelocityToml(keptOther).forcedHosts['Play.example.com'], ['lobby'], 'a forced host of another server is not taken over');
assert.deepEqual(parseVelocityToml(keptOther).forcedHosts['survival.example.com'], ['survival']);
assert.equal(parseVelocityToml(keptOther).forcedHosts['play.example.com'], undefined);
assert.deepEqual(takenForcedHosts(parseVelocityToml(withHost).forcedHosts, { name: 'survival', address: 's:25565', hostnames: ['play.example.com'] }), [{ host: 'play.example.com', leadsTo: ['lobby'] }]);
assert.deepEqual(takenForcedHosts(parseVelocityToml(withHost).forcedHosts, { name: 'lobby', address: 'lobby:25565', hostnames: ['play.example.com'] }), [], 'its own forced host is not a conflict');
const renamed = addServerToVelocityToml(keptOther, { name: 'survival', address: 's:25565', hostnames: ['smp.example.com'] });
assert.equal(parseVelocityToml(renamed).forcedHosts['survival.example.com'], undefined, 'the old address of the server is removed');
assert.deepEqual(parseVelocityToml(renamed).forcedHosts['smp.example.com'], ['survival']);
assert.deepEqual(parseVelocityToml(renamed).forcedHosts['Play.example.com'], ['lobby']);

console.log('network tests passed');
