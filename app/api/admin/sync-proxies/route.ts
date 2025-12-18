import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import { IUser } from '@/lib/objects/User';
import verificationService from '@/lib/server/verify';
import proxyManager from '@/lib/server/proxy-manager';
import portainer from '@/lib/server/portainer';
import { getDefinedProxies } from '@/lib/config/proxies';

/**
 * POST /api/admin/sync-proxies
 * Manually trigger proxy synchronization (admin only)
 */
export async function POST(request: NextRequest) {
    await dbConnect();
    
    try {
        // Verify admin authentication
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ 
                message: 'Administrative privileges required.' 
            }, { status: 403 });
        }
        
        // Get environment ID (auto-discover if needed)
        const storedEnvId = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null;
        const environmentId = await portainer.getValidEnvironmentId(storedEnvId);
        
        // Load proxies from YAML
        const proxies = getDefinedProxies();
        
        console.log(`[Proxy Sync] Manual sync triggered by admin ${user.email}. Found ${proxies.length} proxies in config.`);
        
        // Ensure proxies exist
        const details = await proxyManager.ensureProxies(environmentId);
        
        return NextResponse.json({
            success: true,
            message: 'Proxy synchronization completed',
            proxiesCount: proxies.length,
            details
        });
    } catch (error) {
        console.error('[Proxy Sync] Manual sync failed:', error);
        
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred',
            error: String(error)
        }, { status: 500 });
    }
}

/**
 * GET /api/admin/sync-proxies
 * Get current proxy status (admin only)
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    
    try {
        // Verify admin authentication
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ 
                message: 'Administrative privileges required.' 
            }, { status: 403 });
        }
        
        const proxies = getDefinedProxies();
        const registered = proxyManager.getAllProxies();
        
        return NextResponse.json({
            success: true,
            defined: proxies,
            registered: registered.map(p => ({
                id: p.id,
                name: p.name,
                type: p.type,
                host: p.host,
                port: p.port,
                enabled: p.enabled,
                healthStatus: p.healthStatus
            }))
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred',
            error: String(error)
        }, { status: 500 });
    }
}
