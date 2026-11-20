/**
 * Checks that a container generated from a server record of the database keeps what the user configured.
 * Recreating a lost container once produced a vanilla server with the EULA not accepted, because the stored
 * configuration was used without being converted.
 *
 * Run with: npm run test:server-record
 */
import assert from 'node:assert/strict';

process.env.STORAGE_BACKEND = 'local';
process.env.LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH ?? '/tmp/server-record-test';

async function main() {
    const { createMinecraftServerFromRecord } = await import('../lib/server/minecraft');
    const yaml = await import('yaml');

    const record = {
        uniqueId: '93bb7def-09f4-467e-9521-61c72bd081fe',
        serverName: 'paper21',
        email: 'erickmqtran@example.com',
        port: 25571,
        rconPort: 35566,
        subdomainName: 'paper21.mc.example.com',
        proxyIds: [],
        serverConfig: {
            name: 'paper21',
            serverType: 'paper',
            version: '1.21.4',
            gameMode: 'creative',
            difficulty: 'hard',
            maxPlayers: 42,
            motd: 'Hello there',
            rconEnabled: true,
            rconPassword: 'secret',
            serverMemory: 4096,
            itzgEnv: { INIT_MEMORY: '1G' },
        },
    };

    const compose = yaml.parse(createMinecraftServerFromRecord(record, 1).generateDockerComposeYaml());
    const service = compose.services.minecraft;
    const env = service.environment;

    assert.equal(env.TYPE, 'PAPER', 'the stored server type is used');
    assert.equal(env.EULA, 'TRUE', 'the EULA is accepted');
    assert.equal(env.VERSION, '1.21.4');
    assert.equal(env.MAX_PLAYERS, '42');
    assert.equal(env.DIFFICULTY, 'hard');
    assert.equal(env.MODE ?? env.GAMEMODE, 'creative');
    assert.equal(env.MOTD, 'Hello there');
    assert.equal(env.INIT_MEMORY, '1G', 'settings of the dashboard are kept');
    assert.ok(service.image.endsWith(':java21'), `java 21 image for 1.21.4, got ${service.image}`);
    assert.ok(service.ports.includes('25571:25565'), `the allocated port is published, got ${service.ports}`);
    assert.equal(service.labels['minecraft.server.type'], 'PAPER');

    console.log('All server record checks passed.');
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
});
