import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import User, { IUser } from "@/lib/objects/User";
import Server from "@/lib/objects/Server";
import dbConnect from "@/lib/db/dbConnect";
import webdavService from "@/lib/server/webdav";
import verificationService from "@/lib/server/verify";
import { isProtectedPath } from "@/lib/config/proxies";

export async function POST(request: NextRequest) {
    await dbConnect();

    try {
        // Check authentication
        const user: IUser | null = await verificationService.getUserFromToken(request);

        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });
        }

        // Get request body
        const { serverSlug, path, name, type, content } = await request.json();

        if (!serverSlug || !path || !name || !type) {
            return NextResponse.json({ 
                message: 'Server slug, path, name, and type are required.' 
            }, { status: 400 });
        }

        if (type !== 'file' && type !== 'folder') {
            return NextResponse.json({ 
                message: 'Type must be either "file" or "folder".' 
            }, { status: 400 });
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
                { name: serverSlug },
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
            // Combine server path with requested path and name
            const fullPath = `${serverPath}${path}/${name}`;
            console.log(`Creating ${type} at: ${fullPath}`);

            // Check if item already exists
            if (await webdavService.exists(fullPath)) {
                return NextResponse.json({ 
                    message: `${type === 'file' ? 'File' : 'Folder'} already exists at this location.` 
                }, { status: 409 });
            }

            if (type === 'folder') {
                // Create directory
                await webdavService.createDirectory(fullPath);
            } else {
                // Create file with content (empty if not provided)
                const fileContent = content || '';
                await webdavService.uploadFile(fullPath, fileContent);
            }

            return NextResponse.json({
                message: `${type === 'file' ? 'File' : 'Folder'} created successfully`,
                path: `${path}/${name}`,
                name,
                type,
                serverSlug,
                fullPath
            });

        } catch (webdavError) {
            console.error('WebDAV error:', webdavError);
            return NextResponse.json({
                message: `Failed to create ${type}.`,
                error: (webdavError as Error).message,
                path: path
            }, { status: 500 });
        }

    } catch (error) {
        console.error('File creation API error:', error);
        return NextResponse.json({
            message: 'An error occurred while creating the item.',
            error: (error as Error).message
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    await dbConnect();

    try {
        // Check authentication
        const token = request.cookies.get('sessionToken')?.value;
        if (!token) {
            return NextResponse.json({ message: 'No active session found.' }, { status: 401 });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default');
        if (!decoded) {
            return NextResponse.json({ message: 'Invalid session token.' }, { status: 401 });
        }

        const user = await User.findById((decoded as { id: string }).id);
        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'User not found or inactive.' }, { status: 403 });
        }

        // Get request body
        const { serverSlug, path, type } = await request.json();

        if (!serverSlug || !path) {
            return NextResponse.json({ 
                message: 'Server slug and path are required.' 
            }, { status: 400 });
        }

        // Check if the path is protected
        if (isProtectedPath(path)) {
            return NextResponse.json({ 
                message: 'This file or folder is protected and cannot be deleted.' 
            }, { status: 403 });
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
                { name: serverSlug },
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
            // Combine server path with requested path
            const fullPath = `${serverPath}${path}`;
            console.log(`Deleting ${type || 'item'} at: ${fullPath}`);

            // Check if item exists
            if (!(await webdavService.exists(fullPath))) {
                return NextResponse.json({ 
                    message: 'Item not found at this location.' 
                }, { status: 404 });
            }

            // Create backup before deletion for files
            if (type === 'file') {
                try {
                const backupPath = `${fullPath}.deleted.${Date.now()}`;

                const existingContent = await webdavService.getFileContents(fullPath);
                await webdavService.uploadFile(backupPath, existingContent);
                console.log(`Backup created at: ${backupPath}`);

                // Delete the file
                console.log(`Deleting file: ${fullPath}`);
                await webdavService.deleteFile(fullPath);

                // Delete the backup file if it exists
                const backupExists = await webdavService.exists(backupPath)
                if (backupExists) {
                    await webdavService.deleteFile(backupPath);
                    console.log(`Backup file deleted: ${backupPath}`);
                }
                } catch (backupError) {
                    console.error('Failed to create backup before deletion:', backupError);
                    return NextResponse.json({
                        message: 'Failed to create backup before deletion.',
                        error: (backupError as Error).message,
                    });
                }
            } else if (type === 'folder') {
                await webdavService.deleteDirectory(fullPath);
            } else {
                return NextResponse.json({
                    message: 'Invalid type specified. Use "file" or "folder".'
                }, { status: 400 });
            }

            return NextResponse.json({
                message: `${type === 'file' ? 'File' : 'Folder'} deleted successfully`,
                path,
                serverSlug,
                fullPath
            });

        } catch (webdavError) {
            console.error('WebDAV error:', webdavError);
            return NextResponse.json({
                message: `Failed to delete ${type || 'item'}.`,
                error: (webdavError as Error).message,
                path: path
            }, { status: 500 });
        }

    } catch (error) {
        console.error('File deletion API error:', error);
        return NextResponse.json({
            message: 'An error occurred while deleting the item.',
            error: (error as Error).message
        }, { status: 500 });
    }
}
