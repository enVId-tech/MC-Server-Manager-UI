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
  // World directory location information
  worldDirectory?: {
    absolutePath: string;
    relativePath: string | null;
    matchType: 'level.dat' | 'region' | 'playerdata';
  };
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
  // Use the new world locator to find world files more intelligently
  const worldLocation = await locateWorldDirectory(extractDir);
  
  if (worldLocation.matchType !== 'none') {
    result.type = 'world';
    result.worldName = path.basename(fileName, '.zip');
    
    // Store world location information for later use
    result.worldDirectory = {
      absolutePath: worldLocation.worldPath!,
      relativePath: worldLocation.relativePath,
      matchType: worldLocation.matchType
    };

    const worldDir = worldLocation.worldPath!;
    
    // Check if this world directory has player data
    result.hasPlayerData = await checkFileExists(worldDir, 'playerdata');

    // Perform comprehensive world analysis using the located world directory
    await analyzeWorldStructure(worldDir, result);
    
    // Only analyze level.dat if we found it
    if (worldLocation.matchType === 'level.dat') {
      await analyzeLevelDat(worldDir, result);
    } else {
      result.warnings?.push(`World identified by ${worldLocation.matchType} folder, but no level.dat found`);
    }
    
    await analyzePlayerData(worldDir, result);
    await analyzeDatapacks(worldDir, result);
    await estimateWorldSize(worldDir, result);

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

// Advanced World Analysis Functions

// Helper functions for world analysis

async function getRegionFiles(regionPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(regionPath);
    return files.filter(file => file.endsWith('.mca'));
  } catch {
    return [];
  }
}

function getGameModeName(gameType: number): 'survival' | 'creative' | 'adventure' | 'spectator' {
  switch (gameType) {
    case 0: return 'survival';
    case 1: return 'creative';
    case 2: return 'adventure';
    case 3: return 'spectator';
    default: return 'survival';
  }
}

function getDifficultyName(difficulty: number): 'peaceful' | 'easy' | 'normal' | 'hard' {
  switch (difficulty) {
    case 0: return 'peaceful';
    case 1: return 'easy';
    case 2: return 'normal';
    case 3: return 'hard';
    default: return 'normal';
  }
}

function getVersionFromDataVersion(dataVersion: number): string {
  // Minecraft data version to version mapping (simplified)
  const versionMap: { [key: number]: string } = {
    1631: '1.12.2',
    1976: '1.13.2',
    2230: '1.14.4',
    2586: '1.15.2',
    2724: '1.16.5',
    2860: '1.17.1',
    2975: '1.18.2',
    3120: '1.19.4',
    3465: '1.20.1',
    3578: '1.20.2',
    3698: '1.20.4',
    3837: '1.20.6',
    3953: '1.21'
  };

  // Find the closest version
  const versions = Object.keys(versionMap).map(Number).sort((a, b) => a - b);
  let bestMatch = versions[0];
  
  for (const version of versions) {
    if (dataVersion >= version) {
      bestMatch = version;
    } else {
      break;
    }
  }

  return versionMap[bestMatch] || 'Unknown';
}

async function analyzeWorldStructure(extractDir: string, result: FileAnalysisResult): Promise<void> {
  try {
    const dimensions = [];
    const structures = [];

    // Check for dimension folders and their structure
    if (await checkFileExists(extractDir, 'region')) {
      dimensions.push('overworld');
      const regionFiles = await getRegionFiles(path.join(extractDir, 'region'));
      if (regionFiles.length > 0) {
        structures.push(`${regionFiles.length} overworld region files`);
      }
    }
    
    if (await checkFileExists(extractDir, 'DIM-1/region')) {
      dimensions.push('nether');
      const netherRegionFiles = await getRegionFiles(path.join(extractDir, 'DIM-1/region'));
      if (netherRegionFiles.length > 0) {
        structures.push(`${netherRegionFiles.length} nether region files`);
      }
    }
    
    if (await checkFileExists(extractDir, 'DIM1/region')) {
      dimensions.push('end');
      const endRegionFiles = await getRegionFiles(path.join(extractDir, 'DIM1/region'));
      if (endRegionFiles.length > 0) {
        structures.push(`${endRegionFiles.length} end region files`);
      }
    }

    // Check for modern dimension structure (1.16+)
    const dimensionFolders = ['minecraft', 'dimensions'];
    for (const dimFolder of dimensionFolders) {
      if (await checkFileExists(extractDir, `dimensions/${dimFolder}`)) {
        const dimContents = await fs.readdir(path.join(extractDir, 'dimensions', dimFolder));
        for (const dim of dimContents) {
          if (!dimensions.includes(dim)) {
            dimensions.push(dim);
          }
        }
      }
    }

    // Check for various world features
    if (await checkFileExists(extractDir, 'advancements')) {
      structures.push('player advancements');
    }
    if (await checkFileExists(extractDir, 'stats')) {
      structures.push('player statistics');
    }
    if (await checkFileExists(extractDir, 'poi')) {
      structures.push('points of interest');
    }
    if (await checkFileExists(extractDir, 'entities')) {
      structures.push('entity data');
    }
    if (await checkFileExists(extractDir, 'generated')) {
      structures.push('generated structures');
    }

    result.dimensions = dimensions;
    result.structures = structures;
  } catch {
    result.warnings?.push('Could not analyze world structure completely');
  }
}

