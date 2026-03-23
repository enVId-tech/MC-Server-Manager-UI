import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Server, { IServer } from "@/lib/objects/Server";
import { IUser } from "@/lib/objects/User";
import BodyParser from "@/lib/db/bodyParser";
import portainer from "@/lib/server/portainer";
import MinecraftServerManager from "@/lib/server/serverManager";
import { createMinecraftServer, convertClientConfigToServerConfig, ClientServerConfig } from "@/lib/server/minecraft";
import verificationService from "@/lib/server/verify";
import velocityService from "@/lib/server/velocity";
import { FileInfo } from "@/lib/objects/ServerConfig";
import { definedProxies } from "@/lib/config/proxies";
import { proxyManager } from "@/lib/server/proxy-manager";
import { promises as fs } from 'fs';
import path from 'path';

// Minecraft Server Configuration
interface DatabaseServerConfig {
    name: string;
    serverType: string;
    version: string;
    description?: string;
    seed?: string;
    gameMode: string;
    difficulty: string;
    worldType: string;
    worldGeneration: string;
    maxPlayers: number;
    whitelistEnabled: boolean;
    onlineMode: boolean;
    pvpEnabled: boolean;
    commandBlocksEnabled: boolean;
    flightEnabled: boolean;
    spawnAnimalsEnabled: boolean;
    spawnMonstersEnabled: boolean;
    spawnNpcsEnabled: boolean;
    generateStructuresEnabled: boolean;
    port: number;
    viewDistance: number;
    simulationDistance: number;
    spawnProtection: number;
    rconEnabled: boolean;
    rconPassword: string;
    motd: string;
    resourcePackUrl?: string;
    resourcePackSha1?: string;
    resourcePackPrompt?: string;
    forceResourcePack: boolean;
    enableJmxMonitoring: boolean;
    syncChunkWrites: boolean;
    enforceWhitelist: boolean;
    preventProxyConnections: boolean;
    hideOnlinePlayers: boolean;
    broadcastRconToOps: boolean;
    broadcastConsoleToOps: boolean;
    serverMemory: number;
    serverProperties?: Record<string, string | number | boolean>;
    plugins?: FileInfo[];
    mods?: FileInfo[];
    worldFiles?: FileInfo;
}

export interface DeploymentStep {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    message?: string;
    error?: string;
}

export interface DeploymentStatus {
    serverId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    currentStep: string;
    steps: DeploymentStep[];
    error?: string;
}

const localDeploymentStatus = new Map<string, DeploymentStatus>();

export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        const { serverId } = await BodyParser.parseAuto(request);

        if (!serverId) {
            return NextResponse.json({ error: "Missing serverId in request body" }, { status: 400 });
        }

        const user: IUser | null = await verificationService.getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const server: IServer | null = await Server.findOne({ _id: serverId, owner: user._id });
    
        if (!server) {
            return NextResponse.json({ error: "Server not found" }, { status: 404 });
        }


    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// Get current deployment status for server setup
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const serverId = url.searchParams.get('serverId');

        if (!serverId) {
            return NextResponse.json({ error: "Missing serverId query parameter" }, { status: 400 });
        }

        const status = localDeploymentStatus.get(serverId);
        if (!status) {
            return NextResponse.json({ error: "Deployment status not found" }, { status: 404 });
        }

        return NextResponse.json(status);
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

async function updateStep(serverId: string, stepId: string, status: 'running' | 'completed' | 'failed', progress: number, message?: string, error?: string) {
    const deploymentStatus = localDeploymentStatus.get(serverId);
    if (!deploymentStatus) return;

    const step = deploymentStatus.steps.find(step => step.id === stepId);
    if (step) {
        step.status = status;
        step.progress = progress;
        if (message) step.message = message;
        if (error) step.error = error;
    }

    // Update overall progress
    const completedSteps = deploymentStatus.steps.filter(step => step.status === 'completed').length;
    const runningSteps = deploymentStatus.steps.filter(step => step.status === 'running').length;
    const totalSteps = deploymentStatus.steps.length;

    // Add a random amount between 15% and 85% that eventually equals to 100% progress (probably)
    const runningProgress = runningSteps > 0 ? Math.random() * 70 + 15 : 0;
    deploymentStatus.progress = Math.round(((completedSteps + runningProgress) / totalSteps) * 100);

    // Update current step
    const currentRunningStep = deploymentStatus.steps.find(step => step.status === 'running');
    if (currentRunningStep) {
        deploymentStatus.currentStep = message || currentRunningStep.name;
    } else if (status === 'completed' && completedSteps === totalSteps) {
        deploymentStatus.currentStep = 'Deployment completed successfully!';
    }

    localDeploymentStatus.set(serverId, deploymentStatus);

    // Log progress for debugging
    console.log(`[${serverId}] Step ${stepId}: ${status} (${progress}%) - ${message || ''}`);
}