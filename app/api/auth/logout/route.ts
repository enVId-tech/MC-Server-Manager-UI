import { NextRequest, NextResponse } from 'next/server';
import dbConnect from "@/lib/db/dbConnect";
import User, { IUser } from "@/lib/objects/User";
import verificationService, { IMPERSONATION_COOKIE } from '@/lib/server/verify';

export async function DELETE(request: NextRequest) { // Removed 'response: NextResponse'
    await dbConnect();
    try {
        // The signed in account itself, not the one an administrator may be acting as
        const user: IUser | null = await verificationService.getRealUser(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Clear the session token from the database
        await User.updateOne({ email: user.email }, { $set: { sessionToken: null } });

        // Create a new NextResponse and clear the cookie
        const res = NextResponse.json({ message: 'Logout successful.' }, { status: 200 });
        res.cookies.delete('sessionToken'); // Correctly delete the cookie
        res.cookies.delete(IMPERSONATION_COOKIE);

        return res;
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Logout error:", error);
            return NextResponse.json({ message: 'An error occurred during logout.', error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: 'An unknown error occurred during logout.' }, { status: 500 });
    }
}