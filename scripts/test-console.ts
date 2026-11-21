#!/usr/bin/env npx tsx

/** Checks the suggestions of the console command line. Run with: npm run test:console */
import assert from 'node:assert/strict';
import { complete, namesInLog, type Context } from '../lib/console/complete';
import { existsIn, flavorOf } from '../lib/console/commands';

const paper: Context = { version: '1.21.4', flavor: 'paper', players: ['Alex', 'Steve'] };
const texts = (input: string, ctx: Context = paper) => complete(input, ctx).suggestions.map(suggestion => suggestion.text);

// Commands: what starts with the typed letters first, then what contains them
assert.deepEqual(texts('gam').slice(0, 2), ['gamemode', 'gamerule']);
assert.ok(texts('ga').includes('gamemode'));
assert.ok(texts('ban').indexOf('ban') < texts('ban').indexOf('pardon') || !texts('ban').includes('pardon'));
assert.deepEqual(texts(''), [], 'nothing is suggested for an empty line');
assert.ok(texts('/').length > 50, 'a slash alone lists the commands');
assert.equal(complete('/gam', paper).start, 1, 'the slash stays');
assert.equal(complete('give Al', paper).start, 5);

// Arguments: targets are players and selectors, and the command is not sent
assert.deepEqual(texts('give A'), ['Alex', '@a'], 'a name that starts with it, then the selector');
assert.ok(texts('give ').includes('@a') && texts('give ').includes('Steve') && texts('give ').includes('@n'));
assert.ok(!texts('give ', { ...paper, version: '1.20.4' }).includes('@n'), '@n is from 1.21');
assert.deepEqual(texts('give @a dia').slice(0, 2), ['minecraft:diamond', 'minecraft:diamond_axe']);
assert.ok(texts('give @a sword').includes('minecraft:diamond_sword'), 'words inside a name count');
assert.deepEqual(texts('give @a minecraft:diamond 6'), ['64'], 'typical counts by their start');
assert.deepEqual(texts('give @a minecraft:diamond 5'), [], 'any other count is free');
assert.equal(complete('give @a minecraft:diamond ', paper).hint, undefined, 'typical counts are listed');
assert.deepEqual(texts('give @a minecraft:diamond '), ['1', '16', '32', '64']);
assert.equal(complete('give ', paper).needs, 'players');
assert.deepEqual(texts('gamemode '), ['survival', 'creative', 'adventure', 'spectator']);
assert.deepEqual(texts('gamemode c'), ['creative'], 'prefix first');
assert.deepEqual(texts('gamemode creative '), ['Alex', 'Steve', '@a', '@e', '@p', '@r', '@s', '@n']);
assert.deepEqual(texts('gamerule keepI'), ['keepInventory']);
assert.deepEqual(texts('gamerule keepInventory '), ['true', 'false']);
assert.deepEqual(texts('gamerule randomTickSpeed '), [], 'a number rule takes a number');
assert.equal(complete('gamerule randomTickSpeed ', paper).hint, '<value>');
assert.ok(!texts('gamerule ', { ...paper, version: '1.16.5' }).includes('playersSleepingPercentage'), 'a rule of a later version');
assert.ok(texts('gamerule ', paper).includes('playersSleepingPercentage'));
assert.deepEqual(texts('time set '), ['day', 'night', 'noon', 'midnight', '0', '1000', '6000', '13000', '18000']);
assert.deepEqual(texts('time '), ['set', 'add', 'query']);
assert.deepEqual(texts('time query '), ['daytime', 'gametime', 'day']);
assert.deepEqual(texts('weather th'), ['thunder']);
assert.deepEqual(texts('effect give @s sp').slice(0, 1), ['minecraft:speed']);
assert.deepEqual(texts('effect '), ['give', 'clear']);
assert.deepEqual(texts('op '), ['Alex', 'Steve']);
assert.ok(texts('tp Alex ').includes('~') && texts('tp Alex ').includes('Steve'));
assert.deepEqual(texts('fill ~ ~ ~ ~ ~ ~ stone ').slice(0, 5), ['replace', 'destroy', 'hollow', 'keep', 'outline']);

