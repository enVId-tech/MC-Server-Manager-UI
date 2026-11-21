#!/usr/bin/env npx tsx

/**
 * Checks the rules that tell several proxies apart: base subdomains and ports. Run with: npm run test:proxy-identity
 */
import assert from 'node:assert/strict';
import { baseDomainOf, checkProxyIdentity, hostnameFor, identityIssues, normalizeBaseSubdomain } from '../lib/server/network/identity';
import { addServerToBungeeYaml, addServerToVelocityToml, parseVelocityToml } from '../lib/server/network/parse';

const one = { id: 'a', name: 'Alpha', baseSubdomain: 'ex1', port: 25565 };

console.log('Base subdomain format');
assert.deepEqual(normalizeBaseSubdomain(' EX1. '), { value: 'ex1' });
assert.deepEqual(normalizeBaseSubdomain(''), {});
assert.ok(normalizeBaseSubdomain('bad name').error);
assert.ok(normalizeBaseSubdomain('-x').error);
assert.deepEqual(normalizeBaseSubdomain('eu.ex1'), { value: 'eu.ex1' });

console.log('Host names');
assert.equal(baseDomainOf('ex1', 'example.org'), 'ex1.example.org');
assert.equal(baseDomainOf(undefined, 'example.org'), 'example.org');
assert.equal(hostnameFor('survival', 'ex2.example.org'), 'survival.ex2.example.org');
assert.equal(hostnameFor('Play.Other.net', 'ex2.example.org'), 'play.other.net');
assert.equal(hostnameFor('', 'example.org'), undefined);

console.log('Checks when adding or changing a proxy');
assert.equal(checkProxyIdentity({ id: 'new', name: 'N', port: 25565 }, []), null);
assert.match(checkProxyIdentity({ id: 'new', name: 'N', port: 25566 }, [one]) ?? '', /needs its own base subdomain/);
assert.match(checkProxyIdentity({ id: 'new', name: 'N', baseSubdomain: 'ex1', port: 25566 }, [one]) ?? '', /already used by Alpha/);
assert.match(checkProxyIdentity({ id: 'new', name: 'N', baseSubdomain: 'ex2', port: 25565 }, [one]) ?? '', /Port 25565/);
assert.match(checkProxyIdentity({ id: 'new', name: 'N', baseSubdomain: 'ex2', port: 25566 }, [{ ...one, baseSubdomain: undefined }]) ?? '', /Alpha has no base subdomain/);
assert.equal(checkProxyIdentity({ id: 'new', name: 'N', baseSubdomain: 'ex2', port: 25566 }, [one]), null);
// Changing a proxy does not clash with itself
assert.equal(checkProxyIdentity({ id: 'a', name: 'Alpha', baseSubdomain: 'ex1', port: 25565 }, [one]), null);

console.log('Issues of proxies that exist already');
assert.equal(identityIssues([one]).size, 0);
const issues = identityIssues([one, { id: 'b', name: 'Beta', port: 25565 }, { id: 'c', name: 'Gamma', baseSubdomain: 'ex1', port: 25570 }]);
assert.equal(issues.get('a')?.length, 2);
assert.ok(issues.get('b')?.some(text => /base subdomain/.test(text)));
assert.ok(issues.get('c')?.some(text => /ex1 is also used/.test(text)));

console.log('Old host names leave the proxy config when the base changes');
const toml = '[servers]\ntry = []\n\n[forced-hosts]\n';
const first = addServerToVelocityToml(toml, { name: 'survival', address: 's:25565', hostnames: ['survival.ex1.example.org'] });
const second = addServerToVelocityToml(first, { name: 'survival', address: 's:25565', hostnames: ['survival.ex2.example.org'] });
assert.deepEqual(Object.keys(parseVelocityToml(second).forcedHosts), ['survival.ex2.example.org']);
const bungee = addServerToBungeeYaml('listeners:\n  - host: 0.0.0.0:25577\n', { name: 'survival', address: 's:25565', hostnames: ['survival.ex1.example.org'] });
const bungee2 = addServerToBungeeYaml(bungee, { name: 'survival', address: 's:25565', hostnames: ['survival.ex2.example.org'] });
assert.ok(bungee2.includes('survival.ex2.example.org') && !bungee2.includes('survival.ex1.example.org'));

console.log('All proxy identity checks passed');
