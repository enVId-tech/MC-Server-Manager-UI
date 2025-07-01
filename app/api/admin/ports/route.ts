import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import User from "@/lib/objects/User";
import jwt from "jsonwebtoken";
import BodyParser from "@/lib/db/bodyParser";
import MinecraftServerManager from "@/lib/server/serverManager";

// Reserve ports for a user (admin only)
export async function POST(request: NextRequest) {
    try {
        await dbConnect();
        
        const token = request.cookies.get('sessionToken')?.value;
        if (!token) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        // Verify the token and get admin user
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default');
        if (!decoded) {
            return NextResponse.json({ message: 'Invalid session token.' }, { status: 401 });
        }

        const adminUser = await User.findById((decoded as { id: string }).id);
        if (!adminUser || !adminUser.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const { targetUserEmail, ports } = await BodyParser.parseAuto(request);

        if (!targetUserEmail || !ports || !Array.isArray(ports)) {
            return NextResponse.json({ 
                error: "Target user email and ports array are required." 
            }, { status: 400 });
        }

        // Validate ports
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invalidPorts = ports.filter((port: any) => 
            typeof port !== 'number' || port < 25565 || port > 25595
        );
        
        if (invalidPorts.length > 0) {
            return NextResponse.json({ 
                error: `Invalid ports: ${invalidPorts.join(', ')}. Ports must be numbers between 25565-25595.` 
            }, { status: 400 });
        }

        // Reserve the ports
        const result = await MinecraftServerManager.reservePortsForUser(
            adminUser.email,
            targetUserEmail,
            ports
        );

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ 
            message: `Successfully reserved ports ${ports.join(', ')} for user ${targetUserEmail}`,
            success: true
        }, { status: 200 });

    } catch (error) {
        console.error("Error reserving ports:", error);
        return NextResponse.json({
            error: "Failed to reserve ports.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Get prohibited subdomains (admin only)
export async function GET(request: NextRequest) {
    try {
        await dbConnect();
        
        const token = request.cookies.get('sessionToken')?.value;
        if (!token) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        // Verify the token and get admin user
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default');
        if (!decoded) {
            return NextResponse.json({ message: 'Invalid session token.' }, { status: 401 });
        }

        const adminUser = await User.findById((decoded as { id: string }).id);
        if (!adminUser || !adminUser.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const prohibitedSubdomains = MinecraftServerManager.getProhibitedSubdomains();

        return NextResponse.json({ 
            prohibitedSubdomains,
            count: prohibitedSubdomains.length
        }, { status: 200 });

    } catch (error) {
        console.error("Error getting prohibited subdomains:", error);
        return NextResponse.json({
            error: "Failed to get prohibited subdomains.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Add prohibited subdomain (admin only)
export async function PUT(request: NextRequest) {
    try {
        await dbConnect();
        
        const token = request.cookies.get('sessionToken')?.value;
        if (!token) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        // Verify the token and get admin user
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default');
        if (!decoded) {
            return NextResponse.json({ message: 'Invalid session token.' }, { status: 401 });
        }

        const adminUser = await User.findById((decoded as { id: string }).id);
        if (!adminUser || !adminUser.isAdmin) {
            return NextResponse.json({ message: 'Administrative privileges required.' }, { status: 403 });
        }

        const { subdomain } = await BodyParser.parseAuto(request);

        if (!subdomain || typeof subdomain !== 'string') {
            return NextResponse.json({ 
                error: "Subdomain is required and must be a string." 
            }, { status: 400 });
        }

        // Validate subdomain format
        const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
        if (!subdomainRegex.test(subdomain)) {
            return NextResponse.json({ 
                error: "Invalid subdomain format. Use only lowercase letters, numbers, and hyphens." 
            }, { status: 400 });
        }

        MinecraftServerManager.addProhibitedSubdomain(subdomain);

        return NextResponse.json({ 
            message: `Successfully added "${subdomain}" to prohibited subdomains list.`,
            success: true
        }, { status: 200 });

    } catch (error) {
        console.error("Error adding prohibited subdomain:", error);
        return NextResponse.json({
            error: "Failed to add prohibited subdomain.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