async function analyzeLevelDat(extractDir: string, result: FileAnalysisResult): Promise<void> {
  try {
    const levelDatPath = path.join(extractDir, 'level.dat');
    const levelData = await fs.readFile(levelDatPath);
    
    // Parse NBT data
    const { parsed } = await nbt.parse(levelData);
    const data = nbt.simplify(parsed);

    if (data && data.Data) {
      const levelInfo = data.Data;

      // Basic world information
      result.worldName = levelInfo.LevelName || result.worldName;
      result.minecraftVersion = levelInfo.Version?.Name || getVersionFromDataVersion(levelInfo.DataVersion);
      
      // Game settings
      result.gameMode = getGameModeName(levelInfo.GameType || 0);
      result.difficulty = getDifficultyName(levelInfo.Difficulty || 1);
      result.hardcore = Boolean(levelInfo.hardcore);
      result.cheatsEnabled = Boolean(levelInfo.allowCommands);

      // World generation info
      if (levelInfo.generatorName) {
        result.worldType = levelInfo.generatorName;
      }
      if (levelInfo.RandomSeed) {
        result.seed = levelInfo.RandomSeed.toString();
      }

      // Spawn location
      result.spawnX = levelInfo.SpawnX;
      result.spawnY = levelInfo.SpawnY;
      result.spawnZ = levelInfo.SpawnZ;

      // Time information
      result.timeOfDay = levelInfo.DayTime;
      result.worldAge = levelInfo.Time;

      // Gamerules
      if (levelInfo.GameRules) {
        result.gamerules = levelInfo.GameRules;
      }

      // World border
      if (levelInfo.WorldBorder) {
        result.worldBorder = {
          centerX: levelInfo.WorldBorder.CenterX || 0,
          centerZ: levelInfo.WorldBorder.CenterZ || 0,
          size: levelInfo.WorldBorder.Size || 60000000,
          damageAmount: levelInfo.WorldBorder.DamageAmount || 0.2,
          damageBuffer: levelInfo.WorldBorder.DamageBuffer || 5,
          warningDistance: levelInfo.WorldBorder.WarningDistance || 5,
          warningTime: levelInfo.WorldBorder.WarningTime || 15
        };
      }

      // Datapacks
      if (levelInfo.DataPacks && levelInfo.DataPacks.Enabled) {
        result.datapacks = levelInfo.DataPacks.Enabled;
      }
    }
  } catch {
    result.warnings?.push('Could not parse level.dat file - may be corrupted or in unsupported format');
  }
}

async function analyzePlayerData(extractDir: string, result: FileAnalysisResult): Promise<void> {
  try {
    const playerDataPath = path.join(extractDir, 'playerdata');
    if (await checkFileExists(extractDir, 'playerdata')) {
      const playerFiles = await fs.readdir(playerDataPath);
      result.playerCount = playerFiles.filter(file => file.endsWith('.dat')).length;
    }

    // Check for specific player files
    if (await checkFileExists(extractDir, 'level.dat_old')) {
      result.structures?.push('backup level data');
    }

    if (await checkFileExists(extractDir, 'session.lock')) {
      result.warnings?.push('World may have been opened in single-player mode');
    }
  } catch {
    result.warnings?.push('Could not analyze player data');
  }
}

async function analyzeDatapacks(extractDir: string, result: FileAnalysisResult): Promise<void> {
  try {
    const datapacksPath = path.join(extractDir, 'datapacks');
    if (await checkFileExists(extractDir, 'datapacks')) {
      const datapacks = await fs.readdir(datapacksPath);
      const datapackNames = [];
      
      for (const datapack of datapacks) {
        if (datapack !== '.DS_Store') {
          datapackNames.push(datapack);
        }
      }
      
      if (datapackNames.length > 0) {
        result.datapacks = datapackNames;
        result.structures?.push(`${datapackNames.length} datapacks installed`);
      }
    }
  } catch {
    result.warnings?.push('Could not analyze datapacks');
  }
}

