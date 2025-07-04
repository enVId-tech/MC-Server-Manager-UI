import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import User from "@/lib/objects/User";
import dbConnect from "@/lib/db/dbConnect";
import webdavService from "@/lib/server/webdav";

export async function GET(request: NextRequest) {
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

        // Get query parameters
        const { searchParams } = new URL(request.url);
        const serverSlug = searchParams.get('server');
        const filePath = searchParams.get('file');

        if (!serverSlug || !filePath) {
            return NextResponse.json({ message: 'Server slug and file path are required.' }, { status: 400 });
        }

        // Construct WebDAV URL for the server
        const baseWebDavUrl = process.env.WEBDAV_URL || "https://webdav.etran.dev/";
        const serverWebDavUrl = `${baseWebDavUrl}${user.username}/${serverSlug}`;

        // Update the WebDAV service URL to point to this specific server
        webdavService.updateUrl(serverWebDavUrl);

        try {
            const fileBuffer = await webdavService.getFileContents(filePath);
            const content = fileBuffer.toString('utf-8');

            // Check if the content is text-based
            const isTextFile = /\.(txt|properties|json|yml|yaml|log|conf|cfg|ini|md|xml|sh|bat|cmd)$/i.test(filePath) ||
                content.split('').every(char => {
                    const code = char.charCodeAt(0);
                    return code >= 32 || code === 9 || code === 10 || code === 13;
                });

            return NextResponse.json({
                content: isTextFile ? content : 'Binary file - content not displayable',
                isTextFile,
                filePath,
                serverSlug,
                size: fileBuffer.length
            });

        } catch (webdavError) {
            console.error('WebDAV error:', webdavError);
            return NextResponse.json({
                message: 'Failed to fetch file content.',
                error: (webdavError as Error).message
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
        const { serverSlug, filePath, content } = await request.json();

        if (!serverSlug || !filePath || content === undefined) {
            return NextResponse.json({ message: 'Server slug, file path, and content are required.' }, { status: 400 });
        }

        // Construct WebDAV URL for the server
        const baseWebDavUrl = process.env.WEBDAV_URL || "https://webdav.etran.dev/";
        const serverWebDavUrl = `${baseWebDavUrl}${user.username}/${serverSlug}`;

        // Update the WebDAV service URL to point to this specific server
        webdavService.updateUrl(serverWebDavUrl);

        try {
            await webdavService.uploadFile(filePath, content);

            return NextResponse.json({
                message: 'File saved successfully',
                filePath,
                serverSlug
            });

        } catch (webdavError) {
            console.error('WebDAV error:', webdavError);
            return NextResponse.json({
                message: 'Failed to save file.',
                error: (webdavError as Error).message
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
