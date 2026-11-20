import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";
import { isSingleLineCommand, shellQuote } from '@/lib/server/shell';
import { getContainerName } from '@/lib/server/containerNames';

export async function POST(request: NextRequest) {
    await dbConnect();
    
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const body = await request.json();
        const { uniqueId, command } = body;

        if (!uniqueId || !command) {
            return NextResponse.json({ message: 'Server uniqueId and command are required.' }, { status: 400 });
        }

        if (typeof command !== 'string' || !isSingleLineCommand(command)) {
            return NextResponse.json({ message: 'The command must be a single line of text.' }, { status: 400 });
        }

        const server = await Server.findOne({
            email: user.email,
            uniqueId: uniqueId
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        // Auto-discover valid environment ID
        const storedEnvId = server.environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null);
        const environmentId = await portainer.getValidEnvironmentId(storedEnvId);
        const containerName = getContainerName(server);
        
        // Find container ID
        const container = await portainer.getContainerByIdentifier(containerName, environmentId);
        
        if (!container) {
            return NextResponse.json({ message: 'Server container not found.' }, { status: 404 });
        }

        if (container.State !== 'running') {
            return NextResponse.json({ message: 'Server is not running.' }, { status: 400 });
        }

        // Execute command using rcon-cli. The command is passed through a shell, so it has to be quoted as a
        // single literal argument, otherwise `$(...)`, backticks or a backslash could run other commands.
        const rconCommand = `rcon-cli ${shellQuote(command)}`;

        const result = await portainer.executeCommand(container.Id, rconCommand, environmentId);

        return NextResponse.json({ output: result.output });

    } catch (error) {
        console.error('Error executing command:', error);
        return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
    }
}
