import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import User from '@/lib/objects/User';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '@/lib/server/jwt';

// Real bcrypt hash of a random password nobody knows, only used to keep the response time similar when the email is unknown
const DUMMY_PASSWORD_HASH = '$2b$10$SB8spfgFkh8mk4O43WBaEuXwkAEv/GzYvyjHtDNePItZSSPthSoqC';

export async function POST(request: Request) {
    await dbConnect();
    try {
        const { email, password } = await request.json();

        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
        }

        // Find the user by email (emails are stored trimmed and in lower case)
        const user = await User.findOne({ email: email.trim().toLowerCase() });

        // Always run a password comparison and answer with one message for both failures, so the response
        // does not reveal which emails have an account
        const isPasswordCorrect = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);

        if (!user || !isPasswordCorrect) {
            return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
        }

        if (!user.isActive) {
            return NextResponse.json({ message: 'Your account has not been activated yet.' }, { status: 403 });
        }

        // Generate a JWT token
        const token = jwt.sign(
            { id: user._id, email: user.email },
            getJwtSecret(),
            { expiresIn: '24h' }
        );

        // Update the user document with the session token
        user.sessionToken = token;
        await user.save();

        const response = NextResponse.json({ message: 'Login successful.' }, { status: 200 });

        // Set the sessionToken cookie
        response.cookies.set('sessionToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24,
            path: '/',
            sameSite: 'strict',
        });

        return response;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ message: 'An error occurred.', error: (error as Error).message }, { status: 500 });
    }
}