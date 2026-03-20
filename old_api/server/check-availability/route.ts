import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import { IUser } from "@/lib/objects/User";
import MinecraftServerManager from "@/lib/server/serverManager";
import portainer from "@/lib/server/portainer";
import verificationService from "@/lib/server/verify";

// Get available ports for a user
export async function GET(request: NextRequest) {
    await dbConnect();
    try {

        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        const url = new URL(request.url);
        const needsRcon = url.searchParams.get('rcon') === 'true';

        // Allocate port for the user
        const portAllocation = await MinecraftServerManager.allocatePort(
            user.email,
            needsRcon,
            portainer.DefaultEnvironmentId || 1
        );

        if (!portAllocation.success) {
            return NextResponse.json({
                error: portAllocation.error,
                available: false
            }, { status: 400 });
        }

        return NextResponse.json({
            available: true,
            port: portAllocation.port,
            rconPort: portAllocation.rconPort,
            isReserved: user.reservedPorts?.includes(portAllocation.port!) || false,
            reservedPorts: user.reservedPorts || []
        }, { status: 200 });

    } catch (error) {
        console.error("Error checking port availability:", error);
        return NextResponse.json({
            error: "Failed to check port availability.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Check if a specific subdomain is valid
export async function POST(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const { subdomain } = await request.json();

        if (!subdomain || typeof subdomain !== 'string') {
            return NextResponse.json({
                error: "Subdomain is required and must be a string."
            }, { status: 400 });
        }

        // Validate subdomain
        const validation = await MinecraftServerManager.validateSubdomain(subdomain, user.email);

        return NextResponse.json({
            isValid: validation.isValid,
            isReserved: validation.isReserved,
            error: validation.error,
            canUse: validation.isValid || (validation.isReserved && user.isAdmin)
        }, { status: 200 });

    } catch (error) {
        console.error("Error validating subdomain:", error);
        return NextResponse.json({
            error: "Failed to validate subdomain.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
