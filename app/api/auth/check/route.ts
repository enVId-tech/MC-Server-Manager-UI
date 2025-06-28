// Checks if there is an active session token in the request cookies
import {NextRequest, NextResponse} from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import jwt from "jsonwebtoken";
import User from "@/lib/objects/User";

export async function GET(request: NextRequest) {
    await dbConnect();
    try {
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

        // Check if the user is active
        if (!user.isActive) {
            return NextResponse.json({ message: 'Your account has not been activated yet.' }, { status: 403 });
        }

        return NextResponse.json({ status: 200 });
    } catch (error) {
        console.error('Session check error:', error);
        return NextResponse.json({ message: 'An error occurred while checking the session.', error: (error as Error).message }, { status: 500 });
    }
}