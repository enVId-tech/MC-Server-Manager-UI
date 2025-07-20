import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Server from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";
import BodyParser from "@/lib/db/bodyParser";
import verificationService from "@/lib/server/verify";
import { deleteServer } from "@/lib/server/deleteServer";

/**
 * DELETE - Delete a server completely (cleanup containers, files, and mark as deleted)
 */
export async function DELETE(request: NextRequest) {
    await dbConnect();
    
    try {
        const { serverId, reason = 'manual-deletion' } = await BodyParser.parseAuto(request);

        if (!serverId) {
            return NextResponse.json({ error: "Server ID is required." }, { status: 400 });
        }

        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Find the server by uniqueId (UUID) not MongoDB _id
        const server = await Server.findOne({
            uniqueId: serverId,
            email: user.email
        });

        if (!server) {
            return NextResponse.json({ error: "Server not found." }, { status: 404 });
        }

        // Perform comprehensive deletion
        const deletionResult = await deleteServer(serverId, server.toObject(), user, reason);

        if (deletionResult.success) {
            return NextResponse.json({
                message: "Server deleted successfully",
                details: deletionResult.details
            }, { status: 200 });
        } else {
            return NextResponse.json({
                error: "Server deletion completed with warnings",
                message: deletionResult.error || "Some cleanup operations failed",
                details: deletionResult.details
            }, { status: 207 }); // 207 Multi-Status for partial success
        }

    } catch (error) {
        console.error("Error deleting server:", error);
        return NextResponse.json({
            error: "Failed to delete server.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * POST - Alternative interface for server deletion (for compatibility)
 */
export async function POST(request: NextRequest) {
    return await DELETE(request);
}
