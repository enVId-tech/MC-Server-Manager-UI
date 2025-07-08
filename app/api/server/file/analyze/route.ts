import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import extract from 'extract-zip';
import * as nbt from 'prismarine-nbt';

interface FileAnalysisResult {
  type: 'world' | 'plugin' | 'mod' | 'resource-pack' | 'datapack' | 'unknown';
  serverType?: 'vanilla' | 'bukkit' | 'spigot' | 'paper' | 'forge' | 'fabric' | 'quilt' | 'neoforge';
  minecraftVersion?: string;
  worldName?: string;
  worldType?: 'overworld' | 'nether' | 'end' | 'custom';
  dimensions?: string[];
  hasPlayerData?: boolean;
  pluginName?: string;
  modName?: string;
  modLoader?: 'forge' | 'fabric' | 'quilt' | 'neoforge';
  dependencies?: string[];
  description?: string;
  author?: string;
  version?: string;
  errors?: string[];
  warnings?: string[];
  fileName?: string;
  fileSize?: number;
  extractedPath?: string;
  // Advanced world analysis fields
  gameMode?: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
  hardcore?: boolean;
  cheatsEnabled?: boolean;
  seed?: string;
  spawnX?: number;
  spawnY?: number;
  spawnZ?: number;
  timeOfDay?: number;
  worldAge?: number;
  playerCount?: number;
  structures?: string[];
  datapacks?: string[];
  gamerules?: { [key: string]: string | number | boolean };
  worldBorder?: {
    centerX: number;
    centerZ: number;
    size: number;
    damageAmount: number;
    damageBuffer: number;
    warningDistance: number;
    warningTime: number;
  };
  biomesFound?: string[];
  estimatedSize?: {
    totalSizeMB: number;
    regionFiles: number;
    chunkCount: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Create temporary directory for analysis
    const tempDir = path.join(process.cwd(), 'temp', 'analysis', Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Save uploaded file
      const filePath = path.join(tempDir, file.name);
      const bytes = await file.arrayBuffer();
      await fs.writeFile(filePath, Buffer.from(bytes));

      // Analyze the file
      const analysis = await analyzeFile(filePath, file.name);

      return NextResponse.json({ analysis });
    } finally {
      // Cleanup temporary files
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('File analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze file' },
      { status: 500 }
    );
  }
}

