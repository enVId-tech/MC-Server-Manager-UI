import { NextRequest, NextResponse } from "next/server";
import portainer from "@/lib/server/portainer";

export async function GET() {
    try {
        console.log("Testing Portainer API connectivity...");
        
        // Test basic connectivity
        const connectivityTest = await portainer.testApiConnectivity();
        
        if (!connectivityTest.success) {
            return NextResponse.json({
                success: false,
                error: "Failed to connect to Portainer API",
                details: connectivityTest.error
            }, { status: 500 });
        }
        
        // Get environments
        const environments = await portainer.getEnvironments();
        
        // Get system info
        let systemInfo;
        try {
            systemInfo = await portainer.getSystemInfo();
        } catch (error) {
            systemInfo = { error: "Could not fetch system info" };
        }
        
        return NextResponse.json({
            success: true,
            version: connectivityTest.version,
            environments: environments.map(env => ({
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
