/**
 * Servers that exist on this machine but are not in the dashboard yet, and who gets them.
 *
 * With one administrator the servers that can be managed are added to that account right away. With several, the
 * next administrator who logs in is asked which account should own them (their own, by default).
 */
import dbConnect from '@/lib/db/dbConnect';
import PlatformSettings from '@/lib/objects/PlatformSettings';
import User, { type IUser } from '@/lib/objects/User';
import portainer from '@/lib/server/portainer';
import { discoverImportCandidates, importCandidates, type ImportCandidate, type ImportResult } from '@/lib/server/importServers';

export interface AdminChoice {
    email: string;
}

async function environmentId(): Promise<number> {
    const stored = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null;
    return portainer.getValidEnvironmentId(stored);
}

export async function getIgnoredKeys(): Promise<string[]> {
    await dbConnect();
    const stored = await PlatformSettings.findOne({ key: 'platform' }, 'ignoredImportKeys').lean<{ ignoredImportKeys?: string[] } | null>();
    return stored?.ignoredImportKeys ?? [];
}

export async function ignoreServers(keys: string[]): Promise<void> {
    await dbConnect();
    await PlatformSettings.updateOne({ key: 'platform' }, { $addToSet: { ignoredImportKeys: { $each: keys.slice(0, 200) } } }, { upsert: true });
    cache = null;
}

/** Accounts that can own imported servers: active users, administrators first */
export async function listOwnerChoices(): Promise<Array<{ email: string; isAdmin: boolean }>> {
    await dbConnect();
    const users = await User.find({ isActive: true }, 'email isAdmin').sort({ email: 1 }).lean<Array<{ email: string; isAdmin?: boolean }>>();
    return users.map(user => ({ email: user.email, isAdmin: Boolean(user.isAdmin) })).sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin));
}

let cache: { at: number; candidates: ImportCandidate[] } | null = null;

/** Found servers that nobody dismissed. Looked up at most every 30 seconds unless `force` is set */
export async function listPendingServers(force = false): Promise<ImportCandidate[]> {
    if (!force && cache && Date.now() - cache.at < 30_000) return cache.candidates;
    const [found, ignored] = await Promise.all([discoverImportCandidates(await environmentId()), getIgnoredKeys()]);
    const candidates = found.filter(candidate => !ignored.includes(candidate.key));
    cache = { at: Date.now(), candidates };
    return candidates;
}

let adopting: Promise<ImportResult[]> | null = null;

/**
 * When there is exactly one active administrator, adds every found server whose files can be reached to that
 * account. Does nothing with several administrators: they are asked instead.
 */
export function adoptForSoleAdmin(): Promise<ImportResult[]> {
    if (adopting) return adopting;
    adopting = (async () => {
        await dbConnect();
        const admins = await User.find({ isAdmin: true, isActive: true }).limit(2);
        if (admins.length !== 1) return [];
        const pending = (await listPendingServers(true)).filter(candidate => candidate.reachable);
        if (pending.length === 0) return [];
        const results = await importCandidates(pending.map(candidate => candidate.key), admins[0] as IUser, await environmentId());
        cache = null;
        const added = results.filter(result => result.success).length;
        if (added > 0) console.log(`[existing-servers] Added ${added} existing server(s) to ${admins[0].email}`);
        return results;
    })().catch(error => {
        console.warn('[existing-servers]', error instanceof Error ? error.message : error);
        return [] as ImportResult[];
    }).finally(() => { adopting = null; });
    return adopting;
}

/** Adds servers to the account `ownerEmail` (the administrator who answered the prompt when it is empty) */
export async function adoptFor(keys: string[], admin: IUser, ownerEmail?: string): Promise<{ results: ImportResult[]; owner: string }> {
    let owner: IUser = admin;
    const wanted = ownerEmail?.trim().toLowerCase();
    if (wanted && wanted !== admin.email) {
        const found = await User.findOne({ email: wanted, isActive: true });
        if (!found) throw new Error(`No active user with the email ${ownerEmail} exists.`);
        owner = found as IUser;
    }
    const results = await importCandidates(keys, owner, await environmentId());
    cache = null;
    return { results, owner: owner.email };
}
