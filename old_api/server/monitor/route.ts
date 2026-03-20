import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import verificationService from "@/lib/server/verify";
import resourceMonitor from "@/lib/server/resourceMonitor";

// This endpoint should be secured and only accessible by admin users or internal systems
export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        // Allow internal calls without authentication (for cron jobs)
        const authHeader = request.headers.get('authorization');
        const isInternalCall = authHeader === `Bearer ${process.env.INTERNAL_API_KEY}`;

        if (!user && !isInternalCall) {
            return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
        }

        // If authenticated user, check if admin (optional - remove if all users can trigger monitoring)
        if (user && !isInternalCall) {
            // Add admin check here if needed
            // if (!user.isAdmin) {
            //     return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
            // }
        }

        console.log('🔍 Starting automatic resource monitoring for all servers...');

        // Monitor all servers
        const results = await resourceMonitor.monitorAllServers();

        return NextResponse.json({
            message: 'Resource monitoring completed',
            timestamp: new Date().toISOString(),
            ...results
        }, { status: 200 });

    } catch (error) {
        console.error('❌ Error in automatic resource monitoring:', error);
        return NextResponse.json({ 
            message: 'Failed to complete resource monitoring.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// GET endpoint to check monitoring status and get scaling rules
export async function GET(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const scalingRules = resourceMonitor.getScalingRules();

        return NextResponse.json({
            scalingRules,
            monitoringEnabled: true,
            lastUpdate: new Date().toISOString()
        }, { status: 200 });

    } catch (error) {
        console.error('Error getting monitoring info:', error);
        return NextResponse.json({ 
            message: 'Failed to get monitoring information.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// PUT endpoint to update scaling rules (admin only)
export async function PUT(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Add admin check here if needed
        // if (!user.isAdmin) {
        //     return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
        // }

        const body = await request.json();
        const { scalingRules } = body;

        if (!scalingRules) {
            return NextResponse.json({ message: 'Scaling rules are required.' }, { status: 400 });
        }

        // Update scaling rules
        resourceMonitor.updateScalingRules(scalingRules);

        return NextResponse.json({
            message: 'Scaling rules updated successfully',
            scalingRules: resourceMonitor.getScalingRules()
        }, { status: 200 });

    } catch (error) {
        console.error('Error updating scaling rules:', error);
        return NextResponse.json({ 
            message: 'Failed to update scaling rules.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
