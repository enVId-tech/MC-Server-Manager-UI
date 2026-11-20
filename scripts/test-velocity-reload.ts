/**
 * Checks how the manager makes Velocity pick up velocity.toml changes: a console reload that keeps players
 * connected, a restart only as fallback, and the shell command that delivers it.
 *
 * Run with: npm run test:velocity-reload
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import portainer from '../lib/server/portainer';
import velocity from '../lib/server/velocity';

process.env.LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH ?? '/tmp/velocity-reload-test';
process.env.STORAGE_BACKEND = 'local';

type Stubbed = {
    executeCommand: unknown;
    getContainerLogs: unknown;
    restartContainer: unknown;
    getContainers: unknown;
};
const original = {
    executeCommand: portainer.executeCommand,
    getContainerLogs: portainer.getContainerLogs,
    restartContainer: portainer.restartContainer,
    getContainers: portainer.getContainers,
};
const stub = portainer as unknown as Stubbed;

let failures = 0;
async function check(name: string, run: () => Promise<void>) {
    try {
        await run();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failures++;
        console.log(`  ✗ ${name}\n    ${(error as Error).message}`);
    }
}

async function main() {
    let commands: string[] = [];
    let restarts = 0;
    let logs = 'booting';

    const setup = (exitCode: number, replyInLog: boolean) => {
        commands = [];
        restarts = 0;
        logs = 'booting';
        stub.executeCommand = async (_id: string, command: string) => {
            commands.push(command);
            if (exitCode === 0 && replyInLog) logs += '\nVelocity configuration successfully reloaded.';
            return { output: '', exitCode };
        };
        stub.getContainerLogs = async () => logs;
        stub.restartContainer = async () => { restarts++; };
    };

    await check('the reload command is delivered and confirmed without a restart', async () => {
        setup(0, true);
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.success, true);
        assert.equal(result.method, 'reload');
        assert.equal(result.confirmed, true);
        assert.equal(restarts, 0);
        assert.ok(commands[0].includes("'velocity reload'"));
    });

    await check('a delivered but unconfirmed reload does not restart the proxy', async () => {
        setup(0, false);
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.method, 'reload');
        assert.equal(result.confirmed, false);
        assert.equal(restarts, 0);
    });

    await check('a proxy without console input is restarted by default', async () => {
        delete process.env.VELOCITY_RELOAD_FALLBACK;
        setup(3, false);
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.method, 'restart');
        assert.equal(restarts, 1);
    });

    await check('the restart fallback can be switched off', async () => {
        process.env.VELOCITY_RELOAD_FALLBACK = 'none';
        setup(3, false);
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.success, false);
        assert.equal(result.method, 'none');
        assert.equal(restarts, 0);
        delete process.env.VELOCITY_RELOAD_FALLBACK;
    });

    await check('the generated shell script is valid and writes to the process input', async () => {
        setup(0, true);
        await velocity.sendConsoleCommand('abc', "velocity reload", 1);
        const script = commands[0];
        execFileSync('sh', ['-n', '-c', script]); // syntax check only
        assert.ok(script.includes('mc-send-to-console'));
        assert.ok(script.includes('/proc/1/fd/0'));
    });

    await check('the script really delivers the command to a writable input', async () => {
        setup(0, true);
        await velocity.sendConsoleCommand('abc', "velocity reload", 1);
        // swap the input of the main process for a temporary file and run the script as it would run in the container
        const script = commands[0].replace(/\/proc\/1\/fd\/0/g, '/tmp/velocity-reload-input').replace(/command -v mc-send-to-console/, 'command -v mc-send-to-console-not-installed');
        execFileSync('sh', ['-c', 'touch /tmp/velocity-reload-input']);
        execFileSync('sh', ['-c', script]);
        const written = execFileSync('cat', ['/tmp/velocity-reload-input']).toString();
        assert.equal(written, 'velocity reload\n');
    });

    await check('reloadProxies finds the running Velocity container', async () => {
        setup(0, true);
        stub.getContainers = async () => [
            { Id: 'v1', Names: ['/velocity'], Image: 'envidtech/velocity:latest', State: 'running', Status: '' },
            { Id: 'm1', Names: ['/mc-1'], Image: 'itzg/minecraft-server', State: 'running', Status: '' },
        ];
        const result = await velocity.reloadProxies(1);
        assert.equal(result.success, true);
        assert.equal(commands.length, 1);
    });

    Object.assign(portainer, original);
    if (failures > 0) process.exit(1);
    console.log('\nAll velocity reload checks passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
