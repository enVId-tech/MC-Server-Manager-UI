import { ownerFilter } from '@/lib/server/access';
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";
import { getContainerName } from '@/lib/server/containerNames';
import { cleanContainerLogs } from '@/lib/console/colors';

export async function GET(request: NextRequest) {
    await dbConnect();
    
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const url = new URL(request.url);
        const uniqueId = url.searchParams.get('uniqueId');
        const tailParam = url.searchParams.get('tail')?.trim().toLowerCase();
        const parsedTail = Number.parseInt(tailParam || '500', 10);
        const tail: number | 'all' = tailParam === 'all'
            ? 'all'
            : (Number.isFinite(parsedTail) && parsedTail > 0 ? parsedTail : 500);

        if (!uniqueId) {
            return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });
        }

        const server = await Server.findOne({
            ...ownerFilter(user),
            uniqueId: uniqueId
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        // Use server's stored environment ID, or auto-discover a valid one
        const storedEnvId = server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null);
        const environmentId = await portainer.getValidEnvironmentId(storedEnvId);
        const containerName = getContainerName(server);
        
        // Find container ID
        const container = await portainer.getContainerByIdentifier(containerName, environmentId);
        
        if (!container) {
            return NextResponse.json({ message: 'Server container not found.' }, { status: 404 });
        }

        const numericTail = tail === 'all' ? null : tail;
        const requestedTail = numericTail === null ? 'all' : numericTail + 1;
        const rawText = String(await portainer.getContainerLogs(container.Id, environmentId, requestedTail, false) ?? '');
        const normalizedRaw = rawText.replace(/\r\n/g, '\n');
        const rawLines = normalizedRaw.endsWith('\n') ? normalizedRaw.slice(0, -1).split('\n') : normalizedRaw.split('\n');
        const hasMore = numericTail !== null && rawLines.length > numericTail;
        const slicedRaw = hasMore && numericTail !== null
            ? rawLines.slice(rawLines.length - numericTail).join('\n')
            : normalizedRaw;
        const logs = cleanContainerLogs(slicedRaw);

        return NextResponse.json({ logs, tail, hasMore });

    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
    }
}
