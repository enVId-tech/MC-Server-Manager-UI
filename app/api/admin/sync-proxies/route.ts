import { NextRequest, NextResponse } from 'next/server';
import proxyManager from '@/lib/server/proxy-manager';
import { getDefinedProxies } from '@/lib/config/proxies';

/**
 * POST /api/admin/sync-proxies
 * Manually trigger proxy synchronization
 */
export async function POST(request: NextRequest) {
    try {
        // Get environment ID
        const environmentId = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : 1;
        
        // Load proxies from YAML
        const proxies = getDefinedProxies();
        
        console.log(`[Proxy Sync] Manual sync triggered. Found ${proxies.length} proxies in config.`);
        
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
 * Get current proxy status
 */
export async function GET(request: NextRequest) {
    try {
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
