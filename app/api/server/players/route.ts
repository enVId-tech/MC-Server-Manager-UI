import { ownerFilter } from '@/lib/server/access';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import { IUser } from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import portainer from '@/lib/server/portainer';
import verificationService from '@/lib/server/verify';
import { getContainerName } from '@/lib/server/containerNames';
import { getPlayers } from '@/lib/server/liveStats';

/** GET /api/server/players?uniqueId=... the players that are on the server now (for the suggestions of the console) */
export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 });

        const uniqueId = new URL(request.url).searchParams.get('uniqueId');
        if (!uniqueId) return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });

        const server = await Server.findOne({ ...ownerFilter(user), uniqueId });
        if (!server) return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });

        const environmentId = await portainer.getValidEnvironmentId(server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID, 10) : null));
        const container = await portainer.getContainerByIdentifier(getContainerName(server), environmentId);
        if (!container || container.State !== 'running') return NextResponse.json({ online: 0, max: null, names: [] });

        const players = await getPlayers(container.Id, environmentId, { wantNames: true });
        return NextResponse.json({ online: players.online, max: players.max, names: players.names ?? [] });
    } catch (error) {
        console.error('Error fetching players:', error);
        return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
    }
}
