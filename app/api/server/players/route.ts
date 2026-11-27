import { ownerFilter } from '@/lib/server/access';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import { IUser } from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import portainer from '@/lib/server/portainer';
import verificationService from '@/lib/server/verify';
import { getContainerName } from '@/lib/server/containerNames';
import { getPlayers } from '@/lib/server/liveStats';
import {
    executePlayerAction,
    getServerPlayersOverview,
    type PlayerActionRequest,
    type PlayerActionType,
} from '@/lib/server/playerManager';

const ALLOWED_ACTIONS = new Set<PlayerActionType>([
    'kick',
    'ban',
    'unban',
    'message',
    'op',
    'deop',
    'whitelist-add',
    'whitelist-remove',
    'gamemode',
    'teleport',
    'send',
]);

/**
 * GET /api/server/players?uniqueId=...
 * Default: fast online player list for console suggestions.
 * With `&details=1`: full current & historical players list, UUIDs, status flags, and proxy server targets.
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 });

        const url = new URL(request.url);
        const uniqueId = url.searchParams.get('uniqueId');
        const details = url.searchParams.get('details') === '1';
        if (!uniqueId) return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });

        const server = await Server.findOne({ ...ownerFilter(user), uniqueId });
        if (!server) return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });

        if (details) {
            const overview = await getServerPlayersOverview(server);
            return NextResponse.json(overview);
        }

        const environmentId = await portainer.getValidEnvironmentId(
            server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID, 10) : null)
        );
        const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId);
        if (!container || container.State !== 'running') return NextResponse.json({ online: 0, max: null, names: [] });

        const players = await getPlayers(container.Id, environmentId, { wantNames: true });
        return NextResponse.json({ online: players.online, max: players.max, names: players.names ?? [] });
    } catch (error) {
        console.error('Error fetching players:', error);
        return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
    }
}

/**
 * POST /api/server/players
 * Runs an administrative player action (kick, ban, unban, message, op, deop, whitelist, gamemode, teleport, send).
 */
export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 });

        const body = (await request.json().catch(() => ({}))) as Partial<PlayerActionRequest> & { uniqueId?: string };
        const uniqueId = body.uniqueId;
        if (!uniqueId) return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });
        if (!body.action || !ALLOWED_ACTIONS.has(body.action)) {
            return NextResponse.json({ message: 'Invalid player action.' }, { status: 400 });
        }
        if (!body.player || typeof body.player !== 'string') {
            return NextResponse.json({ message: 'Player name is required.' }, { status: 400 });
        }

        const server = await Server.findOne({ ...ownerFilter(user), uniqueId });
        if (!server) return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });

        const result = await executePlayerAction(server, user, {
            action: body.action,
            player: body.player,
            reason: body.reason,
            message: body.message,
            gamemode: body.gamemode,
            target: body.target,
            serverName: body.serverName,
        });

        return NextResponse.json(result, { status: result.success ? 200 : 422 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run player action.';
        const status = /turned off/i.test(message) ? 403 : /Invalid|required|running|only available|single-line/i.test(message) ? 400 : 500;
        return NextResponse.json({ message }, { status });
    }
}
