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
        const path = searchParams.get('path') || '/';

        if (!serverSlug) {
            return NextResponse.json({ message: 'Server slug is required.' }, { status: 400 });
        }

        // Construct WebDAV URL for the server
        const baseWebDavUrl = process.env.WEBDAV_URL || "https://webdav.etran.dev/";
        const serverWebDavUrl = `${baseWebDavUrl}${user.username}/${serverSlug}`;
        
        // Update the WebDAV service URL to point to this specific server
        webdavService.updateUrl(serverWebDavUrl);

        try {
            const contents = await webdavService.getDirectoryContents(path);
            
            // Transform the WebDAV response to match our interface
            const files = (contents as Record<string, unknown>[]).map((item) => ({
                name: item.basename as string,
                type: item.type === 'directory' ? 'folder' as const : 'file' as const,
                path: item.filename as string,
                size: (item.size as number) || 0,
                lastModified: item.lastmod ? new Date(item.lastmod as string) : new Date(),
                mimeType: (item.mime as string) || 'application/octet-stream'
            }));

            return NextResponse.json({ 
                files,
                currentPath: path,
                serverSlug 
            });

        } catch (webdavError) {
            console.error('WebDAV error:', webdavError);
            return NextResponse.json({ 
                message: 'Failed to fetch server files.',
                error: (webdavError as Error).message 
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
