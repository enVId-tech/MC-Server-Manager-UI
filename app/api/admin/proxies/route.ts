import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import { IUser } from '@/lib/objects/User';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import proxyManager from '@/lib/server/proxy-manager';
import { 
    getDefinedProxies, 
    ProxyDefinition 
} from '@/lib/config/proxies';
import portainer from '@/lib/server/portainer';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';

/**
 * GET /api/admin/proxies
 * Get all proxy information and status (admin only)
 */
export async function GET(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ 
                message: 'Administrative privileges required.' 
            }, { status: 403 });
        }

        // Auto-discover valid environment ID
        const storedEnvId = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null;
        const environmentId = await portainer.getValidEnvironmentId(storedEnvId);
        
        // Get defined proxies from YAML
        const definedProxies = getDefinedProxies();
        
        // Get registered proxies from manager
        const registeredProxies = proxyManager.getAllProxies();
        
        // Get container status for each proxy
        const containers = await portainer.getContainers(environmentId);
        
        const proxiesWithStatus = definedProxies.map((proxy: ProxyDefinition) => {
            const container = containers.find(c => 
                c.Names?.some(name => name.includes(proxy.host))
            );
            
            const registered = registeredProxies.find(r => r.id === proxy.id);
            
            return {
                ...proxy,
                status: container ? {
                    running: container.State === 'running',
                    containerId: container.Id,
                    state: container.State,
                    status: container.Status,
                    // Include console access URL for admins
                    consoleUrl: portainer.getConsoleWebsocketUrl(container.Id, environmentId)
                } : { running: false },
                registered: !!registered,
                healthStatus: registered?.healthStatus || 'unknown'
            };
        });

        return NextResponse.json({
            success: true,
            proxies: proxiesWithStatus,
            registeredCount: registeredProxies.length,
            definedCount: definedProxies.length,
            // Include Portainer base URL for direct access
            portainerUrl: process.env.PORTAINER_URL || ''
        });

    } catch (error) {
        console.error('[Admin Proxies] GET error:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
        }, { status: 500 });
    }
}

/**
 * POST /api/admin/proxies
 * Create a new Velocity proxy instance (admin only)
 */
