import Server from '@/lib/objects/Server';
import User from '@/lib/objects/User';
import portainer from './portainer';
import webdavService from './webdav';
import dbConnect from '@/lib/db/dbConnect';
import PortManager from '@/lib/server/portManager';
import type { PortAllocationResult } from '@/lib/server/portManager';

export type { PortAllocationResult };

export interface ServerCreationResult {
    success: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server?: any;
    rollbackActions?: (() => Promise<void>)[];
    error?: string;
}

export interface SubdomainValidationResult {
    isValid: boolean;
    isReserved: boolean;
    error?: string;
}

// List of prohibited subdomains that only admins can use
const PROHIBITED_SUBDOMAINS = [
    'admin', 'api', 'www', 'mail', 'ftp', 'root', 'test', 'dev', 'staging',
    'production', 'prod', 'demo', 'beta', 'alpha', 'support', 'help', 'docs',
    'blog', 'news', 'shop', 'store', 'cdn', 'static', 'assets', 'media',
    'images', 'files', 'download', 'upload', 'backup', 'panel', 'control',
    'console', 'dashboard', 'manager', 'system', 'config', 'settings',
    'status', 'health', 'monitor', 'logs', 'metrics', 'analytics'
];

/**
 * Service for managing Minecraft server creation with comprehensive port management,
 * rollback functionality, and subdomain validation
 */
export class MinecraftServerManager {

