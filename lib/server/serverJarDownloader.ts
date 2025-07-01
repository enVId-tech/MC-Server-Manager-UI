import axios from 'axios';

export interface MinecraftVersion {
    id: string;
    type: 'release' | 'snapshot';
    url: string;
    time: string;
    releaseTime: string;
}

export interface MinecraftVersionManifest {
    latest: {
        release: string;
        snapshot: string;
    };
    versions: MinecraftVersion[];
}

export interface ServerJarInfo {
    version: string;
    serverType: string;
    downloadUrl: string;
    fileName: string;
    size?: number;
}

/**
 * Service for downloading Minecraft server JARs from official sources
 */
export class MinecraftServerJarService {
    
    /**
     * Get the official Minecraft version manifest
     */
    static async getVersionManifest(): Promise<MinecraftVersionManifest> {
        try {
            const response = await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch Minecraft version manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Get download URL for Vanilla Minecraft server
     */
    static async getVanillaDownloadUrl(version: string): Promise<string> {
        try {
            const manifest = await this.getVersionManifest();
            
            if (version === 'LATEST') {
                version = manifest.latest.release;
            }
            
            const versionInfo = manifest.versions.find(v => v.id === version);
            
            if (!versionInfo) {
                throw new Error(`Version ${version} not found`);
            }
            
            // Get the version details
            const versionResponse = await axios.get(versionInfo.url);
            const versionData = versionResponse.data;
            
            if (!versionData.downloads?.server?.url) {
                throw new Error(`Server download not available for version ${version}`);
            }
            
            return versionData.downloads.server.url;
        } catch (error) {
            throw new Error(`Failed to get Vanilla download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Get download URL for PaperMC server
     */
    static async getPaperDownloadUrl(version: string): Promise<string> {
        try {
            if (version === 'LATEST') {
                // Get latest version from PaperMC API
                const versionsResponse = await axios.get('https://api.papermc.io/v2/projects/paper');
                const versions = versionsResponse.data.versions;
                version = versions[versions.length - 1];
            }
            
            // Get builds for the version
            const buildsResponse = await axios.get(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
            const builds = buildsResponse.data.builds;
            const latestBuild = builds[builds.length - 1];
            
            // Get download info for the latest build
            const buildResponse = await axios.get(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}`);
            const downloadName = buildResponse.data.downloads.application.name;
            
            return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/${downloadName}`;
        } catch (error) {
            throw new Error(`Failed to get Paper download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Get download URL for Spigot server
     */
    static async getSpigotDownloadUrl(): Promise<string> {
        // Spigot doesn't provide direct downloads via API, so we'll use BuildTools approach
        // For now, return a placeholder that indicates manual build is required
        return `https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar`;
    }
    
    /**
     * Get download URL for Purpur server
     */
    static async getPurpurDownloadUrl(version: string): Promise<string> {
        try {
            if (version === 'LATEST') {
                // Get latest version from Purpur API
                const versionsResponse = await axios.get('https://api.purpurmc.org/v2/purpur');
                const versions = versionsResponse.data.versions;
                version = versions[versions.length - 1];
            }
            
            // Get builds for the version
            const buildsResponse = await axios.get(`https://api.purpurmc.org/v2/purpur/${version}`);
            const builds = buildsResponse.data.builds;
            const latestBuild = builds.latest;
            
            return `https://api.purpurmc.org/v2/purpur/${version}/${latestBuild}/download`;
        } catch (error) {
            throw new Error(`Failed to get Purpur download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Get download URL for Fabric server
     */
    static async getFabricDownloadUrl(version: string): Promise<string> {
        try {
            if (version === 'LATEST') {
                // Get latest Minecraft version
                const manifest = await this.getVersionManifest();
                version = manifest.latest.release;
            }
            
            // Get Fabric loader versions
            const loaderResponse = await axios.get('https://meta.fabricmc.net/v2/versions/loader');
            const latestLoader = loaderResponse.data[0].version;
            
            // Get installer versions
            const installerResponse = await axios.get('https://meta.fabricmc.net/v2/versions/installer');
            const latestInstaller = installerResponse.data[0].version;
            
            return `https://meta.fabricmc.net/v2/versions/loader/${version}/${latestLoader}/${latestInstaller}/server/jar`;
        } catch (error) {
            throw new Error(`Failed to get Fabric download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Get server JAR information based on server type and version
     */
    static async getServerJarInfo(serverType: string, version: string): Promise<ServerJarInfo> {
        let downloadUrl: string;
        let fileName: string;
        
        switch (serverType.toUpperCase()) {
            case 'VANILLA':
                downloadUrl = await this.getVanillaDownloadUrl(version);
                fileName = `minecraft_server.${version}.jar`;
                break;
                
            case 'PAPER':
                downloadUrl = await this.getPaperDownloadUrl(version);
                fileName = `paper-${version}.jar`;
                break;
                
            case 'SPIGOT':
                downloadUrl = await this.getSpigotDownloadUrl();
                fileName = `spigot-${version}.jar`;
                break;
                
            case 'PURPUR':
                downloadUrl = await this.getPurpurDownloadUrl(version);
                fileName = `purpur-${version}.jar`;
                break;
                
            case 'FABRIC':
                downloadUrl = await this.getFabricDownloadUrl(version);
                fileName = `fabric-server-mc.${version}.jar`;
                break;
                
            default:
                throw new Error(`Unsupported server type: ${serverType}`);
        }
        
        return {
            version,
            serverType,
            downloadUrl,
            fileName
        };
    }
    
    /**
     * Download server JAR and return as Buffer
     */
    static async downloadServerJar(serverType: string, version: string): Promise<{ data: Buffer; fileName: string }> {
        try {
            const jarInfo = await this.getServerJarInfo(serverType, version);
            
            console.log(`Downloading ${serverType} ${version} from ${jarInfo.downloadUrl}`);
            
            const response = await axios.get(jarInfo.downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 300000, // 5 minutes timeout for large files
                maxContentLength: 100 * 1024 * 1024, // 100MB max
            });
            
            return {
                data: Buffer.from(response.data),
                fileName: jarInfo.fileName
            };
        } catch (error) {
            throw new Error(`Failed to download server JAR: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

export default MinecraftServerJarService;
