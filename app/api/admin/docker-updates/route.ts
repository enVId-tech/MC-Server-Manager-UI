import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/dbConnect';
import User, { IUser } from '@/lib/objects/User';
import verificationService from '@/lib/server/verify';
import BodyParser from '@/lib/db/bodyParser';
import dockerImageUpdater, { ImageUpdateConfig } from '@/lib/server/docker-image-updater';

// GET - Get Docker update status and configuration (admin only)
export async function GET(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        // Get current status and configuration
        const status = dockerImageUpdater.getStatus();

        // Check for available updates
        const updateCheck = await dockerImageUpdater.checkForUpdates();

        return NextResponse.json({
            success: true,
            status,
            updateCheck,
            message: 'Docker update status retrieved successfully'
        });

    } catch (error) {
        console.error('Error getting Docker update status:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// POST - Trigger manual update or update configuration (admin only)
export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        const adminUser: IUser | null = await verificationService.getUserFromToken(request);

        if (!adminUser || !adminUser.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const { action, config, serverIds } = await BodyParser.parseAuto(request);

        if (action === 'update-config') {
            // Update configuration
            if (!config) {
                return NextResponse.json({
                    success: false,
                    error: 'Configuration is required for update-config action'
                }, { status: 400 });
            }

            dockerImageUpdater.updateConfig(config as Partial<ImageUpdateConfig>);

            return NextResponse.json({
                success: true,
                message: 'Docker update configuration updated successfully',
                config: dockerImageUpdater.getStatus().config
            });

        } else if (action === 'manual-update') {
            // Trigger manual update
            const result = await dockerImageUpdater.performManualUpdate(adminUser, serverIds);

            return NextResponse.json({
                success: result.success,
                result,
                message: result.success ? 
                    'Manual update completed successfully' : 
                    'Manual update completed with errors'
            });

        } else if (action === 'cancel-update') {
            // Cancel ongoing update
            const cancelled = await dockerImageUpdater.cancelUpdate(adminUser);

            return NextResponse.json({
                success: true,
                cancelled,
                message: cancelled ? 'Update cancelled successfully' : 'No update to cancel'
            });

        } else if (action === 'check-updates') {
            // Check for available updates
            const updateCheck = await dockerImageUpdater.checkForUpdates();

            return NextResponse.json({
                success: true,
                updateCheck,
                message: 'Update check completed'
            });

        } else {
            return NextResponse.json({
                success: false,
                error: 'Invalid action. Valid actions: update-config, manual-update, cancel-update, check-updates'
            }, { status: 400 });
        }

    } catch (error) {
        console.error('Error processing Docker update request:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
