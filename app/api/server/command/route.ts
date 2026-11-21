import { ownerFilter } from '@/lib/server/access';
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";
import { isSingleLineCommand, shellQuote } from '@/lib/server/shell';
import { consoleInputScript, getBlockServerSwitching, isServerSwitchCommand } from '@/lib/server/consoleCommands';
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

        if (!user.isAdmin && isServerSwitchCommand(command) && await getBlockServerSwitching()) {
            return NextResponse.json({ message: 'Administrators have turned off commands that switch servers.' }, { status: 403 });
        }

        const server = await Server.findOne({
            ...ownerFilter(user),
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

        const clean = (text: string) => text
            .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
            .replace(/§[0-9a-fk-or]/gi, '')
            .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
            .trim();

        const result = await portainer.executeCommand(container.Id, rconCommand, environmentId);
        // The answer of the server is not in its log (the log only notes that an RCON client came and went), so it
        // is sent back for the console to show. Colour codes and the framing bytes of the exec stream are removed.
        const output = clean(String(result.output ?? ''));

        if (result.exitCode !== 0 && /refused|failed to connect|connect:|no such file|not found/i.test(output)) {
            // RCON is off or listens elsewhere (common for imported servers): type the command into the console instead
            const typed = await portainer.executeCommand(container.Id, consoleInputScript(command), environmentId);
            if (typed.exitCode === 0) {
                return NextResponse.json({ output: 'RCON is not reachable, so the command was typed into the server console. Its answer is in the log above.', failed: false, via: 'console' });
            }
            return NextResponse.json({
                output: 'RCON refused the connection and the console has no input. Turn RCON on (enable-rcon=true with an rcon.password in server.properties, or ENABLE_RCON=true) or start the container with stdin_open.',
                failed: true,
            });
        }
        return NextResponse.json({ output, failed: result.exitCode !== 0 });

    } catch (error) {
        console.error('Error executing command:', error);
        return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
    }
}
