import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import Server from '@/lib/objects/Server';
import { IUser } from '@/lib/objects/User';
import { ownerFilter } from '@/lib/server/access';
import { getLiveServerCommands } from '@/lib/server/liveCommands';
import verificationService from '@/lib/server/verify';

export async function GET(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const url = new URL(request.url);
        const uniqueId = url.searchParams.get('uniqueId');
        const refresh = url.searchParams.get('refresh') === '1';

        if (!uniqueId) {
            return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });
        }

        const server = await Server.findOne({
            ...ownerFilter(user),
            uniqueId,
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        const result = await getLiveServerCommands(server, user, { force: refresh });
        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Error fetching server commands:', error);
        const message = error instanceof Error ? error.message : 'Failed to fetch commands';
        return NextResponse.json({ message }, { status: 500 });
    }
}
