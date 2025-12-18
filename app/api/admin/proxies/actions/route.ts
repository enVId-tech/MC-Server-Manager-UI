import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import { IUser } from '@/lib/objects/User';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import portainer from '@/lib/server/portainer';
import { getDefinedProxies, ProxyDefinition } from '@/lib/config/proxies';

/**
 * POST /api/admin/proxies/actions
 * Perform actions on Velocity proxy instances (admin only)
 * 
 * Supported actions:
 * - logs: Get container logs
 * - restart: Restart the container
 * - start: Start the container
 * - stop: Stop the container
 * - redeploy: Redeploy the stack with latest image
 * - update: Update the stack with new compose content
 * - console: Get console access info
 */
export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ 
                message: 'Administrative privileges required.' 
            }, { status: 403 });
        }

        const body = await BodyParser.parseAuto(request);
        const { action, proxyId, tail, composeContent } = body;

        if (!action || !proxyId) {
            return NextResponse.json({
                success: false,
                message: 'Action and proxyId are required'
            }, { status: 400 });
        }

        // Auto-discover valid environment ID
        const storedEnvId = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null;
        const environmentId = await portainer.getValidEnvironmentId(storedEnvId);

        // Find the proxy
        const definedProxies = getDefinedProxies();
        const proxy = definedProxies.find((p: ProxyDefinition) => p.id === proxyId);

        if (!proxy) {
            return NextResponse.json({
                success: false,
                message: `Proxy with ID '${proxyId}' not found`
            }, { status: 404 });
        }

        // Get container for this proxy
        const containers = await portainer.getContainers(environmentId);
        const container = containers.find(c => 
            c.Names?.some(name => name.includes(proxy.host))
        );

        // Get stack for this proxy
        const stack = await portainer.getStackByName(proxy.name);

        switch (action) {
            case 'logs': {
                if (!container) {
                    return NextResponse.json({
                        success: false,
                        message: 'Container not found for this proxy'
                    }, { status: 404 });
                }

                const logs = await portainer.getContainerLogs(
                    container.Id, 
                    environmentId, 
                    tail || 100
                );

                return NextResponse.json({
                    success: true,
                    proxyId,
                    proxyName: proxy.name,
                    logs
                });
            }

            case 'restart': {
                if (!container) {
                    return NextResponse.json({
                        success: false,
                        message: 'Container not found for this proxy'
                    }, { status: 404 });
                }

                await portainer.restartContainer(container.Id, environmentId);

                console.log(`[Admin Proxies] Restarted proxy ${proxy.name} by admin ${user.email}`);

                return NextResponse.json({
                    success: true,
                    message: `Proxy '${proxy.name}' restarted successfully`
                });
            }

            case 'start': {
                if (!container) {
                    return NextResponse.json({
                        success: false,
                        message: 'Container not found for this proxy'
                    }, { status: 404 });
                }

                await portainer.startContainer(container.Id, environmentId);

                console.log(`[Admin Proxies] Started proxy ${proxy.name} by admin ${user.email}`);

                return NextResponse.json({
                    success: true,
                    message: `Proxy '${proxy.name}' started successfully`
                });
            }

            case 'stop': {
                if (!container) {
                    return NextResponse.json({
                        success: false,
                        message: 'Container not found for this proxy'
                    }, { status: 404 });
                }

                await portainer.stopContainer(container.Id, environmentId);

                console.log(`[Admin Proxies] Stopped proxy ${proxy.name} by admin ${user.email}`);

                return NextResponse.json({
                    success: true,
                    message: `Proxy '${proxy.name}' stopped successfully`
                });
            }

            case 'redeploy': {
                if (!stack) {
                    return NextResponse.json({
                        success: false,
                        message: 'Stack not found for this proxy'
                    }, { status: 404 });
                }

                await portainer.redeployStack(stack.Id, environmentId);

                console.log(`[Admin Proxies] Redeployed proxy ${proxy.name} by admin ${user.email}`);

                return NextResponse.json({
                    success: true,
                    message: `Proxy '${proxy.name}' redeployed successfully with latest image`
                });
            }

            case 'update': {
                if (!stack) {
                    return NextResponse.json({
                        success: false,
                        message: 'Stack not found for this proxy'
                    }, { status: 404 });
                }

                if (!composeContent) {
                    return NextResponse.json({
                        success: false,
                        message: 'composeContent is required for update action'
                    }, { status: 400 });
                }

                await portainer.updateStack(stack.Id, composeContent, environmentId, true);

                console.log(`[Admin Proxies] Updated proxy stack ${proxy.name} by admin ${user.email}`);

                return NextResponse.json({
                    success: true,
                    message: `Proxy '${proxy.name}' stack updated successfully`
                });
            }

            case 'console': {
                if (!container) {
                    return NextResponse.json({
                        success: false,
                        message: 'Container not found for this proxy'
                    }, { status: 404 });
                }

                const consoleUrl = portainer.getConsoleWebsocketUrl(container.Id, environmentId);
                const portainerBaseUrl = process.env.PORTAINER_URL || '';

                return NextResponse.json({
                    success: true,
                    proxyId,
                    proxyName: proxy.name,
                    containerId: container.Id,
                    consoleWebsocketUrl: consoleUrl,
                    // Direct Portainer console URL
                    portainerConsoleUrl: `${portainerBaseUrl}/#/docker/${environmentId}/containers/${container.Id}/console`
                });
            }

            case 'stackInfo': {
                if (!stack) {
                    return NextResponse.json({
                        success: false,
                        message: 'Stack not found for this proxy'
                    }, { status: 404 });
                }

                const stackContent = await portainer.getStackFileContent(stack.Id);
                
                // Get container status for more detailed info
                const allContainers = await portainer.getContainers(environmentId);
                const proxyContainers = allContainers.filter(c => 
                    c.Names.some(n => n.includes(proxy.name))
                );
                const containerStatus = proxyContainers.length > 0 ? proxyContainers[0].State : 'unknown';

                return NextResponse.json({
                    success: true,
                    proxyId,
                    proxyName: proxy.name,
                    stack: {
                        id: stack.Id,
                        name: stack.Name,
                        containerStatus,
                        composeContent: stackContent
                    }
                });
            }

            default:
                return NextResponse.json({
                    success: false,
                    message: `Unknown action: ${action}. Supported actions: logs, restart, start, stop, redeploy, update, console, stackInfo`
                }, { status: 400 });
        }

    } catch (error) {
        console.error('[Admin Proxies Actions] Error:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
        }, { status: 500 });
    }
}
