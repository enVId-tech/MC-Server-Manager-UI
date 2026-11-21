import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/db/dbConnect';
import User from '@/lib/objects/User';
import verificationService, { IMPERSONATION_COOKIE, type ImpersonationMode } from '@/lib/server/verify';
import { getJwtSecret } from '@/lib/server/jwt';

const MAX_AGE_SECONDS = 4 * 60 * 60;

async function realAdmin(request: NextRequest) {
    await dbConnect();
    const user = await verificationService.getRealUser(request);
    return user && user.isActive && user.isAdmin ? user : null;
}

/**
 * GET    /api/admin/impersonate   whether the signed in administrator is acting as somebody else
 * POST   /api/admin/impersonate   { mode: 'preview' }                    see the site as an ordinary user
 *                                 { mode: 'user' | 'admin', userId }     act as another active account;
 *                                                                        'admin' keeps administrator rights
 * DELETE /api/admin/impersonate   go back to your own account
 */
export async function GET(request: NextRequest) {
    const admin = await realAdmin(request);
    if (!admin) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
    const effective = await verificationService.getUserFromToken(request);
    return NextResponse.json({
        success: true,
        impersonating: effective?.impersonation ? { as: effective.email, mode: effective.impersonation.mode } : null,
    });
}

export async function POST(request: NextRequest) {
    const admin = await realAdmin(request);
    if (!admin) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const mode = body.mode as ImpersonationMode;
    if (mode !== 'preview' && mode !== 'user' && mode !== 'admin') return NextResponse.json({ message: 'Unknown mode.' }, { status: 400 });

    let target: { _id: unknown; email: string } | null = admin;
    if (mode !== 'preview') {
        target = typeof body.userId === 'string' ? await User.findById(body.userId) : null;
        if (!target) return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        if (!(target as unknown as { isActive: boolean }).isActive) return NextResponse.json({ message: 'That account is not active.' }, { status: 400 });
    }

    console.warn(`[impersonation] ${admin.email} started ${mode} as ${target.email}`);
    const token = jwt.sign({ typ: 'impersonation', admin: String(admin._id), target: mode === 'preview' ? null : String(target._id), mode }, getJwtSecret(), { expiresIn: MAX_AGE_SECONDS });
    const response = NextResponse.json({ success: true, as: target.email, mode });
    response.cookies.set(IMPERSONATION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: MAX_AGE_SECONDS, path: '/', sameSite: 'strict' });
    return response;
}

export async function DELETE(request: NextRequest) {
    const admin = await realAdmin(request);
    if (!admin) return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
    console.warn(`[impersonation] ${admin.email} stopped`);
    const response = NextResponse.json({ success: true });
    response.cookies.delete(IMPERSONATION_COOKIE);
    return response;
}
