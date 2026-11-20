/**
 * Checks for the itzg option catalog: version rules, which options apply to which server, validation of
 * user supplied settings and the environment that is built from them.
 *
 * Run with: npm run test:itzg-catalog
 */
import assert from 'node:assert/strict';
import {
    LOCKED_OPTIONS,
    OPTIONS,
    SERVER_TYPES,
    compareMinecraftVersions,
    getApplicableOptions,
    getImageTag,
    getRequiredJavaVersion,
    getServerType,
    groupOptions,
    isOptionApplicable,
    readOptionValue,
    resolveUserEnvironment,
    sanitizeOverrides,
    splitOptionValues,
} from '../lib/data/itzg';
import {
    limitToType,
    parseForgePromotions,
    parseLoaderMetaVersions,
    parseNeoForgeVersions,
    parseProjectVersions,
} from '../lib/data/itzg/versionSources';

let failures = 0;

function check(name: string, run: () => void): void {
    try {
        run();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failures++;
        console.log(`  ✗ ${name}`);
        console.log(`    ${(error as Error).message}`);
    }
}

const applicable = (env: string, type: string, version: string) => {
    const option = OPTIONS.find(candidate => candidate.env === env);
    assert.ok(option, `${env} is not in the catalog`);
    return isOptionApplicable(option, type, version);
};

console.log('Versions');
check('old and new numbering compare correctly', () => {
    assert.ok(compareMinecraftVersions('1.8.9', '1.12') < 0);
    assert.ok(compareMinecraftVersions('1.20.4', '1.20.10') < 0);
    assert.ok(compareMinecraftVersions('1.21.11', '1.21.2') > 0);
    assert.ok(compareMinecraftVersions('26.1', '1.21.11') > 0);
    assert.equal(compareMinecraftVersions('1.20', '1.20.0'), 0);
    assert.ok(compareMinecraftVersions('LATEST', '26.2') > 0);
});
check('Java follows the Minecraft version', () => {
    assert.equal(getRequiredJavaVersion('1.12.2'), 8);
    assert.equal(getRequiredJavaVersion('1.16.5'), 8);
    assert.equal(getRequiredJavaVersion('1.17.1'), 17);
    assert.equal(getRequiredJavaVersion('1.20.4'), 17);
    assert.equal(getRequiredJavaVersion('1.20.5'), 21);
    assert.equal(getRequiredJavaVersion('1.21.4'), 21);
    assert.equal(getRequiredJavaVersion('26.1'), 25);
});
check('image tags match the Java version', () => {
    assert.equal(getImageTag('1.8.8'), 'java8');
    assert.equal(getImageTag('1.19.4'), 'java17');
    assert.equal(getImageTag('1.21'), 'java21');
    assert.equal(getImageTag('LATEST'), 'latest');
    assert.equal(getImageTag(''), 'latest');
});

console.log('Catalog');
check('every variable is listed once', () => {
    const seen = new Set<string>();
    for (const option of [...OPTIONS, ...LOCKED_OPTIONS]) {
        assert.ok(!seen.has(option.env), `${option.env} appears twice`);
        seen.add(option.env);
    }
});
check('selectors only name real server types and families', () => {
    const ids = new Set(SERVER_TYPES.map(type => type.id));
    const families = new Set(SERVER_TYPES.map(type => `family:${type.family}`));
    for (const option of OPTIONS) {
        for (const entry of [...(option.types ?? []), ...(option.excludeTypes ?? [])]) {
            assert.ok(ids.has(entry) || families.has(entry) || entry === 'plugins' || entry === 'mods', `${option.env} uses unknown selector ${entry}`);
        }
    }
});
check('options are well formed', () => {
    for (const option of OPTIONS) {
        assert.ok(option.label && option.description, `${option.env} needs a label and description`);
        if (option.kind === 'select') assert.ok(option.choices && option.choices.length > 0, `${option.env} needs choices`);
        if (option.min !== undefined && option.max !== undefined) assert.ok(option.min <= option.max, `${option.env} has min above max`);
        if (option.minVersion && option.maxVersion) {
            assert.ok(compareMinecraftVersions(option.minVersion, option.maxVersion) < 0, `${option.env} has min version above max version`);
        }
    }
});
check('locked variables are not editable options', () => {
    const editable = new Set(OPTIONS.map(option => option.env));
    for (const locked of LOCKED_OPTIONS) {
        assert.ok(!editable.has(locked.env), `${locked.env} is both locked and editable`);
        assert.ok(locked.locked, `${locked.env} needs a reason`);
    }
});
check('server types are unique and lookups work both ways', () => {
    assert.equal(new Set(SERVER_TYPES.map(type => type.id)).size, SERVER_TYPES.length);
    assert.equal(new Set(SERVER_TYPES.map(type => type.type)).size, SERVER_TYPES.length);
    assert.equal(getServerType('paper')?.type, 'PAPER');
    assert.equal(getServerType('AUTO_CURSEFORGE')?.id, 'auto_curseforge');
    assert.equal(getServerType('nope'), undefined);
});

