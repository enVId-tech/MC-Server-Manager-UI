import {NextRequest, NextResponse} from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/objects/User';

export async function POST(request: NextRequest) {
    await dbConnect;
    try {
        const { email, password } = await request.json();

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return NextResponse.json({ message: 'User with this email already exists.' }, { status: 409 });
        }

        const newUser = new User({
            email: email,
            password: password,
            isActive: false,
        });

        await newUser.save();

        return NextResponse.json({ message: 'Account created. Please wait for an admin to activate it.' }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: 'An error occurred.', error }, { status: 500 });
    }
}