import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import dbConnect from '@/lib/db/dbConnect';
import { IUser } from '@/lib/objects/User';
import verificationService from '@/lib/server/verify';

type AuthResult = { user: IUser; response?: undefined } | { user?: undefined; response: NextResponse };

/**
 * Resolves the signed in, active user of a request.
 * Returns a ready made error response when there is none, so a route can simply return it.
 */
export async function requireUser(request: NextRequest): Promise<AuthResult> {
    await dbConnect();

    const user = await verificationService.getUserFromToken(request);

    if (!user) {
        return { response: NextResponse.json({ message: 'Authentication required.' }, { status: 401 }) };
    }

    if (!user.isActive) {
        return { response: NextResponse.json({ message: 'Your account has not been activated yet.' }, { status: 403 }) };
    }

    return { user };
}

/**
 * Same as requireUser, but the user has to be an administrator as well.
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
    const result = await requireUser(request);

    if (result.response) {
        return result;
    }

    if (!result.user.isAdmin) {
        return { response: NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 }) };
    }

    return result;
}

/**
 * Checks the `Authorization: Bearer <INTERNAL_API_KEY>` header used by schedulers.
 * Calls are always rejected while INTERNAL_API_KEY is not configured, instead of accepting "Bearer undefined".
 */
export function hasValidInternalApiKey(request: NextRequest): boolean {
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey) {
        return false;
    }

    const provided = Buffer.from(request.headers.get('authorization') ?? '');
    const expected = Buffer.from(`Bearer ${expectedKey}`);

    return provided.length === expected.length && timingSafeEqual(provided, expected);
}
