#!/usr/bin/env npx tsx

/** Checks how players and resources are read. Run with: npm run test:live */
import assert from 'node:assert/strict';
import { cleanExecOutput, cpuPercent, memoryUsed, parseList, parsePing, playersFromLog, usageFromStats } from '../lib/server/liveStats';
import { parseMemoryMB } from '../lib/server/resourceMonitor';

// The ping and the list command
assert.deepEqual(parsePing("127.0.0.1:25565 : version=Paper 1.21.4 online=3 max=20 motd='A Minecraft Server'"), { online: 3, max: 20 });
assert.equal(parsePing('connection refused'), null);
assert.deepEqual(parseList('There are 2 of a max of 20 players online: Alex, Steve'), { online: 2, max: 20, names: ['Alex', 'Steve'] });
assert.deepEqual(parseList('There are 0 of a max of 10 players online:'), { online: 0, max: 10, names: [] });
assert.deepEqual(parseList('There are 1/20 players online:\nAlex'), { online: 1, max: 20, names: ['Alex'] }, 'names on the next line');
assert.equal(parseList('Failed to connect to RCON'), null);
// Docker's stream frames are removed, including one whose length byte is a letter
assert.equal(cleanExecOutput('\u0001\u0000\u0000\u0000\u0000\u0000\u0000A' + 'x'.repeat(64)), 'x'.repeat(64));
assert.equal(cleanExecOutput('\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u001dThere are 0 of a max of 20 players online:\n'), 'There are 0 of a max of 20 players online:');

// The log counts only the current run
const log = [
    '[10:00:00] [Server thread/INFO]: Starting minecraft server version 1.21.4',
    '[10:01:00] [Server thread/INFO]: Alex joined the game',
    '[10:02:00] [Server thread/INFO]: Steve joined the game',
    '[10:03:00] [Server thread/INFO]: Alex left the game',
    '[10:04:00] [Server thread/INFO]: Starting minecraft server version 1.21.4',
    '[10:05:00] [Server thread/INFO]: Notch joined the game',
    '[10:06:00] [Server thread/INFO]: .FloodUser joined the game',
    '[10:07:00] [Server thread/INFO]: <Notch> hello [Steve: not a join]',
].join('\n');
assert.deepEqual(playersFromLog(log), ['Notch', '.FloodUser']);
assert.deepEqual(playersFromLog('[proxy] Alex (/1.2.3.4:5555) has connected\n[proxy] Alex (/1.2.3.4:5555) has disconnected\n[proxy] Bo (/1.2.3.5:1) has connected'), ['Bo']);

// CPU needs two samples and is shown in percent of a core
const GB = 1024 * 1024 * 1024;
const later = { cpu_stats: { cpu_usage: { total_usage: 600 }, system_cpu_usage: 2000, online_cpus: 4 }, precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 0 } };
const earlier = { cpu_stats: { cpu_usage: { total_usage: 500 }, system_cpu_usage: 1000, online_cpus: 4 } };
assert.equal(cpuPercent(later, earlier), 40, '100 of 1000 on 4 cores is 40% of one core');
assert.equal(cpuPercent(later, undefined), 0, 'an empty earlier sample says nothing');

// Memory without the file cache, against the limit that was set
assert.equal(memoryUsed({ memory_stats: { usage: 3 * GB, stats: { inactive_file: GB } } }), 2 * GB, 'cgroup v2');
assert.equal(memoryUsed({ memory_stats: { usage: 3 * GB, stats: { cache: GB / 2 } } }), 2.5 * GB, 'cgroup v1');
const usage = usageFromStats({ memory_stats: { usage: 3 * GB, limit: 64 * GB, stats: { inactive_file: GB } }, networks: { eth0: { rx_bytes: 5 * 1024 * 1024, tx_bytes: 1024 * 1024 } } }, undefined, 4 * GB);
assert.equal(usage.memoryMB, 2048);
assert.equal(usage.memoryLimitMB, 4096, 'the limit of the server, not the memory of the machine');
assert.equal(usage.memoryPercent, 50);
assert.equal(usage.networkRxMB, 5);
assert.equal(usageFromStats({ memory_stats: { usage: GB, limit: 8 * GB } }, undefined, 0).memoryLimitMB, 8192, 'without a limit the reported one is used');

assert.equal(parseMemoryMB(2048), 2048);
assert.equal(parseMemoryMB('2G'), 2048);
assert.equal(parseMemoryMB('1536M'), 1536);
assert.equal(parseMemoryMB(undefined), 0);

console.log('live tests passed');
