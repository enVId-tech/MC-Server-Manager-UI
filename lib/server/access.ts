import Server, { type IServer } from '@/lib/objects/Server';
import type { IUser } from '@/lib/objects/User';

/**
 * Finds a server by its id, subdomain or name for a user. Users only see their own game servers; administrators
 * see every server and, as the only ones, the proxies.
 */
export async function findServerForUser(user: IUser, identifier: string): Promise<IServer | null> {
    const match = { $or: [{ uniqueId: identifier }, { subdomainName: identifier }, { serverName: identifier }] };
    if (user.isAdmin) {
        // An id is exact; names can repeat between owners, the administrator's own server wins
        const byId = await Server.findOne({ uniqueId: identifier });
        if (byId) return byId;
        return (await Server.findOne({ $and: [{ email: user.email }, match] })) ?? (await Server.findOne(match));
    }
    return Server.findOne({ $and: [{ email: user.email }, { kind: { $ne: 'proxy' } }, match] });
}

/**
 * Query part that limits a server lookup to what the user may open: their own game servers, or anything for an
 * administrator (including the proxies).
 */
export function ownerFilter(user: IUser): Record<string, unknown> {
    return user.isAdmin ? {} : { email: user.email, kind: { $ne: 'proxy' } };
}
