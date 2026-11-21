/**
 * Warnings a server shows when it is not (fully) part of the proxy network. Pure, so the rules can be tested.
 */
import type { NetworkWarning } from '@/lib/objects/Server';

export type WarningInput = Pick<NetworkWarning, 'code' | 'port'>;

export function exposureNote(port: number | undefined): string {
    return port
        ? `It will most likely not be joinable unless port ${port} is forwarded or exposed to the internet.`
        : 'It will most likely not be joinable unless its port is forwarded or exposed to the internet.';
}

export function warningMessage(code: NetworkWarning['code'], port: number | undefined, detail?: string): string {
    const note = exposureNote(port);
    switch (code) {
        case 'no-proxy':
            return `There is no proxy for this server to join. ${note}`;
        case 'unsupported-version':
            return `No proxy supports this Minecraft version${detail ? ` (${detail})` : ''}. ${note}`;
        case 'unsupported-type':
            return `This kind of server cannot receive player identities from a proxy${detail ? ` (${detail})` : ''}. ${note}`;
        case 'no-secret':
            return `The proxy's forwarding key could not be found${detail ? ` (${detail})` : ''}, so the server was not connected to it. ${note}`;
        case 'link-failed':
            return `The proxy could not be updated${detail ? `: ${detail}` : ''}. ${note}`;
        case 'host-taken':
            return `${detail ?? 'An address of this server'} is already a forced host that leads to another server, so the proxy was left as it is and players using that address do not reach this server.`;
    }
}

/**
 * Builds the list of warnings for a sync. A warning that was cleared before and still applies stays cleared;
 * one that no longer applies disappears, so it comes back with a fresh text if the problem returns.
 */
export function mergeWarnings(
    previous: NetworkWarning[] | undefined,
    current: Array<{ code: NetworkWarning['code']; port?: number; detail?: string }>,
    now: Date = new Date()
): NetworkWarning[] {
    return current.map(item => {
        const before = previous?.find(warning => warning.code === item.code);
        return {
            code: item.code,
            port: item.port,
            message: warningMessage(item.code, item.port, item.detail),
            dismissed: before?.dismissed === true,
            createdAt: before?.createdAt ?? now,
        };
    });
}

export function visibleWarnings(warnings: NetworkWarning[] | undefined): NetworkWarning[] {
    return (warnings ?? []).filter(warning => !warning.dismissed);
}
