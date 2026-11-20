import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import portainer from '@/lib/server/portainer';
import User, { IUser } from '@/lib/objects/User';
import { discoverImportCandidates, importCandidates } from '@/lib/server/importServers';
import { getImportRoots } from '@/lib/server/importPaths';

async function resolveEnvironmentId(requested?: number | null): Promise<number> {
    const stored = requested ?? (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null);
    return portainer.getValidEnvironmentId(stored);
}

async function requireAdmin(request: NextRequest): Promise<IUser | null> {
    const user: IUser | null = await verificationService.getUserFromToken(request);
    return user && user.isAdmin ? user : null;
}

/** Servers found on this machine that are not in the dashboard yet. */
export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        if (!(await requireAdmin(request))) {
            return NextResponse.json({ message: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        const environmentId = await resolveEnvironmentId();
        const candidates = await discoverImportCandidates(environmentId);

        return NextResponse.json({
            candidates,
            scanFolders: getImportRoots().map(root => root.appPath),
        });
    } catch (error) {
        console.error('Import scan error:', error);
        return NextResponse.json({ message: 'Failed to look for existing servers.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

/** Add the chosen servers to the dashboard. Body: { keys: string[], ownerEmail?: string } */
export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        const admin = await requireAdmin(request);
        if (!admin) {
            return NextResponse.json({ message: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const keys: string[] = Array.isArray(body.keys) ? body.keys.filter((key: unknown): key is string => typeof key === 'string').slice(0, 100) : [];
        if (keys.length === 0) {
            return NextResponse.json({ message: 'Choose at least one server to import.' }, { status: 400 });
        }

        let owner: IUser = admin;
        if (typeof body.ownerEmail === 'string' && body.ownerEmail.trim() && body.ownerEmail.trim().toLowerCase() !== admin.email) {
            const found = await User.findOne({ email: body.ownerEmail.trim().toLowerCase() });
            if (!found) {
                return NextResponse.json({ message: `No user with the email ${body.ownerEmail} exists.` }, { status: 404 });
            }
            owner = found as IUser;
        }

        const environmentId = await resolveEnvironmentId();
        const results = await importCandidates(keys, owner, environmentId);
        const imported = results.filter(result => result.success).length;

        return NextResponse.json({
            message: `Imported ${imported} of ${results.length} server${results.length === 1 ? '' : 's'}.`,
            results,
        }, { status: imported > 0 ? 200 : 422 });
    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json({ message: 'Failed to import servers.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
