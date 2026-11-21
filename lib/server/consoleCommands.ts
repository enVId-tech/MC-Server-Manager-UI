import dbConnect from '@/lib/db/dbConnect';
import PlatformSettings from '@/lib/objects/PlatformSettings';
import { shellQuote } from '@/lib/server/shell';

/** Commands that move players to another server: the proxy's, and the transfer command of vanilla 1.20.5 and newer */
const SWITCH_COMMANDS = new Set(['server', 'send', 'sendall', 'transfer', 'hub', 'lobby', 'bsend', 'bsendall']);

/** The command that is really run: without the slash, the namespace (`minecraft:transfer`) and any `execute ... run` prefix */
function effectiveCommand(command: string): string {
    let text = command.trim().replace(/^\/+/, '');
    while (/^execute\s/i.test(text)) {
        const run = text.search(/\srun\s/i);
        if (run === -1) break;
        text = text.slice(run + 5).trim().replace(/^\/+/, '');
    }
    return (text.split(/\s+/)[0] ?? '').replace(/^[a-z0-9_.-]+:/i, '').toLowerCase();
}

/** True when the command would send a player to another server */
export function isServerSwitchCommand(command: string): boolean {
    return SWITCH_COMMANDS.has(effectiveCommand(command));
}

/** Whether administrators have switched server-switching commands off for users */
export async function getBlockServerSwitching(): Promise<boolean> {
    await dbConnect();
    const settings = await PlatformSettings.findOne({ key: 'platform' }, 'blockServerSwitching').lean<{ blockServerSwitching?: boolean }>();
    return settings?.blockServerSwitching === true;
}

export async function setBlockServerSwitching(value: boolean): Promise<void> {
    await dbConnect();
    await PlatformSettings.updateOne({ key: 'platform' }, { $set: { blockServerSwitching: value } }, { upsert: true });
}

/**
 * Shell script that sends a command to the console of the server process without RCON: the helper of the itzg
 * images, otherwise a write to the input of the main process. The answer shows up in the server log.
 */
export function consoleInputScript(command: string): string {
    const quoted = shellQuote(command);
    return [
        `if command -v mc-send-to-console >/dev/null 2>&1; then mc-send-to-console ${quoted}`,
        `elif [ -w /proc/1/fd/0 ]; then printf '%s\\n' ${quoted} > /proc/1/fd/0`,
        `else echo "no console input available" >&2; exit 3; fi`,
    ].join('; ');
}