async function analyzeFile(filePath: string, fileName: string): Promise<FileAnalysisResult> {
  const result: FileAnalysisResult = {
    type: 'unknown',
    errors: [],
    warnings: []
  };

  const fileExt = path.extname(fileName).toLowerCase();
  // const baseName = path.basename(fileName, fileExt);

  try {
    if (fileExt === '.zip') {
      // Extract and analyze ZIP contents
      const extractDir = path.join(path.dirname(filePath), 'extracted');
      await fs.mkdir(extractDir, { recursive: true });
      
      try {
        await extract(filePath, { dir: extractDir });
        return await analyzeExtractedContents(extractDir, fileName, result);
      } finally {
        await fs.rm(extractDir, { recursive: true, force: true });
      }
    } else if (fileExt === '.jar') {
      // Analyze JAR file (plugin/mod)
      return await analyzeJarFile(filePath, fileName, result);
    } else if (fileExt === '.toml' || fileExt === '.json') {
      // Analyze configuration files
      return await analyzeConfigFile(filePath, fileName, result);
    } else {
      result.warnings?.push(`Unsupported file extension: ${fileExt}`);
      return result;
    }
  } catch (error) {
    result.errors?.push(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
}

async function analyzeExtractedContents(extractDir: string, fileName: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  // const contents = await fs.readdir(extractDir, { withFileTypes: true });
  
  // Check for world files
  const hasLevelDat = await checkFileExists(extractDir, 'level.dat');
  // const hasRegionFolder = await checkFileExists(extractDir, 'region');
  const hasPlayerDataFolder = await checkFileExists(extractDir, 'playerdata');
  // const hasAdvancementsFolder = await checkFileExists(extractDir, 'advancements');
  // const hasStatsFolder = await checkFileExists(extractDir, 'stats');

  if (hasLevelDat) {
    result.type = 'world';
    result.worldName = path.basename(fileName, '.zip');
    result.hasPlayerData = hasPlayerDataFolder;

    // Analyze level.dat for more details
    try {
      // const levelDatPath = path.join(extractDir, 'level.dat');
      // Note: In a real implementation, you'd use NBT parsing library
      // For now, we'll do basic detection
      result.worldType = 'overworld';
      
      // Check for dimension folders
      const dimensions = [];
      if (await checkFileExists(extractDir, 'DIM-1')) dimensions.push('nether');
      if (await checkFileExists(extractDir, 'DIM1')) dimensions.push('end');
      if (await checkFileExists(extractDir, 'region')) dimensions.push('overworld');
      
      result.dimensions = dimensions;
    } catch {
      result.warnings?.push('Could not parse level.dat file');
    }

    return result;
  }

  // Check for mod/plugin structure
  const hasModsToml = await checkFileExists(extractDir, 'META-INF/mods.toml');
  const hasFabricMod = await checkFileExists(extractDir, 'fabric.mod.json');
  const hasQuiltMod = await checkFileExists(extractDir, 'quilt.mod.json');
  const hasPluginYml = await checkFileExists(extractDir, 'plugin.yml');
  const hasPaperPlugin = await checkFileExists(extractDir, 'paper-plugin.yml');

  if (hasModsToml) {
    result.type = 'mod';
    result.modLoader = 'forge';
    return await parseModsToml(path.join(extractDir, 'META-INF/mods.toml'), result);
  } else if (hasFabricMod) {
    result.type = 'mod';
    result.modLoader = 'fabric';
    return await parseFabricMod(path.join(extractDir, 'fabric.mod.json'), result);
  } else if (hasQuiltMod) {
    result.type = 'mod';
    result.modLoader = 'quilt';
    return await parseQuiltMod(path.join(extractDir, 'quilt.mod.json'), result);
  } else if (hasPluginYml) {
    result.type = 'plugin';
    result.serverType = 'bukkit';
    return await parsePluginYml(path.join(extractDir, 'plugin.yml'), result);
  } else if (hasPaperPlugin) {
    result.type = 'plugin';
    result.serverType = 'paper';
    return await parsePluginYml(path.join(extractDir, 'paper-plugin.yml'), result);
  }

  // Check for resource pack
  const hasPackMcmeta = await checkFileExists(extractDir, 'pack.mcmeta');
  if (hasPackMcmeta) {
    result.type = 'resource-pack';
    return await parsePackMcmeta(path.join(extractDir, 'pack.mcmeta'), result);
  }

  // Check for datapack
  const hasDatapackMcmeta = await checkFileExists(extractDir, 'pack.mcmeta');
  const hasDataFolder = await checkFileExists(extractDir, 'data');
  if (hasDatapackMcmeta && hasDataFolder) {
    result.type = 'datapack';
    return await parsePackMcmeta(path.join(extractDir, 'pack.mcmeta'), result);
  }

  result.warnings?.push('Could not determine file type from contents');
  return result;
}

async function analyzeJarFile(filePath: string, fileName: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    // Check for mod/plugin indicators
    const hasModsToml = entries.some(entry => entry.entryName === 'META-INF/mods.toml');
    const hasFabricMod = entries.some(entry => entry.entryName === 'fabric.mod.json');
    const hasQuiltMod = entries.some(entry => entry.entryName === 'quilt.mod.json');
    const hasPluginYml = entries.some(entry => entry.entryName === 'plugin.yml');
    const hasPaperPlugin = entries.some(entry => entry.entryName === 'paper-plugin.yml');

    if (hasModsToml) {
      result.type = 'mod';
      result.modLoader = 'forge';
      const modsTomlEntry = entries.find(entry => entry.entryName === 'META-INF/mods.toml');
      if (modsTomlEntry) {
        return await parseModsTomlContent(modsTomlEntry.getData().toString(), result);
      }
    } else if (hasFabricMod) {
      result.type = 'mod';
      result.modLoader = 'fabric';
      const fabricModEntry = entries.find(entry => entry.entryName === 'fabric.mod.json');
      if (fabricModEntry) {
        return await parseFabricModContent(fabricModEntry.getData().toString(), result);
      }
    } else if (hasQuiltMod) {
      result.type = 'mod';
      result.modLoader = 'quilt';
      const quiltModEntry = entries.find(entry => entry.entryName === 'quilt.mod.json');
      if (quiltModEntry) {
        return await parseQuiltModContent(quiltModEntry.getData().toString(), result);
      }
    } else if (hasPluginYml) {
      result.type = 'plugin';
      result.serverType = 'bukkit';
      const pluginYmlEntry = entries.find(entry => entry.entryName === 'plugin.yml');
      if (pluginYmlEntry) {
        return await parsePluginYmlContent(pluginYmlEntry.getData().toString(), result);
      }
    } else if (hasPaperPlugin) {
      result.type = 'plugin';
      result.serverType = 'paper';
      const paperPluginEntry = entries.find(entry => entry.entryName === 'paper-plugin.yml');
      if (paperPluginEntry) {
        return await parsePluginYmlContent(paperPluginEntry.getData().toString(), result);
      }
    }

    result.warnings?.push('JAR file does not appear to be a recognized mod or plugin');
    return result;
  } catch (error) {
    result.errors?.push(`Failed to analyze JAR file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
}

async function analyzeConfigFile(filePath: string, fileName: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    if (fileName.endsWith('.toml')) {
      if (fileName === 'mods.toml') {
        result.type = 'mod';
        result.modLoader = 'forge';
        return await parseModsTomlContent(content, result);
      }
    } else if (fileName.endsWith('.json')) {
      if (fileName === 'fabric.mod.json') {
        result.type = 'mod';
        result.modLoader = 'fabric';
        return await parseFabricModContent(content, result);
      } else if (fileName === 'quilt.mod.json') {
        result.type = 'mod';
        result.modLoader = 'quilt';
        return await parseQuiltModContent(content, result);
      } else if (fileName === 'pack.mcmeta') {
        return await parsePackMcmetaContent(content, result);
      }
    }

    result.warnings?.push(`Unrecognized config file: ${fileName}`);
    return result;
  } catch (error) {
    result.errors?.push(`Failed to parse config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
}

// Helper functions for parsing specific file formats
async function parseModsToml(filePath: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parseModsTomlContent(content, result);
}

async function parseModsTomlContent(content: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  try {
    // Basic TOML parsing for mod information
    const modNameMatch = content.match(/displayName\s*=\s*"([^"]+)"/);
    const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
    const authorMatch = content.match(/authors\s*=\s*"([^"]+)"/);
    const descriptionMatch = content.match(/description\s*=\s*"([^"]+)"/);
    const mcVersionMatch = content.match(/minecraftVersion\s*=\s*"([^"]+)"/);

    if (modNameMatch) result.modName = modNameMatch[1];
    if (versionMatch) result.version = versionMatch[1];
    if (authorMatch) result.author = authorMatch[1];
    if (descriptionMatch) result.description = descriptionMatch[1];
    if (mcVersionMatch) result.minecraftVersion = mcVersionMatch[1];

    return result;
  } catch {
    result.errors?.push('Failed to parse mods.toml');
    return result;
  }
}

