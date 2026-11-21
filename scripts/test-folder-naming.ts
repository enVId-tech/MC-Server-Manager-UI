#!/usr/bin/env npx tsx

/**
 * Checks how server folders are named. Run with: npm run test:folder-naming
 */
import assert from 'node:assert/strict';
import { literalFolderName, pickFolderName } from '../lib/server/folderNaming';

console.log('Literal names');
assert.equal(literalFolderName('Survival'), 'Survival');
assert.equal(literalFolderName('My Server 1.20'), 'My Server 1.20');
assert.equal(literalFolderName('a/b\\c:d*e'), 'a_b_c_d_e');
assert.ok(!literalFolderName('../../etc').includes('/'));
assert.ok(!literalFolderName('..').startsWith('.'));
assert.equal(literalFolderName('   '), 'server');
assert.equal(literalFolderName('Café Ünïcode'), 'Cafe Unicode');
assert.ok(literalFolderName('x'.repeat(200)).length <= 64);

console.log('Choosing a folder');
assert.equal(pickFolderName({ mode: 'uuid', uniqueId: 'abc123', serverName: 'Survival', taken: ['Survival'] }), 'abc123');
assert.equal(pickFolderName({ mode: 'name', uniqueId: 'abc123', serverName: 'Survival', taken: [] }), 'Survival');
assert.equal(pickFolderName({ mode: 'name', uniqueId: 'abc123', serverName: 'Survival', taken: ['survival'] }), 'Survival-2');
assert.equal(pickFolderName({ mode: 'name', uniqueId: 'abc123', serverName: 'Survival', taken: ['Survival', 'Survival-2', 'other'] }), 'Survival-3');
assert.equal(pickFolderName({ mode: 'name', uniqueId: 'abc123', serverName: 'Survival', taken: ['Survival', 'Survival-3'] }), 'Survival-2');

console.log('All folder naming checks passed');
