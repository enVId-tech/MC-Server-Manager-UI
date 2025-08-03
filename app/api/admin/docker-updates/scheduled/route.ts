import { NextRequest, NextResponse } from 'next/server';
import dockerImageUpdater from '@/lib/server/docker-image-updater';

/**
 * Scheduled Docker Update Endpoint
 * 
 * This endpoint should be called by a cron job or scheduler
 * to perform automatic Docker image updates based on the configured schedule.
 * 
 * Call this endpoint with:
 * - Internal API key for security
 * - Optional force parameter to override maintenance window
 */
export async function POST(request: NextRequest) {
    try {
        // Verify internal API call
        const authHeader = request.headers.get('authorization');
        const isInternalCall = authHeader === `Bearer ${process.env.INTERNAL_API_KEY}`;
        
        if (!isInternalCall) {
            return NextResponse.json({ 
                message: 'Unauthorized. This endpoint is for internal scheduled calls only.' 
            }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';

        console.log('🕒 Scheduled Docker update check initiated...');

        // Get current configuration
        const status = dockerImageUpdater.getStatus();
        
        if (!status.config.enabled && !force) {
            return NextResponse.json({
                success: false,
                message: 'Automatic updates are disabled',
                skipped: true
            });
        }

        if (!dockerImageUpdater.isInMaintenanceWindow() && !force) {
            return NextResponse.json({
                success: false,
                message: 'Not in maintenance window',
                skipped: true,
                nextWindow: 'Check maintenance window configuration'
            });
        }

        // Check if an update is already in progress
        if (status.isUpdating) {
            return NextResponse.json({
                success: false,
                message: 'Update already in progress',
                skipped: true
            });
        }

        // Perform scheduled update
        const result = await dockerImageUpdater.performScheduledUpdate();

        console.log('✅ Scheduled Docker update completed:', result);

        return NextResponse.json({
            success: result.success,
            result,
            scheduled: true,
            timestamp: new Date().toISOString(),
            message: result.success ? 
                'Scheduled update completed successfully' : 
                'Scheduled update completed with errors'
        });

    } catch (error) {
        console.error('Error in scheduled Docker update:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            scheduled: true,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// GET - Health check for the scheduler
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const isInternalCall = authHeader === `Bearer ${process.env.INTERNAL_API_KEY}`;
        
        if (!isInternalCall) {
            return NextResponse.json({ 
                message: 'Unauthorized' 
            }, { status: 401 });
        }

        const status = dockerImageUpdater.getStatus();
        const updateCheck = await dockerImageUpdater.checkForUpdates();

        return NextResponse.json({
            success: true,
            status,
            updateCheck,
            isInMaintenanceWindow: dockerImageUpdater.isInMaintenanceWindow(),
            timestamp: new Date().toISOString(),
            message: 'Scheduler health check successful'
        });

    } catch (error) {
        console.error('Error in scheduler health check:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
