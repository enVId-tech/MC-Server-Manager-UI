import Server from '@/lib/objects/Server';
import User from '@/lib/objects/User';
import portainer from './portainer';
import webdavService from './webdav';
import dbConnect from '@/lib/db/dbConnect';

export interface PortAllocationResult {
    success: boolean;
    port?: number;
    rconPort?: number;
    error?: string;
}

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
     */
    static async allocatePort(userEmail: string, needsRcon: boolean = false, environmentId: number = 1): Promise<PortAllocationResult> {
        try {
            await dbConnect();
            
            // Get user's reserved ports
            const user = await User.findOne({ email: userEmail });
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            
            // Get all used ports from Portainer - this is required
            const portainerUsedPorts = await portainer.getUsedPorts(environmentId);
            
            // Get all used ports from MongoDB
            const serversWithPorts = await Server.find({}, { port: 1, rconPort: 1 });
            const databaseUsedPorts = serversWithPorts.flatMap(server => 
                [server.port, server.rconPort].filter(port => port !== undefined && port !== null)
            );
            
            // Combine all used ports
            const allUsedPorts = [...new Set([...portainerUsedPorts, ...databaseUsedPorts])];
            
            // If user has reserved ports, try to use them first
            if (user.reservedPorts && user.reservedPorts.length > 0) {
                for (const reservedPort of user.reservedPorts) {
                    if (!allUsedPorts.includes(reservedPort)) {
                        let rconPort: number | undefined;
                        
                        if (needsRcon) {
                            // Find available RCON port (usually +10 from main port)
                            const potentialRconPort = reservedPort + 10;
                            if (potentialRconPort <= 25595 && !allUsedPorts.includes(potentialRconPort)) {
                                rconPort = potentialRconPort;
                            } else {
                                // Find any available port for RCON
                                for (let port = 25565; port <= 25595; port++) {
                                    if (!allUsedPorts.includes(port) && port !== reservedPort) {
                                        rconPort = port;
                                        break;
                                    }
                                }
                            }
                            
                            if (!rconPort) {
                                continue; // Try next reserved port if we can't find RCON port
                            }
                        }
                        
                        return { success: true, port: reservedPort, rconPort };
                    }
                }
            }
            
            // If no reserved ports available, find any available port in the range
            for (let port = 25565; port <= 25595; port++) {
                if (!allUsedPorts.includes(port)) {
                    let rconPort: number | undefined;
                    
                    if (needsRcon) {
                        // Try port + 10 for RCON
                        const potentialRconPort = port + 10;
                        if (potentialRconPort <= 25595 && !allUsedPorts.includes(potentialRconPort)) {
                            rconPort = potentialRconPort;
                        } else {
                            // Find any other available port for RCON
                            for (let rp = port + 1; rp <= 25595; rp++) {
                                if (!allUsedPorts.includes(rp)) {
                                    rconPort = rp;
                                    break;
                                }
                            }
                        }
                        
                        if (!rconPort) {
                            continue; // Try next port if we can't find RCON port
                        }
                    }
                    
                    return { success: true, port, rconPort };
                }
            }
            
            return { success: false, error: 'No available ports in the range 25565-25595' };
        } catch (error) {
            return {
                success: false,
                error: `Error allocating port: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    
    /**
     * Create server folder structure in WebDAV with rollback on failure
     */
    static async createServerFolder(uniqueId: string, userEmail: string): Promise<{ success: boolean; rollbackAction?: () => Promise<void>; error?: string }> {
        try {
            // Get base server path from environment variable
            const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
            
            // Extract user folder name from email (part before @)
            const userFolder = userEmail.split('@')[0];
            
            // Construct server path: /minecraft-servers/username/unique-id
            const serverPath = `${baseServerPath}/${userFolder}/${uniqueId}`;
            const foldersToCreate = [
                `${baseServerPath}/${userFolder}`, // User folder
                serverPath, // Server folder
                `${serverPath}/data`,
                `${serverPath}/plugins`,
                `${serverPath}/mods`,
                `${serverPath}/worlds`,
                `${serverPath}/backups`,
                `${serverPath}/config`,
                `${serverPath}/logs`
            ];
            
            const createdFolders: string[] = [];
            
            try {
                for (const folderPath of foldersToCreate) {
                    await webdavService.createDirectory(folderPath);
                    createdFolders.push(folderPath);
                }
                
                // Create initial server files
                const initialFiles = {
                    'server.properties': '# Minecraft server properties\n# This file will be automatically generated\n',
                    'eula.txt': 'eula=false\n',
                    'whitelist.json': '[]',
                    'ops.json': '[]',
                    'banned-players.json': '[]',
                    'banned-ips.json': '[]'
                };
                
                const uploadedFiles: string[] = [];
                
                for (const [fileName, content] of Object.entries(initialFiles)) {
                    const filePath = `${serverPath}/${fileName}`;
                    await webdavService.uploadFile(filePath, content);
                    uploadedFiles.push(filePath);
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
                
                return { success: true, rollbackAction };
            } catch (error) {
                // Immediate cleanup on failure
                for (const folderPath of createdFolders.reverse()) {
                    try {
                        await webdavService.deleteDirectory(folderPath);
                    } catch (deleteError) {
                        console.warn(`Could not clean up folder ${folderPath}:`, deleteError);
                    }
                }
                throw error;
            }
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
