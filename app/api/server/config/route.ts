import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import ServerConfig from "@/lib/objects/ServerConfig";

export async function GET(request: Request) {
    try {
        console.log("Fetching all server configurations...");
        
        // Connect to database
        await dbConnect.connect();

        // Use lean() to get plain objects and avoid schema validation issues
        const serverConfigs = await ServerConfig.find({}).lean().select("-__v -createdAt -updatedAt");

        if (!serverConfigs || serverConfigs.length === 0) {
            return NextResponse.json({ error: "No server configurations found." }, { status: 404 });
        }

        // Structure the response based on config types
        const response: { [key: string]: any } = {};
        
        serverConfigs.forEach((config: any) => {
            if (config.versions && config.versions.length > 0) {
                response.versions = config.versions;
            }
            if (config.serverTypes && config.serverTypes.length > 0) {
                response.serverTypes = config.serverTypes;
            }
        });

        return NextResponse.json(response, { status: 200 });
    } catch (error) {
        console.error("Error fetching server configurations:", error);
        return NextResponse.json({ error: "Failed to fetch server configurations." }, { status: 500 });
    }
}