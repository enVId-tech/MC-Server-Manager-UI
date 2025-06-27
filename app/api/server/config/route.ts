import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import ServerConfig from "@/lib/objects/ServerConfig";

type ConfigDocument = Record<string, unknown>;
type ConfigResponse = Record<string, unknown[]>;

// Utility function to check if value is a non-empty array
function isNonEmptyArray(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.length > 0;
}

// Utility function to check if value is a plain object
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Extract configuration arrays from documents
function extractConfigArrays(configs: ConfigDocument[]): ConfigResponse {
    const response: ConfigResponse = {};
    
    configs.forEach(config => {
        Object.entries(config).forEach(([key, value]) => {
            if (isNonEmptyArray(value)) {
                response[key] = value;
            } else if (isPlainObject(value)) {
                Object.entries(value).forEach(([nestedKey, nestedValue]) => {
                    if (isNonEmptyArray(nestedValue)) {
                        response[`${key}.${nestedKey}`] = nestedValue;
                    }
                });
            }
        });
    });
    
    return response;
}

export async function GET() {
    try {
        console.log("Fetching all server configurations...");
        
        await dbConnect();
        await new Promise(resolve => setTimeout(resolve, 100));

        const serverConfigs = await ServerConfig.find({}).lean().select("-__v -createdAt -updatedAt") as ConfigDocument[];

        console.log("Found server configs:", serverConfigs.length);

        if (!serverConfigs || serverConfigs.length === 0) {
            return NextResponse.json({ error: "No server configurations found." }, { status: 404 });
        }

        const response = extractConfigArrays(serverConfigs);

        return NextResponse.json(response, { status: 200 });
    } catch (error) {
        console.error("Error fetching server configurations:", error);
        return NextResponse.json({ 
            error: "Failed to fetch server configurations.",
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}