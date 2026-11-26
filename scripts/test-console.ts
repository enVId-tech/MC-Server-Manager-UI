#!/usr/bin/env npx tsx

/** Checks the suggestions of the console command line. Run with: npm run test:console */
import assert from 'node:assert/strict';
import { complete, namesInLog, type Context } from '../lib/console/complete';
import { existsIn, flavorOf } from '../lib/console/commands';
import { cleanConsoleText, cleanContainerLogs, parseColoredSegments, stripConsoleColors } from '../lib/console/colors';
import { parseBrigadierHelp, parseBukkitHelpOutput, parsePluginDescriptorCommands } from '../lib/console/liveParse';

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

// Live Brigadier, Bukkit /help, and plugin.yml command parsing
const brigadierSample = '/bluemap [unfreeze|freeze|reload|purge] //set <pattern> /worldedit:set -> //set /veinminer (help|toggle|reload) /tp -> teleport';
const liveCommands = parseBrigadierHelp(brigadierSample);
assert.ok(liveCommands.some(c => c.name === 'bluemap' && c.syntax[0].includes('unfreeze|freeze|reload|purge')));
assert.ok(liveCommands.some(c => c.name === '/set'));
assert.ok(liveCommands.some(c => c.name === 'worldedit:set' && c.syntax.includes('worldedit:set <pattern>')));
assert.ok(liveCommands.some(c => c.name === 'veinminer' && c.syntax[0].includes('help|toggle|reload')));
assert.ok(liveCommands.some(c => c.name === 'tp' && c.summary === 'Alias for /teleport'));

const paperWithLive: Context = { ...paper, extraCommands: liveCommands };
assert.ok(texts('blue', paperWithLive).includes('bluemap'));
assert.deepEqual(texts('bluemap ', paperWithLive), ['unfreeze', 'freeze', 'reload', 'purge']);
assert.deepEqual(texts('veinminer r', paperWithLive), ['reload']);
assert.ok(texts('/', paperWithLive).indexOf('bluemap') < texts('/', paperWithLive).indexOf('worldedit:set'), 'bare commands sort before plugin:cmd');

const bukkitSample = `--- Help: Index (1/2) ---\n/bluemap: Manage BlueMap\n/rg: WorldGuard region command\nWorldEdit: All commands for WorldEdit`;
const bukkitParsed = parseBukkitHelpOutput(bukkitSample);
assert.equal(bukkitParsed.totalPages, 2);
assert.deepEqual(bukkitParsed.commands.map(c => c.name), ['bluemap', 'rg']);
assert.deepEqual(bukkitParsed.topics, ['WorldEdit']);

const yamlParsed = parsePluginDescriptorCommands(`
name: ExamplePlugin
commands:
  warp:
    description: Teleport to a warp
    aliases: [w, warps]
    usage: /<command> <name>
`);
assert.equal(yamlParsed.length, 1);
assert.equal(yamlParsed[0].name, 'warp');
assert.deepEqual(yamlParsed[0].aliases, ['w', 'warps']);
assert.equal(yamlParsed[0].syntax[0], 'warp <name>');

// ANSI, Minecraft § codes, and rcon-cli hex color sequences
const ansi = '\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0010\u001b[32mGreen \u001b[1mBold\u001b[0m Plain §cRed §lBold§r §x\u001b[31m\u001b[31m\u001b[32m\u001b[32m\u001b[33m\u001b[33mHex';
const cleaned = cleanConsoleText(ansi);
assert.equal(stripConsoleColors(cleaned), 'Green Bold Plain Red Bold Hex');
const segments = parseColoredSegments(cleaned);
assert.equal(segments[0].text, 'Green ');
assert.equal(segments[0].color, '#4ade80');
assert.equal(segments[1].text, 'Bold');
assert.equal(segments[1].bold, true);
assert.equal(segments[3].color, '#f87171');
assert.equal(segments[4].color, '#f87171');
assert.equal(segments[4].bold, true);
assert.equal(segments[6].color, '#ccaaee');

// Docker timestamps, JLine `>....\rESC[K` prompt overwrites, and consecutive duplicate log lines
const jlineRaw = [
    '2026-11-26T03:49:32.658851526Z \u001b[m>....\r\u001b[K\u001b[33;1m[03:49:32 WARN]: Repeated warning\r',
    '2026-11-26T03:49:37.658851526Z \u001b[m>....\r\u001b[K\u001b[33;1m[03:49:37 WARN]: Repeated warning\r',
    '2026-11-26T03:49:38.000000000Z \u001b[m>....\r',
].join('\n');
const cleanedLog = cleanContainerLogs(jlineRaw);
assert.equal(stripConsoleColors(cleanedLog), '[03:49:37 WARN]: Repeated warning (x2)');
const cleanedLogSegs = parseColoredSegments(cleanedLog);
assert.equal(cleanedLogSegs[0].color, '#facc15');
assert.equal(cleanedLogSegs[0].bold, true);

console.log('console tests passed');
