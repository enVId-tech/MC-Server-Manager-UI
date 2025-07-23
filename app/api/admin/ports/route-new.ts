import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import User, { IUser } from "@/lib/objects/User";
import verificationService from "@/lib/server/verify";
import PortManager from "@/lib/server/portManager";
import BodyParser from "@/lib/db/bodyParser";
import type { PortReservationRange } from "@/lib/objects/User";

// GET - Get port usage report and availability (admin only)
export async function GET(request: NextRequest) {
    await dbConnect();
    
    try {
        const user = await verificationService.getUserFromToken(request);
        if (!user || !user.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const url = new URL(request.url);
        const environmentId = parseInt(url.searchParams.get('environmentId') || '1');
        const checkPort = url.searchParams.get('port');
        const targetUserEmail = url.searchParams.get('userEmail');

        if (checkPort) {
            // Check specific port availability
            const portNum = parseInt(checkPort);
            const userEmail = targetUserEmail || user.email;
            const availability = await PortManager.isPortAvailable(portNum, userEmail, environmentId);
            
            return NextResponse.json({
                port: portNum,
                available: availability.available,
                reason: availability.reason,
                conflictType: availability.conflictType
            });
        }

        // Get comprehensive port usage report
        const report = await PortManager.getPortUsageReport(environmentId);
        
        // Get all users with reserved ports/ranges for admin view
        const usersWithReservations = await User.find({
            $or: [
                { reservedPorts: { $exists: true, $ne: [] } },
                { reservedPortRanges: { $exists: true, $ne: [] } }
            ]
        }, { email: 1, reservedPorts: 1, reservedPortRanges: 1 });

        return NextResponse.json({
            success: true,
            report,
            usersWithReservations
        });

    } catch (error) {
        console.error('Error getting port information:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// POST - Reserve ports or port ranges for a user (admin only)
export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        const adminUser: IUser | null = await verificationService.getUserFromToken(request);

        if (!adminUser || !adminUser.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const { 
            targetUserEmail, 
            ports, 
            portRanges, 
            action = 'add' 
        } = await BodyParser.parseAuto(request);

        if (!targetUserEmail) {
            return NextResponse.json({
                error: "Target user email is required."
            }, { status: 400 });
        }

        const targetUser = await User.findOne({ email: targetUserEmail });
        if (!targetUser) {
            return NextResponse.json({
                error: "Target user not found."
            }, { status: 404 });
        }

        if (action === 'add') {
            // Add individual ports
            if (ports && Array.isArray(ports)) {
                const invalidPorts = ports.filter((port: any) =>
                    typeof port !== 'number' || port < 1024 || port > 65535
                );

                if (invalidPorts.length > 0) {
                    return NextResponse.json({
                        error: `Invalid ports: ${invalidPorts.join(', ')}. Ports must be numbers between 1024-65535.`
                    }, { status: 400 });
                }

                targetUser.reservedPorts = [...new Set([...(targetUser.reservedPorts || []), ...ports])];
            }

            // Add port ranges
            if (portRanges && Array.isArray(portRanges)) {
                const validation = PortManager.validateReservedPortRanges(portRanges);
                if (!validation.valid) {
                    return NextResponse.json({
                        error: `Invalid port ranges: ${validation.errors.join(', ')}`
                    }, { status: 400 });
                }

                targetUser.reservedPortRanges = [...(targetUser.reservedPortRanges || []), ...portRanges];
            }

            await targetUser.save();

            return NextResponse.json({
                success: true,
                message: `Ports reserved for user ${targetUserEmail}`,
                user: {
                    email: targetUser.email,
                    reservedPorts: targetUser.reservedPorts,
                    reservedPortRanges: targetUser.reservedPortRanges
                }
            });

        } else if (action === 'remove') {
            // Remove individual ports
            if (ports && Array.isArray(ports)) {
                targetUser.reservedPorts = (targetUser.reservedPorts || []).filter(
                    (port: number) => !ports.includes(port)
                );
            }

            // Remove port ranges (by start port)
            if (portRanges && Array.isArray(portRanges)) {
                const rangesToRemove = portRanges.map((r: any) => r.start);
                targetUser.reservedPortRanges = (targetUser.reservedPortRanges || []).filter(
                    (range: PortReservationRange) => !rangesToRemove.includes(range.start)
                );
            }

            await targetUser.save();

            return NextResponse.json({
                success: true,
                message: `Ports removed from user ${targetUserEmail}`,
                user: {
                    email: targetUser.email,
                    reservedPorts: targetUser.reservedPorts,
                    reservedPortRanges: targetUser.reservedPortRanges
                }
            });

        } else {
            return NextResponse.json({
                error: "Invalid action. Use 'add' or 'remove'."
            }, { status: 400 });
        }

    } catch (error) {
        console.error('Port reservation error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