console.log('Applicability');
check('plugin and mod options follow the server type', () => {
    assert.ok(applicable('PLUGINS', 'paper', '1.21'));
    assert.ok(!applicable('PLUGINS', 'fabric', '1.21'));
    assert.ok(applicable('MODS', 'fabric', '1.21'));
    assert.ok(!applicable('MODS', 'paper', '1.21'));
    assert.ok(!applicable('MODS', 'vanilla', '1.21'));
    assert.ok(applicable('MODS', 'mohist', '1.20.1') && applicable('PLUGINS', 'mohist', '1.20.1'));
});
check('platform specific variables only show for their platform', () => {
    assert.ok(applicable('FORGE_VERSION', 'forge', '1.20.1'));
    assert.ok(!applicable('FORGE_VERSION', 'fabric', '1.20.1'));
    assert.ok(applicable('PAPER_BUILD', 'paper', '1.21'));
    assert.ok(!applicable('PAPER_BUILD', 'purpur', '1.21'));
    assert.ok(applicable('CF_API_KEY', 'auto_curseforge', 'LATEST'));
    assert.ok(!applicable('CF_API_KEY', 'paper', '1.21'));
    assert.ok(applicable('MODRINTH_MODPACK', 'modrinth', '1.21'));
    assert.ok(applicable('MODRINTH_PROJECTS', 'fabric', '1.21'));
});
check('version limits apply', () => {
    assert.ok(!applicable('SIMULATION_DISTANCE', 'vanilla', '1.16.5'));
    assert.ok(applicable('SIMULATION_DISTANCE', 'vanilla', '1.18'));
    assert.ok(applicable('MAX_BUILD_HEIGHT', 'vanilla', '1.12.2'));
    assert.ok(!applicable('MAX_BUILD_HEIGHT', 'vanilla', '1.18'));
    assert.ok(!applicable('PAUSE_WHEN_EMPTY_SECONDS', 'vanilla', '1.20.4'));
    assert.ok(applicable('PAUSE_WHEN_EMPTY_SECONDS', 'vanilla', '26.1'));
    assert.ok(applicable('PAUSE_WHEN_EMPTY_SECONDS', 'vanilla', 'LATEST'));
});
check('modpacks ignore version limits', () => {
    assert.ok(applicable('SIMULATION_DISTANCE', 'modrinth', '1.12'));
});
check('every tab has options for a common server', () => {
    for (const tab of ['general', 'world', 'mods', 'advanced'] as const) {
        const options = getApplicableOptions({ type: 'paper', version: '1.21', tab, expert: true });
        assert.ok(options.length > 0, `${tab} is empty for Paper`);
    }
});
check('expert options can be hidden and grouped', () => {
    const basic = getApplicableOptions({ type: 'paper', version: '1.21', tab: 'advanced' });
    const expert = getApplicableOptions({ type: 'paper', version: '1.21', tab: 'advanced', expert: true });
    assert.ok(expert.length > basic.length);
    assert.ok(basic.every(option => !option.expert));
    const groups = groupOptions(expert);
    assert.equal(groups.reduce((sum, group) => sum + group.options.length, 0), expert.length);
});
check('options with their own form field can be left out', () => {
    const all = getApplicableOptions({ type: 'paper', version: '1.21', tab: 'general' });
    const trimmed = getApplicableOptions({ type: 'paper', version: '1.21', tab: 'general', omitFormManaged: true });
    assert.ok(all.some(option => option.env === 'MAX_PLAYERS'));
    assert.ok(!trimmed.some(option => option.env === 'MAX_PLAYERS'));
});

console.log('Validation');
check('locked, unknown and inapplicable settings are rejected', () => {
    const { values, rejected } = sanitizeOverrides({
        RCON_PASSWORD: 'x', UID: '0', EXEC_DIRECTLY: 'false', NOT_A_SETTING: '1', FORGE_VERSION: '1', DIFFICULTY: 'hard',
    }, 'paper', '1.21');
    assert.deepEqual(values, { DIFFICULTY: 'hard' });
    assert.ok(rejected.RCON_PASSWORD && rejected.UID && rejected.EXEC_DIRECTLY && rejected.NOT_A_SETTING && rejected.FORGE_VERSION);
});
check('values are checked against their type', () => {
    const { values, rejected } = sanitizeOverrides({
        MAX_PLAYERS: '50', VIEW_DISTANCE: 500, PVP: 'false', DIFFICULTY: 'impossible', MOTD: 'a'.repeat(9000), LEVEL: 'bad\0name',
    }, 'vanilla', '1.21');
    assert.deepEqual(values, { MAX_PLAYERS: 50, PVP: false });
    assert.ok(rejected.VIEW_DISTANCE && rejected.DIFFICULTY && rejected.MOTD && rejected.LEVEL);
});
check('empty values mean the container default', () => {
    assert.deepEqual(sanitizeOverrides({ MOTD: '', SEED: null }, 'vanilla', '1.21').values, {});
    assert.deepEqual(sanitizeOverrides(null, 'vanilla', '1.21').values, {});
    assert.deepEqual(sanitizeOverrides(['MOTD'], 'vanilla', '1.21').values, {});
});