async function estimateWorldSize(extractDir: string, result: FileAnalysisResult): Promise<void> {
  try {
    let totalSize = 0;
    let regionFiles = 0;
    let chunkCount = 0;

    // Calculate size recursively
    const calculateSize = async (dirPath: string): Promise<void> => {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          await calculateSize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
          
          if (item.name.endsWith('.mca')) {
            regionFiles++;
            // Estimate chunks per region file (each region can have up to 1024 chunks)
            chunkCount += Math.min(1024, Math.floor(stats.size / 1024)); // Rough estimate
          }
        }
      }
    };

    await calculateSize(extractDir);

    result.estimatedSize = {
      totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
      regionFiles,
      chunkCount
    };

  } catch {
    result.warnings?.push('Could not estimate world size');
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

/**
 * Locate the closest world directory within a zip file by finding level.dat or fallback indicators
 * Uses hierarchy depth and ASCII comparison for conflict resolution
 * @param extractDir - The directory where the zip was extracted
 * @returns Object containing the world path and type of match found
 */
async function locateWorldDirectory(extractDir: string): Promise<{
  worldPath: string | null;
  matchType: 'level.dat' | 'region' | 'playerdata' | 'none';
  relativePath: string | null;
}> {
  interface WorldCandidate {
    path: string;
    relativePath: string;
    depth: number;
    matchType: 'level.dat' | 'region' | 'playerdata';
    parentFolderName: string;
  }

  const candidates: WorldCandidate[] = [];

  // Recursive function to search through directory structure
  async function searchDirectory(currentPath: string, relativePath: string, depth: number): Promise<void> {
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });
      
      // Check for level.dat in current directory
      const hasLevelDat = items.some(item => item.isFile() && item.name === 'level.dat');
      if (hasLevelDat) {
        const parentFolderName = path.basename(currentPath);
        candidates.push({
          path: currentPath,
          relativePath,
          depth,
          matchType: 'level.dat',
          parentFolderName
        });
        return; // level.dat found, no need to search deeper in this branch
      }

      // Check for fallback indicators (region or playerdata folders)
      const hasRegion = items.some(item => item.isDirectory() && item.name === 'region');
      const hasPlayerdata = items.some(item => item.isDirectory() && item.name === 'playerdata');

      if (hasRegion) {
        const parentFolderName = path.basename(currentPath);
        candidates.push({
          path: currentPath,
          relativePath,
          depth,
          matchType: 'region',
          parentFolderName
        });
      }

      if (hasPlayerdata) {
        const parentFolderName = path.basename(currentPath);
        candidates.push({
          path: currentPath,
          relativePath,
          depth,
          matchType: 'playerdata',
          parentFolderName
        });
      }

      // Continue searching subdirectories
      for (const item of items) {
        if (item.isDirectory()) {
          const subPath = path.join(currentPath, item.name);
          const subRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
          await searchDirectory(subPath, subRelativePath, depth + 1);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
      console.warn(`Could not read directory ${currentPath}:`, error);
    }
  }

  // Start the search from the root
  await searchDirectory(extractDir, '', 0);

  if (candidates.length === 0) {
    return { worldPath: null, matchType: 'none', relativePath: null };
  }

  // Sort candidates by priority:
  // 1. level.dat matches first (highest priority)
  // 2. Lower depth (closer to root)
  // 3. ASCII comparison of parent folder names (earlier in ASCII = higher priority)
  candidates.sort((a, b) => {
    // Priority 1: level.dat always wins
    if (a.matchType === 'level.dat' && b.matchType !== 'level.dat') return -1;
    if (b.matchType === 'level.dat' && a.matchType !== 'level.dat') return 1;

    // Priority 2: Hierarchy depth (closer to root wins)
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }

    // Priority 3: ASCII comparison of parent folder names
    // Find first differentiating character and choose the one closer to 0 in ASCII
    const aName = a.parentFolderName.toLowerCase();
    const bName = b.parentFolderName.toLowerCase();
    
    const maxLength = Math.max(aName.length, bName.length);
    for (let i = 0; i < maxLength; i++) {
      const aChar = aName.charCodeAt(i) || Number.MAX_SAFE_INTEGER; // Treat missing chars as high value
      const bChar = bName.charCodeAt(i) || Number.MAX_SAFE_INTEGER;
      
      if (aChar !== bChar) {
        return aChar - bChar; // Lower ASCII value wins
      }
    }

    // If all characters are the same, shorter name wins
    return aName.length - bName.length;
  });

  const winner = candidates[0];
  
  console.log(`World directory located: ${winner.relativePath || '(root)'} (${winner.matchType} match)`);
  if (candidates.length > 1) {
    console.log(`Other candidates found: ${candidates.slice(1).map(c => `${c.relativePath || '(root)'} (${c.matchType})`).join(', ')}`);
  }

  return {
    worldPath: winner.path,
    matchType: winner.matchType,
    relativePath: winner.relativePath || null
  };
}
