/**
 * Checks how the manager makes Velocity pick up velocity.toml changes: a console reload that keeps players
 * connected (via exec helper or Docker attach), and safe fallback policies that avoid kicking players.
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
    sendContainerInput: unknown;
    getContainerLogs: unknown;
    restartContainer: unknown;
    getContainers: unknown;
};
const original = {
    executeCommand: portainer.executeCommand,
    sendContainerInput: portainer.sendContainerInput,
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
    let attaches: string[] = [];
    let restarts = 0;
    let logs = 'booting';

    const setup = (
        exitCode: number,
        replyInLog: boolean,
        options: { attachWorks?: boolean; initialLogs?: string } = {}
    ) => {
        commands = [];
        attaches = [];
        restarts = 0;
        logs = options.initialLogs ?? 'booting';
        stub.executeCommand = async (_id: string, command: string) => {
            commands.push(command);
            if (exitCode === 0 && replyInLog) logs += '\nVelocity configuration successfully reloaded.';
            return { output: '', exitCode };
        };
        stub.sendContainerInput = async (_id: string, command: string) => {
            attaches.push(command);
            if (options.attachWorks) {
                if (replyInLog) logs += '\n[INFO]: Reloaded configuration.';
                return { sent: true };
            }
            return { sent: false, error: 'The proxy has no console input (stdin_open: true is off).' };
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

    await check('falls back to Docker attach when exec input fails (such as tty: true proxies)', async () => {
        setup(3, true, { attachWorks: true });
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.success, true);
        assert.equal(result.method, 'reload');
        assert.equal(result.confirmed, true);
        assert.equal(restarts, 0);
        assert.deepEqual(attaches, ['velocity reload']);
    });

    await check('an echoed command without confirmation is not treated as confirmed', async () => {
        setup(3, false, { attachWorks: true, initialLogs: 'booting\n> velocity reload' });
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.method, 'reload');
        assert.equal(result.confirmed, false);
        assert.equal(restarts, 0);
    });

    await check('a delivered but unconfirmed reload does not restart the proxy', async () => {
        setup(0, false);
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.method, 'reload');
        assert.equal(result.confirmed, false);
        assert.equal(restarts, 0);
    });

    await check('a proxy without console input is not restarted by default so backend players stay connected', async () => {
        delete process.env.VELOCITY_RELOAD_FALLBACK;
        setup(3, false);
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.success, false);
        assert.equal(result.method, 'none');
        assert.equal(restarts, 0);
    });

    await check('if-empty restarts only when no connected players appear in logs', async () => {
        process.env.VELOCITY_RELOAD_FALLBACK = 'if-empty';
        setup(3, false, { initialLogs: 'booting\nSteve (/1.2.3.4:1234) has connected' });
        const blocked = await velocity.reloadVelocity('abc', 1);
        assert.equal(blocked.method, 'none');
        assert.equal(restarts, 0);

        setup(3, false, { initialLogs: 'booting\nSteve (/1.2.3.4:1234) has connected\nSteve (/1.2.3.4:1234) has disconnected' });
        const allowed = await velocity.reloadVelocity('abc', 1);
        assert.equal(allowed.method, 'restart');
        assert.equal(restarts, 1);
        delete process.env.VELOCITY_RELOAD_FALLBACK;
    });

    await check('explicit restart fallback restarts when requested', async () => {
        process.env.VELOCITY_RELOAD_FALLBACK = 'restart';
        setup(3, false);
        const result = await velocity.reloadVelocity('abc', 1);
        assert.equal(result.success, true);
        assert.equal(result.method, 'restart');
        assert.equal(restarts, 1);
        delete process.env.VELOCITY_RELOAD_FALLBACK;
    });

    await check('the generated shell script is valid and guards against TTY writes', async () => {
        setup(0, true);
        await velocity.sendConsoleCommand('abc', 'velocity reload', 1);
        const script = commands[0];
        execFileSync('sh', ['-n', '-c', script]); // syntax check only
        assert.ok(script.includes('mc-send-to-console'));
        assert.ok(script.includes('/proc/1/fd/0'));
        assert.ok(script.includes('[ ! -t 0 ]'));
    });

    await check('the script really delivers the command to a non-TTY writable input', async () => {
        setup(0, true);
        await velocity.sendConsoleCommand('abc', 'velocity reload', 1);
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
