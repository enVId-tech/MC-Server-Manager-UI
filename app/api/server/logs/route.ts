import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";

export async function GET(request: NextRequest) {
    await dbConnect();
    
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const url = new URL(request.url);
        const uniqueId = url.searchParams.get('uniqueId');
        const tail = parseInt(url.searchParams.get('tail') || '100');

        if (!uniqueId) {
            return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });
        }

        const server = await Server.findOne({
            email: user.email,
            uniqueId: uniqueId
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        // Use server's stored environment ID, or auto-discover a valid one
        const storedEnvId = server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null);
        const environmentId = await portainer.getValidEnvironmentId(storedEnvId);
        const containerName = `mc-${server.uniqueId}`;
        
        // Find container ID
        const container = await portainer.getContainerByIdentifier(containerName, environmentId);
        
        if (!container) {
            return NextResponse.json({ message: 'Server container not found.' }, { status: 404 });
        }

        const logs = await portainer.getContainerLogs(container.Id, environmentId, tail);

        return NextResponse.json({ logs });

    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
    }
}
