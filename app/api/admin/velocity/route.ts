import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import verificationService from '@/lib/server/verify';
import portainer from '@/lib/server/portainer';
import { IUser } from '@/lib/objects/User';
import velocityService from '@/lib/server/velocity';
import { clearVelocityDiscoveryCache, discoverVelocityInstances } from '@/lib/server/velocityDiscovery';

async function requireAdmin(request: NextRequest): Promise<IUser | null> {
    const user: IUser | null = await verificationService.getUserFromToken(request);
    return user && user.isAdmin ? user : null;
}

async function environmentId(): Promise<number> {
    return portainer.getValidEnvironmentId(process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null);
}

/** The Velocity instance every change goes to, with what is registered in it. */
export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        if (!(await requireAdmin(request))) {
            return NextResponse.json({ message: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        const instances = await discoverVelocityInstances({ force: true });
        const active = instances[0] ?? null;

        let config = null;
        let configError: string | undefined;
        if (active) {
            try {
                const parsed = await velocityService.readVelocityConfig(active.configPath);
                config = {
                    bind: parsed.bind,
                    motd: parsed.motd,
                    forwardingMode: parsed['player-info-forwarding-mode'],
                    onlineMode: parsed['online-mode'],
                    servers: parsed.servers,
                    tryOrder: parsed['try'],
                    forcedHosts: parsed['forced-hosts'],
                };
            } catch (error) {
                configError = error instanceof Error ? error.message : 'Could not read velocity.toml';
            }
        }

        return NextResponse.json({ active, others: instances.slice(1), config, configError });
    } catch (error) {
        console.error('Velocity admin error:', error);
        return NextResponse.json({ message: 'Failed to inspect Velocity.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

/** Body: { action: 'reload' | 'rescan' } */
export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        if (!(await requireAdmin(request))) {
            return NextResponse.json({ message: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        const { action } = await request.json().catch(() => ({ action: '' }));

        if (action === 'rescan') {
            clearVelocityDiscoveryCache();
            const instances = await discoverVelocityInstances({ force: true });
            return NextResponse.json({ message: instances.length > 0 ? `Found ${instances.length} Velocity instance${instances.length === 1 ? '' : 's'}.` : 'No Velocity instance was found.', instances });
        }

        if (action === 'reload') {
            const result = await velocityService.reloadProxies(await environmentId());
            return NextResponse.json({ message: result.success ? 'Velocity reloaded without disconnecting players.' : 'Velocity could not be reloaded.', ...result }, { status: result.success ? 200 : 502 });
        }

        return NextResponse.json({ message: 'Unknown action.' }, { status: 400 });
    } catch (error) {
        console.error('Velocity admin action error:', error);
        return NextResponse.json({ message: 'Velocity action failed.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