// Selector arguments
assert.deepEqual(texts('kill @e[ty'), ['@e[type=']);
assert.ok(texts('kill @e[type=pig').includes('@e[type=minecraft:pig'));
assert.ok(texts('kill @e[limit=1,sort=').includes('@e[limit=1,sort=nearest'));

// The version decides which commands there are
assert.ok(texts('tick', paper).includes('tick'));
assert.ok(!texts('tick', { ...paper, version: '1.19.4' }).includes('tick'), 'tick is from 1.20.3');
assert.ok(texts('dam', paper).includes('damage'));
assert.ok(!texts('dam', { ...paper, version: '1.19.2' }).includes('damage'));
assert.ok(texts('replaceitem', { ...paper, version: '1.16.5' }).length === 0, 'it is not in the list, nothing invented');
assert.ok(texts('execute ').includes('run'));
assert.ok(!texts('execute ', { ...paper, version: '1.19.2' }).includes('on'), 'execute on is from 1.19.4');
assert.ok(texts('execute ', paper).includes('on'));
assert.equal(existsIn('LATEST', '1.20'), true);
assert.equal(existsIn(undefined, '1.20', undefined), true);
assert.equal(existsIn('1.12.2', '1.13'), false);
assert.equal(existsIn('1.17', undefined, '1.16.5'), false);

// The kind of server decides too
assert.ok(texts('plug', paper).includes('plugins'));
assert.ok(!texts('plug', { ...paper, flavor: 'vanilla' }).includes('plugins'));
assert.ok(texts('for', { ...paper, flavor: 'forge' }).includes('forge'));
assert.equal(flavorOf('PAPER'), 'paper');
assert.equal(flavorOf('FABRIC'), 'fabric');
assert.equal(flavorOf('VANILLA'), 'vanilla');
assert.equal(flavorOf('velocity', 'proxy'), 'velocity');
assert.ok(texts('ser', { version: undefined, flavor: 'velocity', players: [] }).includes('server'));
assert.ok(!texts('gam', { version: undefined, flavor: 'velocity', players: [] }).includes('gamemode'));
assert.deepEqual(texts('give Alex dia', { ...paper, flavor: 'bedrock' }).slice(0, 2), ['diamond', 'diamond_axe'], 'bedrock names have no namespace');

// execute walks its own grammar and starts over after run
assert.deepEqual(texts('execute as @a at @s '), ['as', 'at', 'align', 'anchored', 'facing', 'in', 'positioned', 'rotated', 'if', 'unless', 'store', 'run', 'on', 'summon']);
assert.deepEqual(texts('execute as @a at @s run gam').slice(0, 2), ['gamemode', 'gamerule']);
assert.deepEqual(texts('execute as @a run give @s dia').slice(0, 1), ['minecraft:diamond']);
assert.deepEqual(texts('execute if block ~ ~ ~ minecraft:sto').slice(0, 1), ['minecraft:stone']);
assert.deepEqual(texts('execute if entity @s ').slice(0, 2), ['as', 'at']);
assert.deepEqual(texts('execute run '), nameList());
function nameList() { return complete('/', paper).suggestions.map(suggestion => suggestion.text); }

// Unknown commands and arguments give nothing and do not throw
assert.deepEqual(texts('notacommand '), []);
assert.deepEqual(texts('say hello wor'), []);
assert.equal(complete('say hello wor', paper).hint, '<message>');

// Players are found in a log
assert.deepEqual(namesInLog('[10:01:00] [Server thread/INFO]: Alex joined the game\n[10:02:00] [Server thread/INFO]: Steve left the game\n[10:03:00] [Server thread/INFO]: <Notch> hi'), ['Alex', 'Steve', 'Notch']);

console.log('console tests passed');