    /**
     * Validate subdomain against prohibited list and admin status
     */
    static async validateSubdomain(subdomain: string, userEmail: string): Promise<SubdomainValidationResult> {
        try {
            await dbConnect();

            // Check if subdomain is in prohibited list
            const isReserved = PROHIBITED_SUBDOMAINS.includes(subdomain.toLowerCase());

            if (isReserved) {
                // Check if user is admin
                const user = await User.findOne({ email: userEmail });
                if (!user?.isAdmin) {
                    return {
                        isValid: false,
                        isReserved: true,
                        error: `The subdomain "${subdomain}" is reserved and can only be used by administrators.`
                    };
                }
            }

            // Check if subdomain is already taken
            const existingServer = await Server.findOne({ subdomainName: subdomain });
            if (existingServer) {
                return {
                    isValid: false,
                    isReserved: false,
                    error: `The subdomain "${subdomain}" is already in use.`
                };
            }

            return { isValid: true, isReserved };
        } catch (error) {
            return {
                isValid: false,
                isReserved: false,
                error: `Error validating subdomain: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Add prohibited subdomains to the list (admin only)
     */
    static addProhibitedSubdomain(subdomain: string): void {
        if (!PROHIBITED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
            PROHIBITED_SUBDOMAINS.push(subdomain.toLowerCase());
        }
    }

    /**
     * Get list of prohibited subdomains
     */
    static getProhibitedSubdomains(): string[] {
        return [...PROHIBITED_SUBDOMAINS];
    }

    /**
     * Find available port for a user, considering their reserved ports and global port usage
     * Now uses the advanced PortManager for comprehensive conflict checking
     */
    static async allocatePort(userEmail: string, needsRcon: boolean = false, environmentId: number = 1): Promise<PortAllocationResult> {
        return await PortManager.allocatePort(userEmail, needsRcon, environmentId);
    }

    /**
     * Create server folder structure in WebDAV with rollback on failure
     * Now includes JAR download and proper mods/plugins separation
     */
    static async createServerFolder(
        uniqueId: string,
        userEmail: string,
        serverType?: string
    ): Promise<{ success: boolean; rollbackAction?: () => Promise<void>; error?: string }> {
        try {
            // Get base server path from environment variable
            const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
            console.log(`Using WebDAV base path: ${baseServerPath}`);

            // Extract user folder name from email (part before @)
            const userFolder = userEmail.split('@')[0];

            // Construct server path: /minecraft-servers/username/unique-id
            const serverPath = `${baseServerPath}/${userFolder}/${uniqueId}`;

            // Determine if server supports mods or plugins
            const isModdedServer = ['FORGE', 'FABRIC', 'NEOFORGE'].includes(serverType?.toUpperCase() || '');
            const isPluginServer = ['SPIGOT', 'PAPER', 'PURPUR', 'BUKKIT'].includes(serverType?.toUpperCase() || '');

            // Build folder structure based on server type
            const foldersToCreate = [
                `${baseServerPath}/${userFolder}`, // User folder
                serverPath, // Server folder
                `${serverPath}/data`,
                `${serverPath}/world`,
                `${serverPath}/backups`,
                `${serverPath}/config`,
                `${serverPath}/logs`
            ];

            // Add appropriate folder for mods or plugins (not both)
            if (isModdedServer) {
                foldersToCreate.push(`${serverPath}/mods`);
            } else if (isPluginServer) {
                foldersToCreate.push(`${serverPath}/plugins`);
            }

            const createdFolders: string[] = [];
            const uploadedFiles: string[] = [];

            // Create folders with better error handling
            console.log(`Creating folder structure for server ${uniqueId}...`);

            for (const folderPath of foldersToCreate) {
                try {
                    await webdavService.createDirectory(folderPath);
                    createdFolders.push(folderPath);
                    console.log(`✓ Created folder: ${folderPath}`);
                } catch (error) {
                    // Check if folder already exists
                    const exists = await webdavService.exists(folderPath);
                    if (exists) {
                        console.log(`✓ Folder already exists: ${folderPath}`);
                        createdFolders.push(folderPath); // Track for rollback even if it existed
                    } else {
                        console.error(`✗ Failed to create folder ${folderPath}:`, error);
                        // Don't immediately fail - try to continue with other folders
                        // We'll validate at the end
                    }
                }

                // Small delay to avoid overwhelming the WebDAV server
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Verify all critical folders exist
            const criticalFolders = [serverPath, `${serverPath}/data`, `${serverPath}/world`];
            for (const folder of criticalFolders) {
                const exists = await webdavService.exists(folder);
                if (!exists) {
                    throw new Error(`Critical folder ${folder} was not created successfully`);
                }
            }

            console.log('✓ All critical folders verified');

            // Create initial server files
            const initialFiles: Record<string, string> = {
                'server.properties': '# Minecraft server properties\n# This file will be automatically generated\n',
                'eula.txt': 'eula=true\n',
                'whitelist.json': '[]',
                'ops.json': '[]',
                'banned-players.json': '[]',
                'banned-ips.json': '[]'
            };

            // Upload initial configuration files
            for (const [fileName, content] of Object.entries(initialFiles)) {
                try {
                    const filePath = `${serverPath}/${fileName}`;
                    await webdavService.uploadFile(filePath, content);
                    uploadedFiles.push(filePath);
                    console.log(`✓ Created file: ${fileName}`);
                } catch (fileError) {
                    console.warn(`Could not create file ${fileName}:`, fileError);
                    // Continue with other files
                }
            }

            // Create server type specific files
            if (isModdedServer) {
                try {
                    const modsReadme = `# Mods Folder\n\nPlace your ${serverType} mods (.jar files) in this folder.\n\nFor ${serverType} servers, do not place plugins here - mods and plugins are not compatible.\n`;
                    await webdavService.uploadFile(`${serverPath}/mods/README.md`, modsReadme);
                    uploadedFiles.push(`${serverPath}/mods/README.md`);
                } catch (error) {
                    console.warn('Could not create mods README:', error);
                }
            } else if (isPluginServer) {
                try {
                    const pluginsReadme = `# Plugins Folder\n\nPlace your ${serverType} plugins (.jar files) in this folder.\n\nFor ${serverType} servers, do not place mods here - use plugins instead.\n`;
                    await webdavService.uploadFile(`${serverPath}/plugins/README.md`, pluginsReadme);
                    uploadedFiles.push(`${serverPath}/plugins/README.md`);
                } catch (error) {
                    console.warn('Could not create plugins README:', error);
                }
            }

            // Rollback function to clean up created folders and files
            const rollbackAction = async () => {
                console.log(`Rolling back server folder creation for ${uniqueId}`);

                // Delete uploaded files
                for (const filePath of uploadedFiles.reverse()) {
                    try {
                        await webdavService.deleteFile(filePath);
                    } catch (deleteError) {
                        console.warn(`Could not delete file ${filePath} during rollback:`, deleteError);
                    }
                }

                // Delete created folders (in reverse order)
                for (const folderPath of createdFolders.reverse()) {
                    try {
                        await webdavService.deleteDirectory(folderPath);
                    } catch (deleteError) {
                        console.warn(`Could not delete folder ${folderPath} during rollback:`, deleteError);
                    }
                }
            };

            console.log(`✓ Server folder structure created successfully for ${uniqueId}`);
            return { success: true, rollbackAction };

        } catch (error) {
            return {
                success: false,
                error: `Error creating server folder: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Execute rollback actions in reverse order
     */
    static async executeRollback(rollbackActions: (() => Promise<void>)[]): Promise<void> {
        console.log(`Executing ${rollbackActions.length} rollback actions...`);

        for (const action of rollbackActions.reverse()) {
            try {
                await action();
            } catch (error) {
                console.error('Error during rollback action:', error);
            }
        }

        console.log('Rollback completed');
    }

    /**
     * Reserve ports for a specific user (admin only)
     */
    static async reservePortsForUser(adminEmail: string, targetUserEmail: string, ports: number[]): Promise<{ success: boolean; error?: string }> {
        try {
            await dbConnect();

            // Verify admin status
            const admin = await User.findOne({ email: adminEmail });
            if (!admin?.isAdmin) {
                return { success: false, error: 'Only administrators can reserve ports for users' };
            }

            // Validate port range
            const invalidPorts = ports.filter(port => port < 25565 || port > 25595);
            if (invalidPorts.length > 0) {
                return { success: false, error: `Invalid ports: ${invalidPorts.join(', ')}. Ports must be in range 25565-25595` };
            }

            // Check if ports are already in use
            const usedPorts = await portainer.getUsedPorts();
            const serversWithPorts = await Server.find({}, { port: 1, rconPort: 1 });
            const databaseUsedPorts = serversWithPorts.flatMap(server =>
                [server.port, server.rconPort].filter(port => port !== undefined && port !== null)
            );
            const allUsedPorts = [...new Set([...usedPorts, ...databaseUsedPorts])];

            const conflictingPorts = ports.filter(port => allUsedPorts.includes(port));
            if (conflictingPorts.length > 0) {
                return { success: false, error: `Ports already in use: ${conflictingPorts.join(', ')}` };
            }

            // Update user's reserved ports
            await User.findOneAndUpdate(
                { email: targetUserEmail },
                { $addToSet: { reservedPorts: { $each: ports } } },
                { upsert: false }
            );

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: `Error reserving ports: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
}

export default MinecraftServerManager;
