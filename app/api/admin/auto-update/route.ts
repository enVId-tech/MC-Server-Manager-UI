import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { getLastAutoUpdate, runAutoUpdate } from '@/lib/server/autoUpdate';
import { checkStartFailures } from '@/lib/server/startGuard';

/** GET the result of the last image update run. POST { action: 'run' | 'guard' } runs one now (the window is ignored) */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    return NextResponse.json({ success: true, last: getLastAutoUpdate() });
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    if (body.action === 'guard') return NextResponse.json({ success: true, stopped: await checkStartFailures() });
    return NextResponse.json({ success: true, last: await runAutoUpdate({ force: true }) });
}
