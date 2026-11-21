import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import { findServerForUser } from '@/lib/server/access';
import { getServerFolderPath } from '@/lib/server/serverPaths';
import {
    canUseFiles, cleanRelativePath, FILE_ACCESS_DENIED, isHiddenFromUsers, type FileAction,
} from '@/lib/server/accessPolicy';
import type { IUser } from '@/lib/objects/User';
import type { IServer } from '@/lib/objects/Server';

export interface FileContext {
    user: IUser;
    server: IServer;
    /** Storage path of the server folder */
    base: string;
    /** Cleaned path inside the server folder, starting with `/` */
    rel: string;
    /** Storage path of the requested item */
    full: string;
}

const NOT_FOUND = { message: 'Not found.' };

/**
 * Resolves who is asking, which server and which file, and decides whether it is allowed. The one place every
 * file route goes through: users cannot reach hidden proxy files, and uploads and edits need the server's toggles.
 */
export async function authorizeFile(
    request: NextRequest,
    identifier: string | null | undefined,
    action: FileAction,
    relativePath = '/',
): Promise<FileContext | { response: NextResponse }> {
    await dbConnect();
    const user = await verificationService.getUserFromToken(request);
    if (!user || !user.isActive) return { response: NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 }) };
    if (!identifier) return { response: NextResponse.json({ message: 'A server identifier is required.' }, { status: 400 }) };

    const server = (await findServerForUser(user, identifier))
        ?? (identifier.includes('.') ? await findServerForUser(user, identifier.split('.')[0]) : null);
    if (!server) return { response: NextResponse.json({ message: 'Server not found.' }, { status: 404 }) };

    const rel = cleanRelativePath(relativePath);
    if (rel === null) return { response: NextResponse.json({ message: 'Invalid path.' }, { status: 400 }) };

    if (!user.isAdmin && isHiddenFromUsers(rel)) return { response: NextResponse.json(NOT_FOUND, { status: 404 }) };

    if (!canUseFiles(user, server, action)) {
        return { response: NextResponse.json({ message: FILE_ACCESS_DENIED[action as 'upload' | 'edit'], code: 'files-locked' }, { status: 403 }) };
    }

    const base = getServerFolderPath(server, server.email ?? user.email);
    return { user, server, base, rel, full: rel === '/' ? base : `${base}${rel}` };
}

export function isDenied(result: FileContext | { response: NextResponse }): result is { response: NextResponse } {
    return 'response' in result;
}
