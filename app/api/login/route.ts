import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/app/models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
    await dbConnect.connect();
    try {
        const { email, password } = await request.json();

        const user = await User.findOne({ email });
        if (!user) {
            return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
        }

        if (!user.isActive) {
            return NextResponse.json({ message: 'Your account has not been activated yet.' }, { status: 403 });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET || 'default',
            { expiresIn: '1h' }
        );

        const res = NextResponse.next();

        res.cookies.set('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV !== 'development',
            maxAge: 60 * 60, // 1 hour
            path: '/',
        });

        return NextResponse.json({ message: 'Login successful.' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'An error occurred.', error }, { status: 500 });
    }
}