import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import { requireAdmin } from '@/lib/server/auth';
import { deleteUserWithServers } from '@/lib/server/deleteUser';

const MAX_SERVERS_LIMIT = 100;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET - List users with their server counts (admin only)
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (auth.response) {
            return auth.response;
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(parseInt(searchParams.get('page') || '1') || 1, 1);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20') || 20, 1), 100);
        const search = searchParams.get('search')?.trim();
        const status = searchParams.get('status'); // 'active', 'pending' or 'all'

        const query: Record<string, unknown> = {};
        if (search) {
            query.email = { $regex: escapeRegExp(search), $options: 'i' };
        }
        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'pending') {
            query.isActive = false;
        }

        const [users, total, serverCounts] = await Promise.all([
            // Never send password hashes or session tokens to the browser
            User.find(query)
                .select('email isActive isAdmin maxServers createdAt')
                .sort({ isActive: 1, createdAt: -1 }) // Accounts waiting for activation come first
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            User.countDocuments(query),
            Server.aggregate([{ $group: { _id: '$email', count: { $sum: 1 } } }]),
        ]);

        const countByEmail = new Map<string, number>(serverCounts.map((entry: { _id: string; count: number }) => [entry._id, entry.count]));

        return NextResponse.json({
            users: users.map((user: { _id: unknown; email: string; isActive: boolean; isAdmin: boolean; maxServers: number; createdAt?: Date }) => ({
                id: String(user._id),
                email: user.email,
                isActive: user.isActive,
                isAdmin: user.isAdmin,
                maxServers: user.maxServers,
                serverCount: countByEmail.get(user.email) ?? 0,
                createdAt: user.createdAt,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1),
            },
        });
    } catch (error) {
        console.error('Error listing users:', error);
        return NextResponse.json({ message: 'Failed to list users.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

// PATCH - Activate, deactivate, promote or change the server limit of a user (admin only)
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (auth.response) {
            return auth.response;
        }

        const { userId, isActive, isAdmin, maxServers } = await request.json();

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return NextResponse.json({ message: 'A valid userId is required.' }, { status: 400 });
        }

        const isSelf = String(auth.user._id) === String(userId);
        const update: Record<string, unknown> = {};

        if (isActive !== undefined) {
            if (typeof isActive !== 'boolean') {
                return NextResponse.json({ message: 'isActive must be true or false.' }, { status: 400 });
            }
            if (isSelf && !isActive) {
                return NextResponse.json({ message: 'You can not deactivate your own account.' }, { status: 400 });
            }
            update.isActive = isActive;
        }

        if (isAdmin !== undefined) {
            if (typeof isAdmin !== 'boolean') {
                return NextResponse.json({ message: 'isAdmin must be true or false.' }, { status: 400 });
            }
            if (isSelf && !isAdmin) {
                return NextResponse.json({ message: 'You can not remove your own administrator rights.' }, { status: 400 });
            }
            update.isAdmin = isAdmin;
        }

        if (maxServers !== undefined) {
            if (!Number.isInteger(maxServers) || maxServers < 0 || maxServers > MAX_SERVERS_LIMIT) {
                return NextResponse.json({ message: `maxServers must be a whole number between 0 and ${MAX_SERVERS_LIMIT}.` }, { status: 400 });
            }
            update.maxServers = maxServers;
        }

        if (Object.keys(update).length === 0) {
            return NextResponse.json({ message: 'Nothing to update.' }, { status: 400 });
        }

        // Taking away access must also end sessions that are already signed in
        if (update.isActive === false || update.isAdmin === false) {
            update.sessionToken = null;
        }

        const updated = await User.findByIdAndUpdate(userId, { $set: update }, { new: true })
            .select('email isActive isAdmin maxServers');

        if (!updated) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        return NextResponse.json({
            message: 'User updated successfully.',
            user: {
                id: String(updated._id),
                email: updated.email,
                isActive: updated.isActive,
                isAdmin: updated.isAdmin,
                maxServers: updated.maxServers,
            },
        });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ message: 'Failed to update user.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

// DELETE - Delete a user together with all of their servers (admin only)
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAdmin(request);
        if (auth.response) {
            return auth.response;
        }

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return NextResponse.json({ message: 'A valid userId is required.' }, { status: 400 });
        }

        if (String(auth.user._id) === userId) {
            return NextResponse.json({ message: 'You can not delete your own account here. Use the account page instead.' }, { status: 400 });
        }

        const user = await User.findById(userId);
        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const deletion = await deleteUserWithServers(user, 'admin-user-deletion');

        if (!deletion.success) {
            return NextResponse.json({
                message: 'Some servers could not be fully removed, so the user was not deleted.',
                failedServers: deletion.failedServers,
            }, { status: 500 });
        }

        return NextResponse.json({ message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ message: 'Failed to delete user.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
