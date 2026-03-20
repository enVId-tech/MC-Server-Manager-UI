import { NextRequest, NextResponse } from "next/server";
import Server from "@/lib/objects/Server";
import dbConnect from "@/lib/db/dbConnect";
import webdavService from "@/lib/server/webdav";
import { IUser } from "@/lib/objects/User";
import verificationService from "@/lib/server/verify";

export async function GET(request: NextRequest) {
    await dbConnect();
    try {
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });
        }

        // Get request body based on URL parameters
        const url = new URL(request.url);

        console.log(`Received request for server files with URL: ${url.href}`);

        const domainName = url.searchParams.get('domainName') || '';
        const path = url.searchParams.get('path') || '/';

        console.log(`Received request for server files with domainName: ${domainName} and path: ${path}`);

        if (!domainName) {
            return NextResponse.json({ message: 'Domain name is required.' }, { status: 400 });
        }

        console.log(`Looking for server with domainName of: ${domainName}`);

        // Find the server in the database using multiple possible matches
        const server = await Server.findOne({
            email: user.email,
            $or: [
                { subdomainName: domainName },
                { serverName: domainName }
            ]
        });

        if (!server) {
            console.log(`Server not found for user ${user.email} with identifier: ${domainName}`);
            return NextResponse.json({
                message: 'Server not found.',
                debug: {
                    userEmail: user.email,
                    domainName: domainName,
                    uniqueId: server.uniqueId
                }
            }, { status: 404 });
        }

        // Get the WebDAV server base path from environment
        const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
        const userFolder = user.email.split('@')[0];
        const serverPath = `${baseServerPath}/${userFolder}/${server.uniqueId}`;

        // Construct the full WebDAV URL
        const baseWebDavUrl = process.env.WEBDAV_URL || "https://webdav.etran.dev/";
        webdavService.updateUrl(baseWebDavUrl);

        try {
            // Combine server path with requested path
            const fullPath = path === '/' ? serverPath : `${serverPath}${path}`;
            console.log(`Fetching directory contents for path: ${fullPath}`);

            const contents = await webdavService.getDirectoryContents(fullPath);

            // Transform the WebDAV response to match our interface
            const files = (contents as Record<string, unknown>[]).map((item) => {
                const itemPath = item.filename as string;
                // Remove the server path prefix to get relative path
                const relativePath = itemPath.replace(serverPath, '') || '/';

                return {
                    name: item.basename as string,
                    type: item.type === 'directory' ? 'folder' as const : 'file' as const,
                    path: relativePath,
                    size: (item.size as number) || 0,
                    lastModified: item.lastmod ? new Date(item.lastmod as string) : new Date(),
                    mimeType: (item.mime as string) || 'application/octet-stream',
                    isReadable: isReadableFile(item.basename as string),
                    isEditable: isEditableFile(item.basename as string)
                };
            });

            // Sort files: directories first, then files alphabetically
            files.sort((a, b) => {
                if (a.type === 'folder' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            });

            return NextResponse.json({
                files,
                currentPath: path,
                uniqueId: server.uniqueId,
                totalFiles: files.length,
                totalFolders: files.filter(f => f.type === 'folder').length
            });

        } catch (webdavError) {
            console.error('WebDAV error:', webdavError);
            return NextResponse.json({
                message: 'Failed to fetch server files.',
                error: (webdavError as Error).message,
                path: path
            }, { status: 500 });
        }

    } catch (error) {
        console.error('Server files API error:', error);
        return NextResponse.json({
            message: 'An error occurred while fetching server files.',
            error: (error as Error).message
        }, { status: 500 });
    }
}

// Helper function to determine if a file is readable
function isReadableFile(filename: string): boolean {
    const readableExtensions = [
        '.txt', '.properties', '.json', '.yml', '.yaml', '.log', '.conf',
        '.cfg', '.ini', '.md', '.xml', '.sh', '.bat', '.cmd', '.js', '.ts',
        '.java', '.py', '.sql', '.css', '.html', '.htm', '.toml', '.env'
    ];

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return readableExtensions.includes(extension) || filename.includes('.');
}

// Helper function to determine if a file is editable
function isEditableFile(filename: string): boolean {
    const editableExtensions = [
        '.properties', '.json', '.yml', '.yaml', '.conf', '.cfg', '.ini',
        '.md', '.xml', '.sh', '.bat', '.cmd', '.js', '.ts', '.java', '.py',
        '.sql', '.css', '.html', '.htm', '.toml', '.env', '.txt'
    ];

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return editableExtensions.includes(extension);
}
