import { NextRequest, NextResponse } from 'next/server';
import dbConnect from "@/lib/db/dbConnect";
import User, { IUser } from "@/lib/objects/User";
import verificationService from '@/lib/server/verify';

export async function DELETE(request: NextRequest) { // Removed 'response: NextResponse'
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Clear the session token from the database
        await User.updateOne({ email: user.email }, { $set: { sessionToken: null } });

        // Create a new NextResponse and clear the cookie
        const res = NextResponse.json({ message: 'Logout successful.' }, { status: 200 });
        res.cookies.delete('sessionToken'); // Correctly delete the cookie

        return res;
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Logout error:", error);
            return NextResponse.json({ message: 'An error occurred during logout.', error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: 'An unknown error occurred during logout.' }, { status: 500 });
    }
}