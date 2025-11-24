import { NextRequest, NextResponse } from "next/server";
import { proxyManager } from "@/lib/server/proxy-manager";
import verificationService from "@/lib/server/verify";
import { IUser } from "@/lib/objects/User";
import dbConnect from "@/lib/db/dbConnect";

export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        // Verify admin access
        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user || !user.isAdmin) {
            return NextResponse.json({ message: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        const { environmentId } = await request.json();
        const targetEnvId = environmentId || (process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1);

        // Perform scan
        const result = await proxyManager.scanAndRegisterProxies(targetEnvId);

        return NextResponse.json({
            message: 'Proxy scan completed.',
            result
        }, { status: 200 });

    } catch (error) {
        console.error('Proxy scan error:', error);
        return NextResponse.json({ 
            message: 'Failed to scan for proxies.', 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}
