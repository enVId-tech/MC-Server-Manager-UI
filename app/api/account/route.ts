import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import User, { IUser } from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import bcrypt from 'bcrypt';
import verificationService from '@/lib/server/verify';
import { deleteServer } from "@/lib/server/deleteServer";

const EMAIL_PATTERN = /.+@.+\..+/;
const MIN_PASSWORD_LENGTH = 6;

// PUT request to update the email and/or password of the signed in user.
// Email or password may be provided together, but at least one must be provided.
// GET request to retrieve user information and owned servers
// DELETE request to delete the signed in user together with all of their servers

export async function PUT(request: NextRequest) {
    await dbConnect();
    try {
        const existingUser: IUser | null = await verificationService.getUserFromToken(request);

        if (!existingUser) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Check if the user is active
        if (!existingUser.isActive) {
            return NextResponse.json({ message: 'Your account has not been activated yet.' }, { status: 403 });
        }

        const { email, currentPassword, newPassword } = await request.json();

        if (!email && !newPassword) {
            return NextResponse.json({ message: 'A new email or a new password is required.' }, { status: 400 });
        }

        const previousEmail = existingUser.email;
        let emailChanged = false;

        if (email) {
            const normalizedEmail = String(email).trim().toLowerCase();

            if (!EMAIL_PATTERN.test(normalizedEmail)) {
                return NextResponse.json({ message: 'Please enter a valid email address.' }, { status: 400 });
            }

            if (normalizedEmail !== previousEmail) {
                // Check if the email is already in use by another user
                const emailExists = await User.findOne({ email: normalizedEmail, _id: { $ne: existingUser._id } });
                if (emailExists) {
                    return NextResponse.json({ message: 'Email is already in use by another account.' }, { status: 409 });
                }

                existingUser.email = normalizedEmail;
                emailChanged = true;
            }
        }

        if (newPassword) {
            if (!currentPassword) {
                return NextResponse.json({ message: 'The current password is required to set a new password.' }, { status: 400 });
            }

            if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
                return NextResponse.json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` }, { status: 400 });
            }

            const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, existingUser.password);
            if (!isCurrentPasswordCorrect) {
                return NextResponse.json({ message: 'Current password is incorrect.' }, { status: 403 });
            }

            // The user model hashes the password in its pre-save hook
            existingUser.password = newPassword;
        }

        // Save the updated user information (the document is saved by its id, never looked up by the new email)
        await existingUser.save();

        // Servers belong to a user by email, so they have to follow the new address
        if (emailChanged) {
            await Server.updateMany({ email: previousEmail }, { $set: { email: existingUser.email } });
        }

        return NextResponse.json({ message: 'User information updated successfully.' }, { status: 200 });
    } catch (error) {
        console.error('Account update error:', error);
        return NextResponse.json({ message: 'An error occurred.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        // Servers are linked to their owner by email
        const servers = await Server.find({ email: user.email });
        const ownedServers = servers.map(server => ({
            uniqueId: server.uniqueId,
            name: server.serverName,
            subdomain: server.subdomainName,
            isOnline: server.isOnline,
        }));

        // User information to be returned
        const userInfo = {
            id: user._id,
            email: user.email,
            isActive: user.isActive,
            maxServers: user.maxServers,
            createdAt: user.createdAt,
        };

        return NextResponse.json({ user: userInfo, ownedServers }, { status: 200 });
    } catch (error) {
        console.error('Account fetch error:', error);
        return NextResponse.json({ message: 'An error occurred.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    await dbConnect();
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
        }

        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        if (user.email !== String(email).trim().toLowerCase()) {
            return NextResponse.json({ message: 'Email mismatch.' }, { status: 403 });
        }

        // Verify password
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return NextResponse.json({ message: 'Incorrect password.' }, { status: 403 });
        }

        // Find all servers owned by user (servers are linked to their owner by email)
        const servers = await Server.find({ email: user.email });

        // Delete all servers before the account, otherwise their containers would keep running without an owner
        const failedServers: { uniqueId: string; error?: string; details?: string[] }[] = [];
        for (const server of servers) {
            const result = await deleteServer(server.uniqueId, server.toObject(), user, 'account-deletion');
            if (!result.success) {
                failedServers.push({ uniqueId: server.uniqueId, error: result.error, details: result.details });
            }
        }

        if (failedServers.length > 0) {
            return NextResponse.json({
                message: 'Some servers could not be fully removed, so the account was not deleted. Please try again.',
                failedServers
            }, { status: 500 });
        }

        // Delete user
        await User.deleteOne({ _id: user._id });

        // Clear session cookie
        const response = NextResponse.json({ message: 'Account deleted successfully.' }, { status: 200 });
        response.cookies.delete('sessionToken');

        return response;

    } catch (error) {
        console.error('Account deletion error:', error);
        return NextResponse.json({ message: 'An error occurred during account deletion.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
