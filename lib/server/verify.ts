import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import User, { IUser } from "../objects/User";

interface Token {
    status: number;
    token?: string;
    message?: string;
}

class VerificationService {
    /**
     * Retrieves the session token from the request cookies.
     * If the token is not found, it returns a 401 status with an appropriate message.
     * If an error occurs, it returns a 500 status with an error message.
     * @param request NextRequest - The request object containing cookies
     * @returns Token - An object containing the status and token if available
     */
    async getToken(request: NextRequest): Promise<Token> {
        try {
            // Check authentication
            const token = request.cookies.get('sessionToken')?.value;

            if (!token) {
                return { status: 401, message: 'No active session found.' };
            }
            return { status: 200, token };
        } catch (error) {
            console.error('Error getting token:', error);
            return { status: 500, message: 'Internal server error.' };
        }
    }

    /**
     * Verifies the session token from the request cookies.
     * If the token is valid, it decodes the token and returns the decoded data.
     * If the token is invalid or an error occurs, it returns an appropriate status and message.
        * @param request NextRequest - The request object containing cookies
     * @returns { status: number, decoded?: object, message?: string } - An object containing the status, decoded data if valid, or an error message 
    */
    async verifyToken(request: NextRequest) {
        try {
            // Check authentication
            const token: Token = await this.getToken(request);
            if (token.status !== 200 || !token.token) {
                return { status: token.status, message: token.message };
            }

            // Verify the token
            const decoded = jwt.verify(token.token, process.env.JWT_SECRET || 'default');
            if (!decoded) {
                return { status: 401, message: 'Invalid session token.' };
            }

            return { status: 200, decoded: decoded };
        } catch (error) {
            console.error('Error verifying account:', error);
            return { status: 500, message: 'Internal server error.' };
        }
    }

    /**
     * Retrieves the user information from the session token.
     * If the user is not found or an error occurs, it returns null or throws an error.
     * @param request NextRequest - The request object containing cookies
     * @returns IUser | null - The user object if found, otherwise null
     * @throws { Error } - Throws an error if an internal server error occurs
     */
    async getUserFromToken(request: NextRequest): Promise<IUser | null> {
        try {
            // Verify the token
            const verificationResult = await this.verifyToken(request);
            if (verificationResult.status !== 200) {
                return null; // Return null if verification failed
            }

            // Get user information from the decoded token
            const decoded = verificationResult.decoded;

            const user: IUser | null = await User.findById((decoded as { id: string }).id);
            if (!user) {
                return null;
            }

            return user;
        } catch (error) {
            console.error('Error getting user from token:', error);
            throw new Error('Internal server error.');
        }
    }
}

const verificationService = new VerificationService();

export default verificationService;