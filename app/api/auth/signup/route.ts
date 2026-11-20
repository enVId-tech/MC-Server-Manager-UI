import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import User from '@/lib/objects/User';

const EMAIL_PATTERN = /.+@.+\..+/;
const MIN_PASSWORD_LENGTH = 6;

/**
 * Addresses listed in ADMIN_EMAILS (comma separated) become active administrators when they sign up.
 */
function getBootstrapAdminEmails(): string[] {
    return (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(Boolean);
}

export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        const { email, password } = await request.json();

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            return NextResponse.json({ message: 'Please enter a valid email address.' }, { status: 400 });
        }

        if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
            return NextResponse.json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` }, { status: 400 });
        }

        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            return NextResponse.json({ message: 'User with this email already exists.' }, { status: 409 });
        }

        // Nobody could activate the very first account, so it becomes the administrator. Addresses listed in
        // ADMIN_EMAILS are treated the same way.
        const isFirstUser = (await User.countDocuments({})) === 0;
        const isBootstrapAdmin = isFirstUser || getBootstrapAdminEmails().includes(normalizedEmail);

        const newUser = new User({
            email: normalizedEmail,
            password: password,
            isActive: isBootstrapAdmin,
            isAdmin: isBootstrapAdmin,
        });

        await newUser.save();

        return NextResponse.json({
            message: isBootstrapAdmin
                ? 'Administrator account created. You can sign in now.'
                : 'Account created. Please wait for an admin to activate it.'
        }, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.name === 'ValidationError') {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }

        console.error('Signup error:', error);
        return NextResponse.json({ message: 'An error occurred.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
