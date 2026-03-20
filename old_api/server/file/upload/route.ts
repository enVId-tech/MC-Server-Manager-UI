import { NextRequest, NextResponse } from 'next/server';
import { createMinecraftServer, AnalyzedFile } from '@/lib/server/minecraft';
import verificationService from '@/lib/server/verify';
import { IUser } from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import dbConnect from '@/lib/db/dbConnect';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    
    // Verify user authentication
    const user: IUser | null = await verificationService.getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ message: 'User not found.' }, { status: 404 });
    }

    const formData = await request.formData();
    const serverId = formData.get('serverId') as string;
    const fileType = formData.get('fileType') as string; // 'world', 'plugin', 'mod'
    const file = formData.get('file') as File;
    const analysisData = formData.get('analysis') as string;

    if (!serverId || !fileType || !file) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Parse analysis data if provided
    let analysis = null;
    if (analysisData) {
      try {
        analysis = JSON.parse(analysisData);
      } catch (error) {
        console.warn('Failed to parse analysis data:', error);
      }
    }

    // Get server configuration
    const server = await Server.findOne({ uniqueId: serverId, email: user.email });
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    // Create MinecraftServer instance
    const minecraftServer = createMinecraftServer(
      {
        EULA: true,
        TYPE: (server.serverConfig?.serverType?.toUpperCase() as 'VANILLA' | 'SPIGOT' | 'PAPER' | 'BUKKIT' | 'PURPUR' | 'FORGE' | 'FABRIC') || 'VANILLA',
        VERSION: server.serverConfig?.version || 'LATEST',
        DIFFICULTY: (server.serverConfig?.difficulty as 'peaceful' | 'easy' | 'normal' | 'hard') || 'normal',
        GAMEMODE: (server.serverConfig?.gameMode as 'survival' | 'creative' | 'adventure' | 'spectator') || 'survival',
        MAX_PLAYERS: server.serverConfig?.maxPlayers || 20,
        PVP: server.serverConfig?.pvpEnabled !== false,
        ONLINE_MODE: server.serverConfig?.onlineMode !== false,
        GENERATE_STRUCTURES: server.serverConfig?.generateStructures !== false,
        LEVEL_TYPE: 'DEFAULT',
        MOTD: server.serverConfig?.motd || 'A Minecraft Server',
        SERVER_PORT: server.serverConfig?.port || 25565,
        userEmail: user.email
      },
      server.serverName,
      server.uniqueId,
      1, // environmentId
      user.email
    );

    // Handle different file types
    let uploadResult;
    
    switch (fileType) {
      case 'world':
        uploadResult = await minecraftServer.uploadWorldFile(file);
        break;
      case 'plugins':
        // Convert single file to array for compatibility and add analysis if available
        const pluginFile = file as AnalyzedFile;
        if (analysis) {
          pluginFile.analysis = analysis;
        }
        uploadResult = await minecraftServer.uploadPlugins([pluginFile]);
        break;
      case 'mods':
        // Convert single file to array for compatibility and add analysis if available
        const modFile = file as AnalyzedFile;
        if (analysis) {
          modFile.analysis = analysis;
        }
        uploadResult = await minecraftServer.uploadMods([modFile]);
        break;
      default:
        return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    if (uploadResult.success) {
      return NextResponse.json({ 
        success: true, 
        message: `${fileType} uploaded successfully` 
      });
    } else {
      return NextResponse.json({ 
        error: uploadResult.error || `Failed to upload ${fileType}` 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
