import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import BodyParser from '@/lib/db/bodyParser';
import verificationService from '@/lib/server/verify';
import {
    DuplicateValidationError,
    duplicateServer,
    getDuplicateSuggestions,
} from '@/lib/server/duplicateServer';

/** GET /api/server/duplicate?source=<id> — returns unique name and address suggestions for duplicating a server. */
export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const user = await verificationService.getUserFromToken(request);
        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'User not found or inactive.' }, { status: user ? 403 : 401 });
        }

        const sourceId = new URL(request.url).searchParams.get('source')?.trim() ?? '';
        if (!sourceId) {
            return NextResponse.json({ message: 'Source server identifier is required.' }, { status: 400 });
        }

        const suggestions = await getDuplicateSuggestions(sourceId, user);
        return NextResponse.json(suggestions, { status: 200 });
    } catch (error) {
        if (error instanceof DuplicateValidationError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        console.error('Failed to prepare duplicate server suggestions:', error);
        return NextResponse.json({ message: 'Failed to load duplicate suggestions.' }, { status: 500 });
    }
}

/** POST /api/server/duplicate — clones a server with a distinct name/folder, IP/subdomain, ports, and container. */
export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        const user = await verificationService.getUserFromToken(request);
        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'User not found or inactive.' }, { status: user ? 403 : 401 });
        }

        const body = await BodyParser.parseAuto(request);
        const sourceId = String(body?.sourceId ?? '').trim();
        const name = typeof body?.name === 'string' ? body.name : '';
        const subdomain = typeof body?.subdomain === 'string' ? body.subdomain : '';
        const startAfterCreate = body?.startAfterCreate === true;

        if (!sourceId) {
            return NextResponse.json({ message: 'Source server identifier is required.' }, { status: 400 });
        }

        const result = await duplicateServer({
            sourceId,
            user,
            name,
            subdomain,
            startAfterCreate,
        });

        return NextResponse.json(
            {
                message: `Server "${result.serverName}" duplicated successfully.`,
                server: {
                    id: result.uniqueId,
                    uniqueId: result.uniqueId,
                    serverName: result.serverName,
                    subdomainName: result.subdomainName,
                    folderPath: result.folderPath,
                    port: result.port,
                    rconPort: result.rconPort,
                    serverType: result.serverType,
                    version: result.version,
                    maxPlayers: result.maxPlayers,
                    isOnline: result.isOnline ? 'starting' : 'offline',
                },
            },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof DuplicateValidationError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        console.error('Error duplicating server:', error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Failed to duplicate server.' },
            { status: 500 }
        );
    }
}
