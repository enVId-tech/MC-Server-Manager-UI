import { NextResponse } from "next/server";
import portainer from "@/lib/server/portainer";

export async function GET() {
    try {
        console.log("Testing Portainer API connectivity...");

        // Test basic connectivity
        const isConnected = await portainer.testConnection();

        if (!isConnected) {
            return NextResponse.json({
                success: false,
                error: "Failed to connect to Portainer API",
                details: "Connection test returned false"
            }, { status: 500 });
        }

        // Get environments
        const environments = await portainer.getEnvironments();

        // Get system info
        let systemInfo;
        try {
            systemInfo = await portainer.getSystemInfo();
        } catch {
            systemInfo = { error: "Could not fetch system info" };
        }

        return NextResponse.json({
            success: true,
            connected: isConnected,
            environments: environments.map((env: { Id: number; Name: string }) => ({
                id: env.Id,
                name: env.Name
            })),
            systemInfo
        }, { status: 200 });

    } catch (error) {
        console.error("Portainer test error:", error);
        return NextResponse.json({
            success: false,
            error: "Portainer API test failed",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
