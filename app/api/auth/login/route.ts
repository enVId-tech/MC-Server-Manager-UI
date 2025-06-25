import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/objects/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request: Request, response: NextResponse) {
    await dbConnect.connect();
    try {
        const { email, password } = await request.json();

        const user = await User.findOne({ email });
        if (!user) {
            return NextResponse.json({ message: 'Invalid credentials (no such email).' }, { status: 401 });
        }

        if (!user.isActive) {
            return NextResponse.json({ message: 'Your account has not been activated yet.' }, { status: 403 });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return NextResponse.json({ message: 'Invalid credentials (wrong password).' }, { status: 401 });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET || 'default',
            { expiresIn: '1h' }
        );

        response.cookies.set('sessionToken', token, { maxAge: 60 * 60 })

        return NextResponse.json({ message: 'Login successful.' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'An error occurred.', error }, { status: 500 });
    }
}