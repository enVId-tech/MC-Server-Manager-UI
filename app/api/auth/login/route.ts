import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/objects/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
    await dbConnect.connect();
    try {
        const { email, password } = await request.json();

        // Find the user by email
        const user = await User.findOne({ email });
        if (!user) {
            // If user not found, return a 401 Unauthorized response
            return NextResponse.json({ message: 'Invalid credentials (no such email).' }, { status: 401 });
        }

        // Check if the user account is active
        if (!user.isActive) {
            // If account is not active, return a 403 Forbidden response
            return NextResponse.json({ message: 'Your account has not been activated yet.' }, { status: 403 });
        }

        // Compare the provided password with the hashed password in the database
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            // If passwords do not match, return a 401 Unauthorized response
            return NextResponse.json({ message: 'Invalid credentials (wrong password).' }, { status: 401 });
        }

        // Generate a JWT token for the authenticated user
        const token = jwt.sign(
            { id: user._id, email: user.email }, // Payload for the token
            process.env.JWT_SECRET || 'default', // Secret key for signing the token
            { expiresIn: '1h' } // Token expiration time
        );

        // Create a new NextResponse object to send back the response
        const response = NextResponse.json({ message: 'Login successful.' }, { status: 200 });

        // Set the sessionToken cookie on the response object
        response.cookies.set('sessionToken', token, {
            httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
            secure: process.env.NODE_ENV === 'production', // Send cookie only over HTTPS in production
            maxAge: 60 * 60, // Cookie expires in 1 hour (in seconds)
            path: '/', // Cookie is valid for all paths on the domain
            sameSite: 'strict', // Protects against CSRF attacks
        });

        // Return the response with the cookie set
        return response;
    } catch (error) {
        console.error('Login error:', error); // Log the error for debugging
        // Return a 500 Internal Server Error response in case of any unexpected error
        return NextResponse.json({ message: 'An error occurred.', error: (error as Error).message }, { status: 500 });
    }
}
