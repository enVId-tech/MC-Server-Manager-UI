import { NextRequest, NextResponse } from "next/server";
import { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import dbConnect from "@/lib/db/dbConnect";
import webdavService from "@/lib/server/webdav";
import verificationService from "@/lib/server/verify";

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

export async function GET(request: NextRequest) {
    await dbConnect();

    try {
        // Check authentication
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });
        }

        // Get query parameters
        const { searchParams } = new URL(request.url);
        const serverSlug = searchParams.get('server');
        const filePath = searchParams.get('file');

        if (!serverSlug || !filePath) {
            return NextResponse.json({ message: 'Server slug and file path are required.' }, { status: 400 });
        }

        // Extract the unique ID from the server slug
        // Handle both formats: just uniqueId or subdomain.domain format
        let uniqueId = serverSlug;
        if (serverSlug.includes('.')) {
            // Extract the subdomain part (e.g., "main1" from "main1.etran.dev")
            uniqueId = serverSlug.split('.')[0];
        }

        // Find the server in the database using multiple possible matches
        const server = await Server.findOne({ 
            email: user.email,
            $or: [
                { uniqueId: uniqueId },
                { uniqueId: serverSlug },
                { subdomainName: serverSlug },
                { serverName: serverSlug },
                { subdomainName: uniqueId },
                { serverName: uniqueId }
            ]
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found.' }, { status: 404 });
        }

        // Get the WebDAV server base path from environment
        const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
        const userFolder = user.email.split('@')[0];
        const serverPath = `${baseServerPath}/${userFolder}/${server.uniqueId}`;

        // Construct the full WebDAV URL
        const baseWebDavUrl = process.env.WEBDAV_URL || "https://webdav.etran.dev/";
        webdavService.updateUrl(baseWebDavUrl);

        try {
            // Combine server path with requested file path
            const fullFilePath = `${serverPath}${filePath}`;
            console.log(`Fetching file content for: ${fullFilePath}`);

            const fileBuffer = await webdavService.getFileContents(fullFilePath);
            const content = fileBuffer.toString('utf-8');

            // Check if the content is text-based
            const isTextFile = isReadableFile(filePath) && content.split('').every(char => {
                const code = char.charCodeAt(0);
                return code >= 32 || code === 9 || code === 10 || code === 13;
            });

            // Get file stats
            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
            const fileExtension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
            const isEditable = isEditableFile(fileName);

            return NextResponse.json({
                content: isTextFile ? content : 'Binary file - content not displayable',
                isTextFile,
                isEditable,
                filePath,
                fullFilePath,
                serverSlug,
                fileName,
                fileExtension,
                size: fileBuffer.length,
                encoding: 'utf-8',
                lastModified: new Date().toISOString()
            });

        } catch (webdavError) {
            console.error('WebDAV error:', webdavError);
            return NextResponse.json({
                message: 'Failed to fetch file content.',
                error: (webdavError as Error).message,
                filePath: filePath
            }, { status: 500 });
        }

    } catch (error) {
        console.error('File content API error:', error);
        return NextResponse.json({
            message: 'An error occurred while fetching file content.',
            error: (error as Error).message
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        // Check authentication
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });
        }

        // Get request body
        const { uniqueId, filePath, content } = await request.json();

        if (!uniqueId || !filePath || content === undefined) {
            return NextResponse.json({ message: 'Server unique ID, file path, and content are required.' }, { status: 400 });
        }

        // Find the server in the database using multiple possible matches
        const server = await Server.findOne({ 
            email: user.email,
            $or: [
                { uniqueId: uniqueId },
            ]
        });

        if (!server) {
            return NextResponse.json({ message: 'Server not found.' }, { status: 404 });
        }

        // Get the WebDAV server base path from environment
        const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
        const userFolder = user.email.split('@')[0];
        const serverPath = `${baseServerPath}/${userFolder}/${server.uniqueId}`;

        // Construct the full WebDAV URL
        const baseWebDavUrl = process.env.WEBDAV_URL || "https://webdav.etran.dev/";
        webdavService.updateUrl(baseWebDavUrl);

        try {
            // Combine server path with requested file path
            const fullFilePath = `${serverPath}${filePath}`;
            console.log(`Saving file content to: ${fullFilePath}`);

            // Create backup of existing file if it exists
            const backupPath = `${fullFilePath}.backup.${Date.now()}`;
            try {
                if (await webdavService.exists(fullFilePath)) {
                    const existingContent = await webdavService.getFileContents(fullFilePath);
                    await webdavService.uploadFile(backupPath, existingContent);
                    console.log(`Backup created at: ${backupPath}`);
                }
            } catch (backupError) {
                console.warn('Could not create backup:', backupError);
                // Continue with save operation even if backup fails
            }

            // Save the file
            await webdavService.uploadFile(fullFilePath, content);

            // Remove backup if it was created
            if (await webdavService.exists(backupPath)) {
                await webdavService.deleteFile(backupPath);
                console.log(`Backup file deleted: ${backupPath}`);
            }

            // Get file stats for response
            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
            const fileExtension = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();

            return NextResponse.json({
                message: 'File saved successfully',
                filePath,
                fullFilePath,
                fileName,
                fileExtension,
                size: Buffer.byteLength(content, 'utf8'),
                lastModified: new Date().toISOString(),
                backupCreated: true
            });

        } catch (webdavError) {
            console.error('WebDAV error:', webdavError);
            return NextResponse.json({
                message: 'Failed to save file.',
                error: (webdavError as Error).message,
                filePath: filePath
            }, { status: 500 });
        }

    } catch (error) {
        console.error('File save API error:', error);
        return NextResponse.json({
            message: 'An error occurred while saving file.',
            error: (error as Error).message
        }, { status: 500 });
    }
}
