/**
 * Checks the network probe that port allocation uses: a port with a listener is busy, a free one is free.
 *
 * Run with: npm run test:port-probe
 */
import assert from 'node:assert/strict';
import net from 'node:net';
import { canBind, checkPortOnNetwork, getProbeHosts, isListening } from '../lib/server/portProbe';

async function freePort(): Promise<number> {
    return new Promise(resolve => {
        const server = net.createServer();
        server.listen(0, '0.0.0.0', () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
    });
}

async function main() {
    const port = await freePort();
    assert.equal(await canBind(port), true, 'a free port can be bound');
    assert.equal(await isListening(port, '127.0.0.1'), false, 'nobody listens on a free port');
    assert.deepEqual(await checkPortOnNetwork(port, ['127.0.0.1']), { free: true });

    const listener = net.createServer();
    await new Promise<void>(resolve => listener.listen(port, '0.0.0.0', resolve));
    try {
        assert.equal(await canBind(port), false, 'a port in use cannot be bound');
        assert.equal(await isListening(port, '127.0.0.1'), true, 'the listener is found');
        const check = await checkPortOnNetwork(port, ['127.0.0.1']);
        assert.equal(check.free, false);
        assert.ok(check.reason?.includes(String(port)));
    } finally {
        await new Promise(resolve => listener.close(resolve));
    }

    // an unreachable host never counts as a listener
    assert.equal(await isListening(port, '203.0.113.1', 300), false);

    process.env.PORT_CHECK_HOSTS = 'a.example, b.example';
    assert.deepEqual(getProbeHosts(), ['a.example', 'b.example']);
    delete process.env.PORT_CHECK_HOSTS;
    process.env.PORTAINER_URL = 'https://docker-host.lan:9443';
    assert.deepEqual(getProbeHosts(), ['127.0.0.1', 'docker-host.lan']);

    console.log('All port probe checks passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
