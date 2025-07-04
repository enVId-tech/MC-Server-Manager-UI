import { NextRequest, NextResponse } from 'next/server';
import dbConnect from "@/lib/db/dbConnect";
import User from "@/lib/objects/User";
import jwt from "jsonwebtoken";

export async function DELETE(request: NextRequest) { // Removed 'response: NextResponse'
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

        // Clear the session token from the database
        user.sessionToken = null;
        await user.save();

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