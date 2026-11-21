import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import User, { IUser } from "../objects/User";
import { getJwtSecret } from './jwt';

export const IMPERSONATION_COOKIE = 'impersonation';

export type ImpersonationMode = 'preview' | 'user' | 'admin';

interface ImpersonationClaim {
    typ: 'impersonation';
    admin: string;
    target: string | null;
    mode: ImpersonationMode;
}

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
            const decoded = jwt.verify(token.token, getJwtSecret());
            if (!decoded) {
                return { status: 401, message: 'Invalid session token.' };
            }

            return { status: 200, decoded: decoded, token: token.token };
        } catch (error) {
            // Expired or malformed tokens are the client's problem, not a server error
            if (error instanceof jwt.JsonWebTokenError) {
                return { status: 401, message: error instanceof jwt.TokenExpiredError ? 'Session expired.' : 'Invalid session token.' };
            }
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

            // The token must still be the one stored on the user, otherwise it was invalidated by a
            // logout or by a newer login and must not be accepted anymore
            if (!user.sessionToken || user.sessionToken !== verificationResult.token) {
                return null;
            }

            return (await this.applyImpersonation(request, user)) ?? user;
        } catch (error) {
            console.error('Error getting user from token:', error);
            throw new Error('Internal server error.');
        }
    }

    /**
     * The administrator behind the session, whatever they are impersonating at the moment.
     * Only the impersonation endpoints use it: everything else sees the effective user.
     */
    async getRealUser(request: NextRequest): Promise<IUser | null> {
        try {
            const verification = await this.verifyToken(request);
            if (verification.status !== 200) return null;
            const user: IUser | null = await User.findById((verification.decoded as { id: string }).id);
            if (!user || !user.sessionToken || user.sessionToken !== verification.token) return null;
            return user;
        } catch {
            return null;
        }
    }

    /**
     * Applies the impersonation cookie of an administrator. The cookie is a signed token that names the administrator
     * and the account being used, and is ignored unless it belongs to the signed in administrator.
     * Three modes: `preview` (the administrator as an ordinary user), `user` (another account, with that account's
     * rights) and `admin` (another account, keeping administrator rights to act on their behalf).
     */
    private async applyImpersonation(request: NextRequest, real: IUser): Promise<IUser | null> {
        const raw = request.cookies.get(IMPERSONATION_COOKIE)?.value;
        if (!raw || !real.isAdmin) return null;

        let claim: ImpersonationClaim;
        try {
            claim = jwt.verify(raw, getJwtSecret()) as ImpersonationClaim;
        } catch {
            return null;
        }
        if (claim.typ !== 'impersonation' || claim.admin !== String(real._id)) return null;

        const target = claim.mode === 'preview' ? real : await User.findById(claim.target);
        if (!target || !target.isActive) return null;

        // Own properties shadow the stored fields on this instance only. Nothing here can be saved to the database
        Object.defineProperty(target, 'impersonation', { value: { by: real.email, mode: claim.mode }, enumerable: false });
        if (claim.mode === 'preview') Object.defineProperty(target, 'isAdmin', { value: false, enumerable: false });
        if (claim.mode === 'admin') Object.defineProperty(target, 'isAdmin', { value: true, enumerable: false });
        return target;
    }
}

const verificationService = new VerificationService();

export default verificationService;