import {NextRequest, NextResponse} from 'next/server';
import dbConnect from '@/lib/dbConnect';
import jwt from 'jsonwebtoken';
import User from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import bcrypt from 'bcryptjs';

// PUT request to update user information based on provided email and password
// Email or password may not be provided at the same time, but at least one must be provided.
// GET request to retrieve user information and owned servers

export async function PUT(request: NextRequest) {
    await dbConnect();
    try {
        const { email, currentPassword, newPassword } = await request.json();

        // If the email doesn't exist or the current password and new password are not provided, return an error
        
        // TODO: Change the currentPassword and newPassword to be both !password, however keep it as is for now
        // to prevent password logins from breaking.
        // This is because bcrypt is being weird and not hashing the password correctly.
        // This is a temporary fix until the password hashing issue is resolved.
        if (!email && (!currentPassword || !newPassword)) {
            return NextResponse.json({ message: 'Email or current password and new password are required.' }, { status: 400 });
        }

        // Get the user from the request cookies
        const token = request.cookies.get('sessionToken')?.value;

        if (!token) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default');

        if (!decoded) {
            return NextResponse.json({ message: 'Invalid session token.' }, { status: 401 });
        }

        // Find the user by ID from the decoded token
        const userId = (decoded as { id: string }).id;
        const existingUser = await User.findById(userId);

        if (!existingUser) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Check if the user is active
        if (!existingUser.isActive) {
            return NextResponse.json({ message: 'Your account has not been activated yet.' }, { status: 403 });
        }

        // Check if the email is already in use by another user
        const emailExists = await User.findOne({ email });

        if (emailExists && emailExists._id.toString() !== existingUser._id.toString()) {
            return NextResponse.json({ message: 'Email is already in use by another account.' }, { status: 409 });
        }

        // If the password is provided, hash it before saving
        if (newPassword) {
            const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, existingUser.password);
            if (!isCurrentPasswordCorrect) {
                return NextResponse.json({ message: 'Current password is incorrect.' }, { status: 403 });
            }
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            existingUser.password = hashedNewPassword;
        }

        // If the email is provided, update it
        if (email) {
            existingUser.email = email;
        }

        // Save the updated user information
        await existingUser.save();

        return NextResponse.json({ message: 'User information updated successfully.' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'An error occurred.', error }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        // Get the user from the request cookies
        const token = request.cookies.get('sessionToken')?.value;
        if (!token) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default');
        if (!decoded) {
            return NextResponse.json({ message: 'Invalid session token.' }, { status: 401 });
        }

        // Find the user by ID from the decoded token
        const user = await User.findById((decoded as { id: string }).id);
        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Check what servers the user owns
        const ownedServers = await Server.find({ owner: user._id });
        if (!ownedServers) {
            return NextResponse.json({ message: 'No servers found for this user.' }, { status: 404 });
        }

        // Include owned servers in the user response
        user.ownedServers = ownedServers.map(server => ({
            isOnline: server.isOnline,
            name: server.name,
        }));

        // User information to be returned
        const userInfo = {
            id: user._id,
            email: user.email,
            isActive: user.isActive,
            createdAt: user.createdAt,
        };

        return NextResponse.json({ user: userInfo, ownedServers: user.ownedServers }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'An error occurred.', error }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    await dbConnect();
    try {
        // Get the user from the request cookies
        const token = request.cookies.get('sessionToken')?.value;
        if (!token) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }
        
        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default');
        if (!decoded) {
            return NextResponse.json({ message: 'Invalid session token.' }, { status: 401 });
        }

        // Find the user by ID from the decoded token
        const userId = (decoded as { id: string }).id;
        const user = await User.findById(userId);
        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Delete the user and their servers
        await User.deleteOne({ _id: userId });
        await Server.deleteMany({ owner: userId });
        return NextResponse.json({ message: 'Account deleted successfully.' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'An error occurred.', error }, { status: 500 });
    }
}