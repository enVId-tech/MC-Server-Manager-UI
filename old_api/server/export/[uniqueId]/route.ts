import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";

export async function GET(
    request: NextRequest,
    { params }: { params: { uniqueId: string } }
) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const { uniqueId } = await params;
        if (!uniqueId) {
            return NextResponse.json({ message: 'Server identifier is required.' }, { status: 400 });
        }

        // Find the server
        const server = await Server.findOne({
            $and: [
                { email: user.email },
                { uniqueId: uniqueId }
            ]
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        // Get container
        const containerIdentifier = `mc-${server.uniqueId}`;
        const container = await portainer.getContainerByIdentifier(containerIdentifier);
        
        if (!container) {
            return NextResponse.json({ message: `Container '${containerIdentifier}' not found.` }, { status: 404 });
        }

        // Get archive stream
        // We archive /data which contains the server files
        const archiveStream = await portainer.getContainerArchive(
            container.Id,
            '/data',
            server.environmentId || undefined
        );

        // Return stream
        return new NextResponse(archiveStream as any, {
            headers: {
                'Content-Type': 'application/x-tar',
                'Content-Disposition': `attachment; filename="${server.serverName}-${server.uniqueId}.tar"`,
            },
        });

    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json(
            { message: 'Failed to export server.', error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
