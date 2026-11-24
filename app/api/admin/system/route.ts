import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import mongoose from 'mongoose';
import verificationService from '@/lib/server/verify';
import portainer from '@/lib/server/portainer';
import Server from '@/lib/objects/Server';
import User, { IUser } from '@/lib/objects/User';
import { getStorageBackend } from '@/lib/server/storage';
import { getImportRoots } from '@/lib/server/importPaths';
import { getServerDomain } from '@/lib/config/domain';

/**
 * How this installation is set up, for the admin overview and settings pages. Only facts and yes/no flags are
 * returned: no secrets, tokens or credentials.
 */
export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const admin: IUser | null = await verificationService.getUserFromToken(request);
        if (!admin || !admin.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const [serverCount, importedCount, userCount, pendingUsers] = await Promise.all([
            Server.countDocuments({}),
            Server.countDocuments({ imported: true }),
            User.countDocuments({}),
            User.countDocuments({ isActive: false }),
        ]);

        let portainerStatus: { connected: boolean; host?: string; environments?: number; error?: string } = { connected: false };
        try {
            const connected = await portainer.testConnection();
            const environments = connected ? await portainer.getEnvironments() : [];
            let host: string | undefined;
            try {
                host = process.env.PORTAINER_URL ? new URL(process.env.PORTAINER_URL).host : undefined;
            } catch {
                host = undefined;
            }
            portainerStatus = { connected, host, environments: environments.length };
        } catch (error) {
            portainerStatus = { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }

        const backend = getStorageBackend();

        return NextResponse.json({
            counts: { servers: serverCount, imported: importedCount, users: userCount, pendingUsers },
            portainer: portainerStatus,
            database: { connected: mongoose.connection.readyState === 1 },
            storage: {
                backend,
                path: backend === 'local' ? process.env.LOCAL_STORAGE_PATH : process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers',
                hostPath: backend === 'local' ? process.env.LOCAL_STORAGE_HOST_PATH || null : null,
                importFolders: getImportRoots(),
            },
            settings: {
                serverDomain: getServerDomain(),
                containerUser: `${process.env.CONTAINER_UID || '1000'}:${process.env.CONTAINER_GID || '1000'}`,
                containerDns: process.env.CONTAINER_DNS || null,
                velocityReloadFallback: process.env.VELOCITY_RELOAD_FALLBACK || 'none',
                velocityConfigPath: process.env.VELOCITY_CONFIG_PATH || null,
                deleteServerFolders: (process.env.DELETE_SERVER_FOLDERS ?? '').toLowerCase() === 'true',
            },
            runtime: { node: process.version, uptimeSeconds: Math.round(process.uptime()) },
        });
    } catch (error) {
        console.error('System status error:', error);
        return NextResponse.json({ message: 'Failed to read the system status.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