export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ 
                message: 'Administrative privileges required. Only admins can create new Velocity instances.' 
            }, { status: 403 });
        }

        const body = await BodyParser.parseAuto(request);
        const { id, name, host, port, memory, networkName, configPath } = body;

        // Validate required fields
        if (!id || !name || !host || !port) {
            return NextResponse.json({
                success: false,
                message: 'Missing required fields: id, name, host, port'
            }, { status: 400 });
        }

        // Validate port is a number and in valid range
        const portNum = parseInt(port);
        if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
            return NextResponse.json({
                success: false,
                message: 'Port must be a number between 1024 and 65535'
            }, { status: 400 });
        }

        // Check if proxy ID or port already exists
        const existingProxies = getDefinedProxies();
        const idExists = existingProxies.some((p: ProxyDefinition) => p.id === id);
        const portExists = existingProxies.some((p: ProxyDefinition) => p.port === portNum);

        if (idExists) {
            return NextResponse.json({
                success: false,
                message: `Proxy with ID '${id}' already exists`
            }, { status: 409 });
        }

        if (portExists) {
            return NextResponse.json({
                success: false,
                message: `Proxy with port ${portNum} already exists`
            }, { status: 409 });
        }

        // Create new proxy definition
        const newProxy: ProxyDefinition = {
            id,
            name,
            host,
            port: portNum,
            memory: memory || '512M',
            networkName: networkName || 'velocity-network',
            type: 'velocity',
            configPath: configPath || undefined
        };

        // Read current proxies.yaml
        const proxiesYamlPath = path.join(process.cwd(), 'lib', 'config', 'proxies.yaml');
        const yamlContent = await fs.readFile(proxiesYamlPath, 'utf-8');
        const config = yaml.parse(yamlContent);

        // Add new proxy to config
        if (!config.proxies) {
            config.proxies = [];
        }
        config.proxies.push(newProxy);

        // Write updated config back
        const updatedYaml = yaml.stringify(config, { indent: 2 });
        await fs.writeFile(proxiesYamlPath, updatedYaml, 'utf-8');

        // Deploy the new proxy
        const storedEnvIdPost = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null;
        const environmentId = await portainer.getValidEnvironmentId(storedEnvIdPost);
        const details = await proxyManager.ensureProxies(environmentId);

        console.log(`[Admin Proxies] Created new proxy: ${name} (${id}) by admin ${user.email}`);

        return NextResponse.json({
            success: true,
            message: `Velocity proxy '${name}' created successfully`,
            proxy: newProxy,
            deploymentDetails: details
        }, { status: 201 });

    } catch (error) {
        console.error('[Admin Proxies] POST error:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
        }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/proxies
 * Delete a Velocity proxy instance (admin only)
 */
export async function DELETE(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ 
                message: 'Administrative privileges required. Only admins can delete Velocity instances.' 
            }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const proxyId = searchParams.get('id');

        if (!proxyId) {
            return NextResponse.json({
                success: false,
                message: 'Proxy ID is required'
            }, { status: 400 });
        }

        // Check if proxy exists
        const existingProxies = getDefinedProxies();
        const proxyIndex = existingProxies.findIndex((p: ProxyDefinition) => p.id === proxyId);

        if (proxyIndex === -1) {
            return NextResponse.json({
                success: false,
                message: `Proxy with ID '${proxyId}' not found`
            }, { status: 404 });
        }

        const proxyToDelete = existingProxies[proxyIndex];

        // Read current proxies.yaml
        const proxiesYamlPath = path.join(process.cwd(), 'lib', 'config', 'proxies.yaml');
        const yamlContent = await fs.readFile(proxiesYamlPath, 'utf-8');
        const config = yaml.parse(yamlContent);

        // Remove proxy from config
        config.proxies = config.proxies.filter((p: ProxyDefinition) => p.id !== proxyId);

        // Write updated config back
        const updatedYaml = yaml.stringify(config, { indent: 2 });
        await fs.writeFile(proxiesYamlPath, updatedYaml, 'utf-8');

        // Delete the proxy container/stack from Portainer
        const storedEnvIdDelete = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null;
        const environmentId = await portainer.getValidEnvironmentId(storedEnvIdDelete);
        
        try {
            // Try to delete stack first
            const stack = await portainer.getStackByName(proxyToDelete.name);
            if (stack) {
                await portainer.deleteStack(stack.Id, environmentId);
            }
        } catch (stackError) {
            console.warn(`Could not delete stack for proxy ${proxyId}:`, stackError);
        }

        // Unregister from proxy manager
        proxyManager.unregisterProxy(proxyId);

        console.log(`[Admin Proxies] Deleted proxy: ${proxyToDelete.name} (${proxyId}) by admin ${user.email}`);

        return NextResponse.json({
            success: true,
            message: `Velocity proxy '${proxyToDelete.name}' deleted successfully`,
            deletedProxy: proxyToDelete
        });

    } catch (error) {
        console.error('[Admin Proxies] DELETE error:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
        }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/proxies
 * Update a Velocity proxy instance (admin only)
 */
export async function PATCH(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ 
                message: 'Administrative privileges required.' 
            }, { status: 403 });
        }

        const body = await BodyParser.parseAuto(request);
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({
                success: false,
                message: 'Proxy ID is required'
            }, { status: 400 });
        }

        // Read current proxies.yaml
        const proxiesYamlPath = path.join(process.cwd(), 'lib', 'config', 'proxies.yaml');
        const yamlContent = await fs.readFile(proxiesYamlPath, 'utf-8');
        const config = yaml.parse(yamlContent);

        // Find and update proxy
        const proxyIndex = config.proxies.findIndex((p: ProxyDefinition) => p.id === id);

        if (proxyIndex === -1) {
            return NextResponse.json({
                success: false,
                message: `Proxy with ID '${id}' not found`
            }, { status: 404 });
        }

        // Apply updates (only allowed fields)
        const allowedUpdates = ['name', 'memory', 'networkName'];
        for (const key of allowedUpdates) {
            if (updates[key] !== undefined) {
                config.proxies[proxyIndex][key] = updates[key];
            }
        }

        // Write updated config back
        const updatedYaml = yaml.stringify(config, { indent: 2 });
        await fs.writeFile(proxiesYamlPath, updatedYaml, 'utf-8');

        // Re-sync proxies
        const storedEnvIdPatch = process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null;
        const environmentId = await portainer.getValidEnvironmentId(storedEnvIdPatch);
        const details = await proxyManager.ensureProxies(environmentId);

        console.log(`[Admin Proxies] Updated proxy: ${id} by admin ${user.email}`);

        return NextResponse.json({
            success: true,
            message: 'Proxy updated successfully',
            proxy: config.proxies[proxyIndex],
            syncDetails: details
        });

    } catch (error) {
        console.error('[Admin Proxies] PATCH error:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
        }, { status: 500 });
    }
}
