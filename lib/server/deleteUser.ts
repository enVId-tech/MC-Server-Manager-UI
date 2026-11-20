import User, { IUser } from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import { deleteServer } from '@/lib/server/deleteServer';

export interface FailedServerDeletion {
    uniqueId: string;
    error?: string;
    details?: string[];
}

export interface UserDeletionResult {
    success: boolean;
    failedServers: FailedServerDeletion[];
}

/**
 * Deletes a user together with every server they own.
 *
 * The servers go first, because a container without an owner would keep running (and keep its port) forever.
 * When any server could not be removed completely the user is kept, so the deletion can simply be retried.
 */
export async function deleteUserWithServers(user: IUser, reason: string): Promise<UserDeletionResult> {
    // Servers are linked to their owner by email
    const servers = await Server.find({ email: user.email });

    const failedServers: FailedServerDeletion[] = [];
    for (const server of servers) {
        const result = await deleteServer(server.uniqueId, server.toObject(), user, reason);
        if (!result.success) {
            failedServers.push({ uniqueId: server.uniqueId, error: result.error, details: result.details });
        }
    }

    if (failedServers.length > 0) {
        return { success: false, failedServers };
    }

    await User.deleteOne({ _id: user._id });

    return { success: true, failedServers: [] };
}
