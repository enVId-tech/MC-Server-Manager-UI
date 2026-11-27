#!/usr/bin/env npx tsx

import assert from 'node:assert/strict';
import {
    buildPlayerCommand,
    isBedrockUuid,
    isValidPlayerToken,
    normalizeUuid,
    parseLogPlayers,
    usercacheLastSeen,
} from '../lib/server/playerManager';

// UUID normalization & Bedrock Floodgate detection
assert.equal(
    normalizeUuid('46EDEBbB69584a8bbc67778234d18b23'),
    '46edebbb-6958-4a8b-bc67-778234d18b23'
);
assert.equal(isBedrockUuid('00000001-0000-0001-27aa-24f320762b42'), true);
assert.equal(isBedrockUuid('46edebbb-6958-4a8b-bc67-778234d18b23'), false);

// usercache 30-day offset -> lastSeen ISO conversion
const lastSeen = usercacheLastSeen('2026-12-26 20:00:52 +0000');
assert.ok(lastSeen && lastSeen.startsWith('2026-11-26T20:00:52'));

// Log parsing across regular Paper/Bukkit and Velocity proxies
const paperLog = [
    '[10:00:01 INFO]: UUID of player enVIdTech is 46edebbb-6958-4a8b-bc67-778234d18b23',
    '[10:00:02 INFO]: enVIdTech joined the game',
    '[10:01:00 INFO]: UUID of player Steve is 8667ba71-b85a-4004-af54-457a9734eed7',
    '[10:01:01 INFO]: Steve joined the game',
    '[10:02:00 INFO]: Steve lost connection: Disconnected',
].join('\n');

const parsedPaper = parseLogPlayers(paperLog);
assert.deepEqual([...parsedPaper.onlineNames], ['enVIdTech']);
assert.equal(parsedPaper.uuidByName.get('envidtech')?.uuid, '46edebbb-6958-4a8b-bc67-778234d18b23');
assert.ok(parsedPaper.allNames.has('steve'));

const velocityLog = [
    '[09:16:17 INFO]: [connected player] enVIdTech (/192.168.1.254:25565) has connected',
    '[09:16:18 INFO]: [server connection] enVIdTech -> erick-survival has connected',
    '[09:20:01 INFO]: [connected player] Arachnite_ (/76.171.115.231:63724) has connected',
    '[09:21:00 INFO]: [connected player] Arachnite_ (/76.171.115.231:63724) has disconnected: Disconnected',
].join('\n');

const parsedVel = parseLogPlayers(velocityLog);
assert.deepEqual([...parsedVel.onlineNames], ['enVIdTech']);
assert.equal(parsedVel.currentServerByName.get('envidtech'), 'erick-survival');
assert.ok(parsedVel.allNames.has('arachnite_'));

// Player token & admin command builders
assert.equal(isValidPlayerToken('enVIdTech'), true);
assert.equal(isValidPlayerToken('.BedrockUser_1'), true);
assert.equal(isValidPlayerToken('bad\nname'), false);
assert.equal(isValidPlayerToken('bad;cmd'), false);

assert.equal(buildPlayerCommand({ action: 'kick', player: 'Steve', reason: 'AFK too long' }), 'kick Steve AFK too long');
assert.equal(buildPlayerCommand({ action: 'ban', player: 'Griefer', reason: 'Griefing' }), 'ban Griefer Griefing');
assert.equal(buildPlayerCommand({ action: 'unban', player: 'Griefer' }), 'pardon Griefer');
assert.equal(buildPlayerCommand({ action: 'message', player: 'Steve', message: 'Hello there!' }), 'tell Steve Hello there!');
assert.equal(buildPlayerCommand({ action: 'op', player: 'enVIdTech' }), 'op enVIdTech');
assert.equal(buildPlayerCommand({ action: 'deop', player: 'Steve' }), 'deop Steve');
assert.equal(buildPlayerCommand({ action: 'whitelist-add', player: 'Steve' }), 'whitelist add Steve');
assert.equal(buildPlayerCommand({ action: 'whitelist-remove', player: 'Steve' }), 'whitelist remove Steve');
assert.equal(buildPlayerCommand({ action: 'gamemode', player: 'Steve', gamemode: 'creative' }), 'gamemode creative Steve');
assert.equal(buildPlayerCommand({ action: 'teleport', player: 'Steve', target: 'enVIdTech' }), 'tp Steve enVIdTech');
assert.equal(buildPlayerCommand({ action: 'send', player: 'Steve', serverName: 'erick-survival' }), 'send Steve erick-survival');

assert.throws(() => buildPlayerCommand({ action: 'message', player: 'Steve', message: '   ' }));
assert.throws(() => buildPlayerCommand({ action: 'ban', player: 'bad;rm' }));

console.log('Player manager tests passed.');
