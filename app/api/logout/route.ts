import { NextResponse } from 'next/server';

export async function POST() {
    try {
        const res = NextResponse.next();

        res.cookies.set('token', '', {
            httpOnly: true,
            expires: new Date(0),
            path: '/',
        });
        return NextResponse.json({ message: 'Logout successful.' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'An error occurred.', error }, { status: 500 });
    }
}