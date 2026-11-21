import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import { adoptFor, adoptForSoleAdmin, ignoreServers, listOwnerChoices, listPendingServers } from '@/lib/server/existingServers';

async function requireAdmin(request: NextRequest) {
    const user = await verificationService.getUserFromToken(request);
    return user && user.isAdmin && user.isActive && !user.impersonation ? user : null;
}

/**
 * What an administrator is asked right after logging in. With one administrator the found servers are added to
 * that account and reported in `adopted`; with several, `pending` lists them so the admin picks the owner.
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ pending: [], owners: [], adopted: 0 });
    try {
        const adopted = (await adoptForSoleAdmin()).filter(result => result.success).length;
        const pending = (await listPendingServers()).filter(candidate => candidate.reachable);
        return NextResponse.json({
            adopted,
            pending: pending.map(candidate => ({ key: candidate.key, name: candidate.name, type: candidate.type, version: candidate.version, source: candidate.source, state: candidate.state, notes: candidate.notes })),
            owners: pending.length > 0 ? await listOwnerChoices() : [],
            you: admin.email,
        });
    } catch (error) {
        return NextResponse.json({ pending: [], owners: [], adopted: 0, error: error instanceof Error ? error.message : 'Scan failed' });
    }
}

/** Body: { keys: string[], ownerEmail?: string } adds them. { ignore: string[] } stops asking about those */
export async function POST(request: NextRequest) {
    await dbConnect();
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ message: 'Administrator access required.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 200) : []);
    try {
        if (strings(body.ignore).length > 0) {
            await ignoreServers(strings(body.ignore));
            return NextResponse.json({ success: true, message: 'These servers will not be offered again.' });
        }
        const keys = strings(body.keys);
        if (keys.length === 0) return NextResponse.json({ message: 'Choose at least one server.' }, { status: 400 });
        const { results, owner } = await adoptFor(keys, admin, typeof body.ownerEmail === 'string' ? body.ownerEmail : undefined);
        const added = results.filter(result => result.success).length;
        return NextResponse.json({ success: added > 0, message: `Added ${added} of ${results.length} server${results.length === 1 ? '' : 's'} to ${owner}.`, results }, { status: added > 0 ? 200 : 422 });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : 'Import failed.' }, { status: 500 });
    }
}