console.log('Environment');
check('server.properties entries become container variables', () => {
    const environment = resolveUserEnvironment({
        type: 'paper', version: '1.21',
        serverProperties: { gamemode: 'creative', 'level-name': 'lobby', 'white-list': true, 'max-players': 12, 'view-distance': 8 },
    });
    assert.equal(environment.MODE, 'creative');
    assert.equal(environment.LEVEL, 'lobby');
    assert.equal(environment.ENABLE_WHITELIST, 'true');
    assert.equal(environment.MAX_PLAYERS, '12');
    assert.equal(environment.VIEW_DISTANCE, '8');
});
check('unknown properties use CUSTOM_SERVER_PROPERTIES and managed ones are dropped', () => {
    const environment = resolveUserEnvironment({
        type: 'paper', version: '1.21',
        serverProperties: { 'some-plugin-key': 'on', 'server-port': 1, 'rcon.password': 'x', 'enable-rcon': false },
    });
    assert.equal(environment.CUSTOM_SERVER_PROPERTIES, 'some-plugin-key=on');
    assert.ok(!('SERVER_PORT' in environment) && !('RCON_PASSWORD' in environment) && !('ENABLE_RCON' in environment));
});
check('explicit overrides win and custom properties are merged', () => {
    const environment = resolveUserEnvironment({
        type: 'paper', version: '1.21',
        serverProperties: { 'max-players': 12, 'some-key': 'a' },
        overrides: { MAX_PLAYERS: 40, CUSTOM_SERVER_PROPERTIES: 'other=b', TZ: 'Europe/Berlin' },
    });
    assert.equal(environment.MAX_PLAYERS, '40');
    assert.equal(environment.CUSTOM_SERVER_PROPERTIES, 'some-key=a\nother=b');
    assert.equal(environment.TZ, 'Europe/Berlin');
});
check('locked variables never reach the container', () => {
    const environment = resolveUserEnvironment({
        type: 'paper', version: '1.21',
        overrides: { EULA: 'false', TYPE: 'FORGE', RCON_PORT: 1, SERVER_PORT: 1 } as never,
    });
    assert.deepEqual(environment, {});
});

console.log('Dedicated form fields');
check('values are read from the stored field and split back out', () => {
    const option = OPTIONS.find(candidate => candidate.env === 'MAX_PLAYERS');
    assert.ok(option);
    assert.equal(readOptionValue(option, { maxPlayers: 30 }, undefined), 30);
    assert.equal(readOptionValue(option, { maxPlayers: 30 }, { MAX_PLAYERS: 5 }), 5);
    assert.equal(readOptionValue(option, {}, undefined), undefined);

    const worldType = OPTIONS.find(candidate => candidate.env === 'LEVEL_TYPE');
    assert.ok(worldType);
    assert.equal(readOptionValue(worldType, { worldType: 'flat' }, undefined), 'FLAT');

    const { form, overrides } = splitOptionValues({ MAX_PLAYERS: 10, LEVEL_TYPE: 'AMPLIFIED', TZ: 'UTC' });
    assert.deepEqual(form, { maxPlayers: 10, worldType: 'amplified' });
    assert.deepEqual(overrides, { TZ: 'UTC' });
});

console.log('Version sources');
check('paper style project lists keep releases and sort newest first', () => {
    assert.deepEqual(
        parseProjectVersions({ versions: ['1.8.8', '1.20.4', '1.21', '1.21-pre1', '1.20.10', '1.21.1'] }),
        ['1.21.1', '1.21', '1.20.10', '1.20.4', '1.8.8']
    );
    assert.deepEqual(parseProjectVersions(null), []);
});
check('fabric style lists drop unstable versions', () => {
    assert.deepEqual(
        parseLoaderMetaVersions([{ version: '1.21.4', stable: true }, { version: '25w01a', stable: false }, { version: '1.20.1', stable: true }, { version: '1.21.5-rc1', stable: true }]),
        ['1.21.4', '1.20.1']
    );
});
check('forge promotions give each version once', () => {
    assert.deepEqual(
        parseForgePromotions({ promos: { '1.20.1-latest': 'a', '1.20.1-recommended': 'b', '1.12.2-latest': 'c', '1.7.10_pre4-latest': 'd' } }),
        ['1.20.1', '1.12.2']
    );
});
check('neoforge versions are mapped to the minecraft version', () => {
    assert.deepEqual(
        parseNeoForgeVersions({ versions: ['20.4.1', '21.0.3', '21.1.5', '21.1.6', '21.4.5-beta', '26.1.2'] }),
        ['26.1', '1.21.1', '1.21', '1.20.4']
    );
});
check('versions are limited to what a platform can run', () => {
    assert.deepEqual(limitToType(['1.21', '1.19.4', '1.18.2'], { minVersion: '1.19.4' }), ['1.21', '1.19.4']);
    assert.deepEqual(limitToType(['1.21', '1.12'], {}), ['1.21', '1.12']);
});

if (failures > 0) {
    console.log(`\n${failures} check(s) failed.`);
    process.exit(1);
}
console.log(`\nAll itzg catalog checks passed (${OPTIONS.length} options, ${SERVER_TYPES.length} server types).`);
