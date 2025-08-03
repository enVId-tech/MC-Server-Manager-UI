import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Server from "@/lib/objects/Server";
import verificationService from "@/lib/server/verify";
import proxyManager, { ProxyType, ServerProxyConfig, ProxyInstanceConfig } from "@/lib/server/proxy-manager";
import BodyParser from "@/lib/db/bodyParser";
import portainer from "@/lib/server/portainer";

import { IServer } from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";

export async function GET(request: NextRequest) {
    try {
        await dbConnect();
        
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');
        
        switch (action) {
            case 'list-proxies':
                return handleListProxies(request);
            case 'proxy-statistics':
                return handleProxyStatistics();
            case 'health-check':
                return handleHealthCheck();
            default:
                return NextResponse.json(
                    { success: false, error: 'Invalid action parameter' },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('Multi-proxy API error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        await dbConnect();
        
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');
        
        switch (action) {
            case 'deploy-multi':
                return handleMultiProxyDeploy(request);
            case 'configure-proxy':
                return handleConfigureProxy(request);
            case 'test-compatibility':
                return handleTestCompatibility(request);
            default:
                return NextResponse.json(
                    { success: false, error: 'Invalid action parameter' },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('Multi-proxy API error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function handleListProxies(request: NextRequest): Promise<NextResponse> {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') as ProxyType | null;
        const enabledOnly = searchParams.get('enabled') === 'true';
        
        let proxies = proxyManager.getAllProxies();
        
        if (type) {
            proxies = proxyManager.getProxiesByType(type);
        }
        
        if (enabledOnly) {
            proxies = proxies.filter(proxy => proxy.enabled);
        }
        
        return NextResponse.json({
            success: true,
            proxies,
            count: proxies.length
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function handleProxyStatistics(): Promise<NextResponse> {
    try {
        const statistics = proxyManager.getProxyStatistics();
        
        return NextResponse.json({
            success: true,
            statistics
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function handleHealthCheck(): Promise<NextResponse> {
    try {
        const healthResults = await proxyManager.performHealthChecks();
        
        return NextResponse.json({
            success: true,
            health: healthResults
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function handleMultiProxyDeploy(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await BodyParser.parseJSON(request);
        
        const { 
            serverId,
            targetProxies,
            loadBalancingStrategy,
            fallbackProxies,
            proxySpecificConfig
        } = body;
        
        if (!serverId) {
            return NextResponse.json(
                { success: false, error: 'serverId is required' },
                { status: 400 }
            );
        }
        
        // Verify user authentication
        const user = await verificationService.getUserFromToken(request);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }
        
        // Get server
        const server = await Server.findOne({ uniqueId: serverId });
        if (!server) {
            return NextResponse.json(
                { success: false, error: 'Server not found' },
                { status: 404 }
            );
        }
        
        // Configure multi-proxy deployment
        const deployResult = await configureServerForMultiProxy(
            server,
            user,
            {
                targetProxies,
                loadBalancingStrategy,
                fallbackProxies,
                proxySpecificConfig
            }
        );
        
        if (!deployResult.success) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: 'Multi-proxy deployment failed',
                    details: deployResult.overallDetails,
                    results: deployResult.results
                },
                { status: 500 }
            );
        }
        
        return NextResponse.json({
            success: true,
            message: 'Server successfully deployed to multiple proxies',
            deployment: deployResult,
            primaryProxy: deployResult.primaryProxy,
            fallbackProxies: deployResult.fallbackProxies
        });
        
    } catch (error) {
        console.error('Multi-proxy deployment error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function handleConfigureProxy(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await BodyParser.parseJSON(request);
        
        const { proxyId, configuration } = body;
        
        if (!proxyId || !configuration) {
            return NextResponse.json(
                { success: false, error: 'proxyId and configuration are required' },
                { status: 400 }
            );
        }
        
        const success = proxyManager.updateProxy(proxyId, configuration);
        
        if (!success) {
            return NextResponse.json(
                { success: false, error: 'Proxy not found' },
                { status: 404 }
            );
        }
        
        return NextResponse.json({
            success: true,
            message: 'Proxy configuration updated successfully'
        });
        
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function handleTestCompatibility(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await BodyParser.parseJSON(request);
        
        const { serverId, proxyTypes } = body;
        
        if (!serverId || !proxyTypes || !Array.isArray(proxyTypes)) {
            return NextResponse.json(
                { success: false, error: 'serverId and proxyTypes array are required' },
                { status: 400 }
            );
        }
        
        // Verify user authentication
        const user = await verificationService.getUserFromToken(request);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }
        
        // Get server
        const server = await Server.findOne({ uniqueId: serverId });
        if (!server) {
            return NextResponse.json(
                { success: false, error: 'Server not found' },
                { status: 404 }
            );
        }
        
        const compatibility = await testProxyCompatibility(server, proxyTypes);
        
        return NextResponse.json({
            success: true,
            compatibility
        });
        
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function configureServerForMultiProxy(
    server: IServer, 
    user: IUser,
    multiProxyConfig: {
        targetProxies?: string[];
        loadBalancingStrategy?: string;
        fallbackProxies?: string[];
        proxySpecificConfig?: Record<string, Record<string, unknown>>;
    }
) {
    try {
        // Get the container ID and environment ID
        const environmentId = process.env.PORTAINER_ENVIRONMENT_ID;
        
        if (!environmentId) {
            throw new Error('Portainer environment ID not configured');
        }
        
        const containerName = `mc-${server.uniqueId}`;
        
        // Find the container
        const containers = await portainer.axiosInstance.get(
            `/api/endpoints/${environmentId}/docker/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify({ name: [containerName] }))}`
        );
        
        const container = containers.data[0];
        
        if (!container) {
            throw new Error(`Container not found: ${containerName}`);
        }
        
        const containerId = container.Id;
        
        // Wait for server files to be ready
        console.log('Waiting for server files to be available...');
        let filesReady = false;
        let attempts = 0;
        const maxAttempts = 40; // 2 minutes with 3 second intervals
        
        while (!filesReady && attempts < maxAttempts) {
            try {
                const serverBasePath = `/servers/${user.email}/${server.uniqueId}`;
                filesReady = await webdavService.exists(`${serverBasePath}/server.properties`);
                if (!filesReady) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    attempts++;
                }
            } catch {
                await new Promise(resolve => setTimeout(resolve, 3000));
                attempts++;
            }
        }
        
        if (!filesReady) {
            throw new Error('Timeout waiting for server files');
        }
        
        // Stop the container to configure files
        console.log('Stopping container for configuration...');
        if (container.State === 'running') {
            await portainer.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/stop`
            );
            
            // Wait a moment for the container to fully stop
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Configure multi-proxy deployment
        const serverProxyConfig: ServerProxyConfig = {
            serverId: server.uniqueId,
            serverName: server.serverName,
            address: `mc-${server.uniqueId}:25565`, // Container name:port for internal network
            port: server.port || 25565,
            motd: server.serverConfig?.motd || server.serverName,
            restrictedToProxy: true,
            playerInfoForwardingMode: 'legacy' as const, // Default, can be overridden per proxy
            forwardingSecret: process.env.VELOCITY_FORWARDING_SECRET || 'proxy-secret',
            targetProxies: multiProxyConfig.targetProxies || [],
            loadBalancingStrategy: (multiProxyConfig.loadBalancingStrategy as 'round-robin' | 'priority' | 'least-connections' | 'custom') || 'priority',
            fallbackProxies: multiProxyConfig.fallbackProxies || [],
            proxySpecificConfig: multiProxyConfig.proxySpecificConfig || {}
        };
        
        const deployResult = await proxyManager.deployServerToProxies(
            serverProxyConfig,
            user.email,
            server.uniqueId
        );
        
        if (!deployResult.success) {
            throw new Error('Multi-proxy deployment failed');
        }
        
        // Restart the container
        console.log('Restarting container with multi-proxy configuration...');
        await portainer.axiosInstance.post(
            `/api/endpoints/${environmentId}/docker/containers/${containerId}/start`
        );
        
        return deployResult;
        
    } catch (error) {
        throw new Error(`Multi-proxy configuration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function testProxyCompatibility(
    server: IServer,
    proxyTypes: ProxyType[]
): Promise<Record<string, {
    available: boolean;
    reason?: string;
    compatible?: boolean;
    recommendations?: string[];
    warnings?: string[];
    proxyCount?: number;
    availableProxies?: Array<{
        id: string;
        name: string;
        host: string;
        port: number;
        healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    }>;
}>> {
    const compatibility: Record<string, {
        available: boolean;
        reason?: string;
        compatible?: boolean;
        recommendations?: string[];
        warnings?: string[];
        proxyCount?: number;
        availableProxies?: Array<{
            id: string;
            name: string;
            host: string;
            port: number;
            healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
        }>;
    }> = {};
    
    for (const proxyType of proxyTypes) {
        const proxies = proxyManager.getProxiesByType(proxyType).filter(p => p.enabled);
        
        if (proxies.length === 0) {
            compatibility[proxyType] = {
                available: false,
                reason: 'No enabled proxies of this type found'
            };
            continue;
        }
        
        const proxy = proxies[0]; // Use first available proxy for testing
        
        // Test basic compatibility
        const compatible = await testServerProxyCompatibility(server, proxy);
        
        compatibility[proxyType] = {
            available: true,
            compatible: compatible.compatible,
            recommendations: compatible.recommendations,
            warnings: compatible.warnings,
            proxyCount: proxies.length,
            availableProxies: proxies.map(p => ({
                id: p.id,
                name: p.name,
                host: p.host,
                port: p.port,
                healthStatus: p.healthStatus
            }))
        };
    }
    
    return compatibility;
}

async function testServerProxyCompatibility(
    server: IServer,
    proxy: ProxyInstanceConfig
): Promise<{
    compatible: boolean;
    recommendations: string[];
    warnings: string[];
}> {
    const recommendations: string[] = [];
    const warnings: string[] = [];
    let compatible = true;
    
    // Basic compatibility checks
    switch (proxy.type) {
        case 'velocity':
            recommendations.push('Velocity provides the best performance and modern features');
            recommendations.push('Supports both legacy and modern forwarding modes');
            break;
            
        case 'bungeecord':
            warnings.push('BungeeCord only supports legacy forwarding');
            recommendations.push('Consider upgrading to Waterfall or Velocity for better performance');
            break;
            
        case 'waterfall':
            recommendations.push('Waterfall provides improved BungeeCord compatibility');
            recommendations.push('Supports both legacy and modern forwarding modes');
            break;
            
        case 'rusty-connector':
            recommendations.push('RustyConnector enables dynamic server scaling');
            recommendations.push('Best for networks with varying server loads');
            break;
            
        default:
            compatible = false;
            warnings.push(`Unknown proxy type: ${proxy.type}`);
    }
    
    // Check server type compatibility
    const serverType = server.serverConfig?.serverType || 'paper';
    if (serverType === 'forge' || serverType === 'neoforge') {
        warnings.push('Forge/NeoForge servers may require additional proxy mods');
        recommendations.push('Install BungeeForward or similar proxy compatibility mod');
    }
    
    return { compatible, recommendations, warnings };
}

// Import webdavService for file operations
import webdavService from '@/lib/server/webdav';
