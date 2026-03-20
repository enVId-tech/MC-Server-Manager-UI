import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import verificationService from "@/lib/server/verify";
import resourceMonitor from "@/lib/server/resourceMonitor";

export async function GET(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Get server uniqueId from query parameters
        const url = new URL(request.url);
        const serverIdentifier = url.searchParams.get('uniqueId') || '';

        if (!serverIdentifier) {
            return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });
        }

        // Find the server by uniqueId or subdomain
        const server = await Server.findOne({
            $and: [
                { email: user.email }, // Ensure user owns the server
                {
                    $or: [
                        { uniqueId: serverIdentifier },
                        { subdomainName: serverIdentifier },
                    ]
                }
            ]
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        // Get resource summary
        const resourceSummary = await resourceMonitor.getResourceSummary(server.uniqueId);

        if (!resourceSummary) {
            return NextResponse.json({ 
                message: 'Failed to get resource statistics.',
                cpuUsage: 0,
                memoryUsage: 0,
                memoryLimit: 1024,
                memoryUsagePercent: 0,
                playersOnline: 0,
                maxPlayers: 20,
                networkRx: 0,
                networkTx: 0,
                isOptimal: false,
                error: 'Container not found or not running'
            }, { status: 200 });
        }

        return NextResponse.json(resourceSummary, { status: 200 });

    } catch (error) {
        console.error('Error fetching server resources:', error);
        return NextResponse.json({ 
            message: 'Failed to fetch server resources.',
            error: error instanceof Error ? error.message : 'Unknown error',
            cpuUsage: 0,
            memoryUsage: 0,
            memoryLimit: 1024,
            memoryUsagePercent: 0,
            playersOnline: 0,
            maxPlayers: 20,
            networkRx: 0,
            networkTx: 0,
            isOptimal: false
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const body = await request.json();
        const { uniqueId, action } = body;

        if (!uniqueId) {
            return NextResponse.json({ message: 'Server uniqueId is required.' }, { status: 400 });
        }

        // Find the server by uniqueId
        const server = await Server.findOne({
            uniqueId: uniqueId,
            email: user.email
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        if (action === 'scale') {
            // Trigger manual resource scaling
            const scalingResult = await resourceMonitor.checkAndScaleResources(server.uniqueId);
            
            return NextResponse.json({
                message: scalingResult.scaled ? 'Resources scaled successfully' : 'No scaling needed',
                ...scalingResult
            }, { status: 200 });
        }

        return NextResponse.json({ message: 'Invalid action.' }, { status: 400 });

    } catch (error) {
        console.error('Error managing server resources:', error);
        return NextResponse.json({ 
            message: 'Failed to manage server resources.',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