async function parseFabricMod(filePath: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parseFabricModContent(content, result);
}

async function parseFabricModContent(content: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  try {
    const modInfo = JSON.parse(content);
    
    result.modName = modInfo.name || modInfo.id;
    result.version = modInfo.version;
    result.description = modInfo.description;
    result.author = Array.isArray(modInfo.authors) ? modInfo.authors.join(', ') : modInfo.authors;
    
    if (modInfo.depends && modInfo.depends.minecraft) {
      result.minecraftVersion = modInfo.depends.minecraft;
    }

    if (modInfo.depends) {
      result.dependencies = Object.keys(modInfo.depends);
    }

    return result;
  } catch {
    result.errors?.push('Failed to parse fabric.mod.json');
    return result;
  }
}

async function parseQuiltMod(filePath: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parseQuiltModContent(content, result);
}

async function parseQuiltModContent(content: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  try {
    const modInfo = JSON.parse(content);
    
    result.modName = modInfo.quilt_loader?.metadata?.name || modInfo.quilt_loader?.id;
    result.version = modInfo.quilt_loader?.version;
    result.description = modInfo.quilt_loader?.metadata?.description;
    result.author = modInfo.quilt_loader?.metadata?.contributors?.join(', ');
    
    if (modInfo.quilt_loader?.depends) {
      result.dependencies = Object.keys(modInfo.quilt_loader.depends);
    }

    return result;
  } catch {
    result.errors?.push('Failed to parse quilt.mod.json');
    return result;
  }
}

