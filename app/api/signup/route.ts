import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/app/models/User';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    await dbConnect.connect();
    try {
        const { email, password } = await request.json();

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return NextResponse.json({ message: 'User with this email already exists.' }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            email,
            password: hashedPassword,
            isActive: false, // Account is inactive by default
        });

        await newUser.save();

        return NextResponse.json({ message: 'Account created. Please wait for an admin to activate it.' }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: 'An error occurred.', error }, { status: 500 });
    }
}