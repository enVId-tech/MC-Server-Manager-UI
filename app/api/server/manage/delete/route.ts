import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Server from "@/lib/objects/Server";
import portainer from "@/lib/server/portainer";
import porkbun from "@/lib/server/porkbun";
import webdavService from "@/lib/server/webdav";
import { MinecraftServer } from "@/lib/server/minecraft";
import { IUser } from "@/lib/objects/User";
import verificationService from "@/lib/server/verify";

interface DeleteResult {
    message: string;
    serverId: string;
    serverName: string;
    containerRemoved: boolean;
    dnsRecordsRemoved: boolean;
    dnsCleanupDetails?: {
        srvRecordsDeleted: number;
        cnameRecordsDeleted: number;
        aRecordsDeleted: number;
        errors: string[];
    };
    filesArchived: boolean;
    archiveDetails?: {
        originalPath: string;
        archivedPath: string;
        archiveMethod: 'move' | 'copy_delete' | 'rename_fallback';
    };
    volumesRemoved: boolean;
    filesDeleted: boolean;
    deletedPathsCount: number;
    localPathsForCleanup: string[];
    warnings: string[];
    errors: string[];
}

export async function DELETE(request: NextRequest) {
    await dbConnect();
    
    const warnings: string[] = [];
    const errors: string[] = [];
    
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        // Get server identifier from request body
        const { uniqueId, force = true, removeVolumes = true, archiveFiles = true } = await request.json();
        if (!uniqueId) {
            return NextResponse.json({ message: 'Server identifier (uniqueId) is required.' }, { status: 400 });
        }

        // Find the server by slug (uniqueId, subdomain, or serverName)
        const server = await Server.findOne({
            $and: [
                { email: user.email }, // Ensure user owns the server
                {
                    $or: [
                        { uniqueId: uniqueId },
                        { subdomainName: uniqueId },
                        { serverName: uniqueId }
                    ]
                }
            ]
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found or access denied.' }, { status: 404 });
        }

        console.log(`Starting comprehensive deletion for server: ${server.serverName} (${server.uniqueId})`);

        // Initialize result object
        const result: DeleteResult = {
            message: 'Server deleted successfully.',
            serverId: server.uniqueId,
            serverName: server.serverName,
            containerRemoved: false,
            dnsRecordsRemoved: false,
            filesArchived: false,
            volumesRemoved: removeVolumes,
            filesDeleted: false,
            deletedPathsCount: 0,
            localPathsForCleanup: [],
            warnings,
            errors
        };

        // Step 1: Remove Portainer container
        console.log('Step 1: Removing Portainer container...');
        try {
            const containerIdentifier = `mc-${server.uniqueId}`;
            const container = await portainer.getContainerByIdentifier(containerIdentifier);

            if (container) {
                // If container is running, stop it first (unless force is true)
                if (container.State === 'running' && !force) {
                    try {
                        await portainer.stopContainer(container.Id);
                        console.log(`Stopped container ${containerIdentifier}`);
                    } catch (stopError) {
                        warnings.push(`Failed to stop container before deletion: ${stopError instanceof Error ? stopError.message : String(stopError)}`);
                        console.warn('Failed to stop container before deletion:', stopError);
                    }
                }

                // Remove the container
                await portainer.removeContainer(container.Id, null, force, removeVolumes);
                result.containerRemoved = true;
                console.log(`Successfully removed container ${containerIdentifier}`);
            } else {
                warnings.push(`No container found with identifier ${containerIdentifier}`);
                console.log(`No container found with identifier ${containerIdentifier}`);
            }
        } catch (error) {
            const errorMsg = `Failed to remove Portainer container: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
            console.error(errorMsg);
        }

        // Step 2: Remove DNS records
        console.log('Step 2: Cleaning up DNS records...');
        try {
            if (server.subdomainName) {
                // Extract domain from environment or use default
                const domain = process.env.DOMAIN || 'yourdomain.com'; // You should set this in your environment
                
                const dnsCleanupDetails = await cleanupServerDnsRecords(domain, server.subdomainName);
                result.dnsCleanupDetails = dnsCleanupDetails;
                
                const totalRecordsDeleted = dnsCleanupDetails.srvRecordsDeleted + 
                                          dnsCleanupDetails.cnameRecordsDeleted + 
                                          dnsCleanupDetails.aRecordsDeleted;
                
                if (totalRecordsDeleted > 0) {
                    result.dnsRecordsRemoved = true;
                    console.log(`Successfully deleted ${totalRecordsDeleted} DNS records for ${server.subdomainName}.${domain}`);
                } else {
                    warnings.push(`No DNS records found to delete for ${server.subdomainName}.${domain}`);
                }
                
                // Add any DNS cleanup errors to the main errors array
                if (dnsCleanupDetails.errors.length > 0) {
                    errors.push(...dnsCleanupDetails.errors);
                }
            } else {
                warnings.push('No subdomain configured for this server, skipping DNS cleanup');
            }
        } catch (error) {
            const errorMsg = `Failed to clean up DNS records: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
            console.error(errorMsg);
        }

        // Step 3: Archive server files (before deletion if removeVolumes is true)
        console.log('Step 3: Archiving server files...');
        if (archiveFiles) {
            try {
                const archiveDetails = await archiveServerFiles(server.uniqueId);
                result.archiveDetails = archiveDetails;
                result.filesArchived = true;
                console.log(`Successfully archived server files using ${archiveDetails.archiveMethod} method`);
            } catch (error) {
                const errorMsg = `Failed to archive server files: ${error instanceof Error ? error.message : String(error)}`;
                errors.push(errorMsg);
                console.error(errorMsg);
                
                // If archiving fails but removeVolumes is true, we'll still proceed with deletion
                if (removeVolumes) {
                    warnings.push('Archive failed, but proceeding with deletion as requested');
                }
            }
        }

        // Step 4: Delete server files (only if removeVolumes is true and archiving succeeded or was skipped)
        console.log('Step 4: Handling server file deletion...');
        let filesDeleted = false;
        let deletedPaths: string[] = [];
        let localPaths: string[] = [];

        if (removeVolumes) {
            // Only delete if we successfully archived OR if user explicitly wants to skip archiving
            if (result.filesArchived || !archiveFiles) {
                try {
                    const environmentId = await portainer.getFirstEnvironmentId();

                    if (!environmentId) {
                        throw new Error('No valid environment ID found for file deletion');
                    }

                    // Create a MinecraftServer instance to handle file deletion
                    const minecraftServer = new MinecraftServer(
                        {
                            EULA: true,
                            userEmail: server.email,
                            SERVER_NAME: server.serverName
                        },
                        server.serverName,
                        server.uniqueId,
                        environmentId
                    );

                    // Delete all server files
                    const deleteResult = await minecraftServer.deleteAllServerFiles();

                    if (deleteResult.success) {
                        filesDeleted = true;
                        deletedPaths = deleteResult.deletedPaths || [];
                        localPaths = deleteResult.localPaths || [];
                        console.log(`Successfully deleted ${deletedPaths.length} server files for ${server.serverName}`);
                    } else {
                        console.error('Failed to delete server files:', deleteResult.error);
                        errors.push(`Failed to delete server files: ${deleteResult.error}`);
                    }
                } catch (error) {
                    console.error('Error deleting server files:', error);
                    errors.push(`Error deleting server files: ${error instanceof Error ? error.message : String(error)}`);

                    // Fallback to basic WebDAV deletion
                    try {
                        // If we archived the files, the original directory should already be gone
                        if (!result.filesArchived) {
                            await webdavService.deleteDirectory(`/servers/${server.uniqueId}`);
                            filesDeleted = true;
                            console.log('Fallback: Basic WebDAV deletion completed');
                        }
                    } catch (fallbackError) {
                        errors.push(`Fallback deletion also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
                        console.error('Fallback deletion also failed:', fallbackError);
                    }
                }
            } else {
                warnings.push('Skipping file deletion because archiving failed. Files remain in original location.');
            }
        }

        // Update result with file deletion info
        result.filesDeleted = filesDeleted;
        result.deletedPathsCount = deletedPaths.length;
        result.localPathsForCleanup = localPaths;

        // Step 5: Remove server from database (do this last to ensure we can retry if needed)
        console.log('Step 5: Removing server from database...');
        try {
            await Server.findByIdAndDelete(server._id);
            console.log(`Successfully removed server ${server.serverName} from database`);
        } catch (error) {
            const errorMsg = `Failed to remove server from database: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
            console.error(errorMsg);
            // This is critical - if we can't remove from DB, the server will still appear to exist
            return NextResponse.json({
                ...result,
                message: 'Server cleanup completed but failed to remove from database. Please contact support.',
                errors: [...errors, 'Database removal failed - server may still appear in dashboard']
            }, { status: 500 });
        }

        // Determine final response status and message
        const hasErrors = errors.length > 0;
        const hasWarnings = warnings.length > 0;
        
        let finalMessage = 'Server deleted successfully.';
        let statusCode = 200;
        
        if (hasErrors && hasWarnings) {
            finalMessage = 'Server deletion completed with errors and warnings. Some cleanup operations failed.';
            statusCode = 207; // Multi-status
        } else if (hasErrors) {
            finalMessage = 'Server deletion completed with errors. Some cleanup operations failed.';
            statusCode = 207;
        } else if (hasWarnings) {
            finalMessage = 'Server deletion completed with warnings.';
            statusCode = 200;
        }

        result.message = finalMessage;

        console.log(`Server deletion completed for ${server.serverName}:`, {
            containerRemoved: result.containerRemoved,
            dnsRecordsRemoved: result.dnsRecordsRemoved,
            filesArchived: result.filesArchived,
            filesDeleted: result.filesDeleted,
            errorsCount: errors.length,
            warningsCount: warnings.length
        });

        return NextResponse.json(result, { status: statusCode });

    } catch (error) {
        console.error('Error during server deletion:', error);
        return NextResponse.json({
            message: 'Failed to delete server due to unexpected error.',
            error: error instanceof Error ? error.message : 'Unknown error',
            errors: [...errors, error instanceof Error ? error.message : String(error)],
            warnings
        }, { status: 500 });
    }
}

/**
 * Deletes all DNS records associated with a Minecraft server
 * @param domain The root domain (e.g., "yourdomain.com")
 * @param subdomain The server subdomain (e.g., "myserver")
 * @returns Cleanup details including counts of deleted records and errors
 */
async function cleanupServerDnsRecords(domain: string, subdomain: string) {
    const cleanupDetails = {
        srvRecordsDeleted: 0,
        cnameRecordsDeleted: 0,
        aRecordsDeleted: 0,
        errors: [] as string[]
    };

    try {
        // First, try to delete SRV records using the existing function
        const srvDeleted = await porkbun.deleteMinecraftSrvRecord(domain, subdomain);
        if (srvDeleted) {
            cleanupDetails.srvRecordsDeleted = 1; // The function doesn't return count, assume 1
        }
    } catch (error) {
        cleanupDetails.errors.push(`Failed to delete SRV records: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
        // Get all DNS records for the domain to find and delete related records
        const allRecords = await porkbun.getDnsRecords(domain);
        if (allRecords) {
            // Look for additional records that might be associated with this subdomain
            const relatedRecords = allRecords.filter(record => {
                const recordName = record.name.toLowerCase();
                const targetSubdomain = subdomain.toLowerCase();
                
                // Check for exact matches and variations
                return recordName === targetSubdomain || 
                       recordName === `${targetSubdomain}.${domain}` ||
                       recordName.startsWith(`${targetSubdomain}.`) ||
                       recordName.includes(`_minecraft._tcp.${targetSubdomain}`) ||
                       (record.type === 'CNAME' && recordName === targetSubdomain) ||
                       (record.type === 'A' && recordName === targetSubdomain);
            });

            // Delete related records
            for (const record of relatedRecords) {
                try {
                    const deleted = await porkbun.deleteDnsRecord(domain, record.id);
                    if (deleted) {
                        switch (record.type) {
                            case 'CNAME':
                                cleanupDetails.cnameRecordsDeleted++;
                                break;
                            case 'A':
                                cleanupDetails.aRecordsDeleted++;
                                break;
                            case 'SRV':
                                // Don't double count SRV records
                                if (cleanupDetails.srvRecordsDeleted === 0) {
                                    cleanupDetails.srvRecordsDeleted++;
                                }
                                break;
                        }
                    }
                } catch (error) {
                    cleanupDetails.errors.push(`Failed to delete ${record.type} record ${record.name}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
    } catch (error) {
        cleanupDetails.errors.push(`Failed to retrieve DNS records for cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }

    return cleanupDetails;
}

/**
 * Archives server files by renaming the directory with a -deleted suffix
 * @param serverUniqueId The unique ID of the server
 * @returns Archive details including paths and method used
 */
async function archiveServerFiles(serverUniqueId: string) {
    const originalPath = `/servers/${serverUniqueId}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]; // YYYY-MM-DD format
    const archivedPath = `/servers/${serverUniqueId}-deleted-${timestamp}`;
    
    const archiveDetails = {
        originalPath,
        archivedPath,
        archiveMethod: 'copy_delete' as 'move' | 'copy_delete' | 'rename_fallback'
    };

    try {
        // Check if the original directory exists
        const exists = await webdavService.exists(originalPath);
        if (!exists) {
            throw new Error(`Server directory ${originalPath} does not exist`);
        }

        // WebDAV service supports moveFile - let's try that first
        try {
            // Try to use the WebDAV service's move functionality
            await webdavService.moveFile(originalPath, archivedPath);
            archiveDetails.archiveMethod = 'move';
            console.log(`Successfully moved server files from ${originalPath} to ${archivedPath}`);
            return archiveDetails;
        } catch (moveError) {
            console.warn('Move operation failed, falling back to copy+delete method:', moveError);
        }

        // Fallback: Copy all contents to new directory and then delete original
        // First, create the archived directory
        await webdavService.createDirectory(archivedPath);

        // Get all contents of the original directory
        const contents = await webdavService.getDirectoryContents(originalPath);
        
        // Recursively copy all files and subdirectories
        await copyDirectoryRecursively(originalPath, archivedPath, contents as Array<{ basename?: string; name?: string; type: string }>);

        // Delete the original directory after successful copy
        await webdavService.deleteDirectory(originalPath);
        
        archiveDetails.archiveMethod = 'copy_delete';
        console.log(`Successfully archived server files from ${originalPath} to ${archivedPath} using copy+delete method`);
        
        return archiveDetails;

    } catch (error) {
        // Final fallback: try simple directory rename by adding suffix to existing path
        try {
            // Try to create a simple renamed directory using WebDAV service
            const simpleSuffix = `${originalPath}-deleted`;
            await webdavService.moveFile(originalPath, simpleSuffix);
            archiveDetails.archivedPath = simpleSuffix;
            archiveDetails.archiveMethod = 'rename_fallback';
            console.log(`Fallback: Successfully renamed server directory to ${simpleSuffix}`);
            return archiveDetails;
        } catch (fallbackError) {
            console.error('All archive methods failed:', fallbackError);
        }
        
        throw new Error(`Failed to archive server files: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Recursively copies directory contents from source to destination
 * @param sourcePath Source directory path
 * @param destPath Destination directory path
 * @param contents Directory contents from WebDAV
 */
async function copyDirectoryRecursively(sourcePath: string, destPath: string, contents: Array<{ basename?: string; name?: string; type: string }>) {
    for (const item of contents) {
        const itemName = item.basename || item.name;
        const sourceItemPath = `${sourcePath}/${itemName}`;
        const destItemPath = `${destPath}/${itemName}`;
        
        if (item.type === 'directory') {
            // Create subdirectory and recursively copy its contents
            await webdavService.createDirectory(destItemPath);
            const subContents = await webdavService.getDirectoryContents(sourceItemPath);
            await copyDirectoryRecursively(sourceItemPath, destItemPath, subContents as Array<{ basename?: string; name?: string; type: string }>);
        } else {
            // Copy file
            const fileContent = await webdavService.getFileContents(sourceItemPath);
            await webdavService.uploadFile(destItemPath, fileContent);
        }
    }
}
