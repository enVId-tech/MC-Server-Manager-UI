// Checks if there is an active session token in the request cookies
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import verificationService from "@/lib/server/verify";

export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

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