async function parsePluginYml(filePath: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parsePluginYmlContent(content, result);
}

async function parsePluginYmlContent(content: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  try {
    // Basic YAML parsing for plugin information
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const versionMatch = content.match(/^version:\s*(.+)$/m);
    const authorMatch = content.match(/^author:\s*(.+)$/m);
    const authorsMatch = content.match(/^authors:\s*\[(.*)\]$/m);
    const descriptionMatch = content.match(/^description:\s*(.+)$/m);
    const apiVersionMatch = content.match(/^api-version:\s*(.+)$/m);
    const dependsMatch = content.match(/^depend:\s*\[(.*)\]$/m);
    const softDependsMatch = content.match(/^softdepend:\s*\[(.*)\]$/m);

    if (nameMatch) result.pluginName = nameMatch[1].trim();
    if (versionMatch) result.version = versionMatch[1].trim();
    if (authorMatch) result.author = authorMatch[1].trim();
    if (authorsMatch) result.author = authorsMatch[1].trim();
    if (descriptionMatch) result.description = descriptionMatch[1].trim();
    if (apiVersionMatch) result.minecraftVersion = apiVersionMatch[1].trim();

    const dependencies = [];
    if (dependsMatch) dependencies.push(...dependsMatch[1].split(',').map(s => s.trim()));
    if (softDependsMatch) dependencies.push(...softDependsMatch[1].split(',').map(s => s.trim()));
    if (dependencies.length > 0) result.dependencies = dependencies;

    return result;
  } catch {
    result.errors?.push('Failed to parse plugin.yml');
    return result;
  }
}

async function parsePackMcmeta(filePath: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parsePackMcmetaContent(content, result);
}

async function parsePackMcmetaContent(content: string, result: FileAnalysisResult): Promise<FileAnalysisResult> {
  try {
    const packInfo = JSON.parse(content);
    
    if (packInfo.pack) {
      result.description = packInfo.pack.description;
      // Determine pack format to Minecraft version mapping
      const packFormat = packInfo.pack.pack_format;
      result.minecraftVersion = getMinecraftVersionFromPackFormat(packFormat);
    }

    return result;
  } catch {
    result.errors?.push('Failed to parse pack.mcmeta');
    return result;
  }
}

function getMinecraftVersionFromPackFormat(packFormat: number): string {
  // Resource pack format to Minecraft version mapping
  const formatMap: { [key: number]: string } = {
    1: "1.6-1.8",
    2: "1.9-1.10",
    3: "1.11-1.12",
    4: "1.13-1.14",
    5: "1.15-1.16",
    6: "1.16.2-1.16.5",
    7: "1.17-1.17.1",
    8: "1.18-1.18.2",
    9: "1.19-1.19.2",
    10: "1.19.3",
    11: "1.19.4",
    12: "1.20-1.20.1",
    13: "1.20.2",
    14: "1.20.3-1.20.4",
    15: "1.20.5-1.20.6",
    16: "1.21",
    17: "1.21.2-1.21.3"
  };
  
  return formatMap[packFormat] || "Unknown";
}

async function checkFileExists(basePath: string, relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(basePath, relativePath));
    return true;
  } catch {
    return false;
  }
}
