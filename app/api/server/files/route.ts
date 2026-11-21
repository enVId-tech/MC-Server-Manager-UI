import { NextRequest, NextResponse } from "next/server";
import serverStorage from "@/lib/server/storage";
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';
import { getFileAccess, isHiddenFromUsers } from '@/lib/server/accessPolicy';

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const path = url.searchParams.get('path') || '/';
        const access = await authorizeFile(request, url.searchParams.get('domainName'), 'read', path);
        if (isDenied(access)) return access.response;
        const { user, server, base, rel, full } = access;

        let contents;
        try {
            contents = await serverStorage.getDirectoryContents(full);
        } catch (error) {
            // A folder that is not there is reported as it is, nothing is made up in its place
            const status = (error as { status?: number }).status === 404 ? 404 : 500;
            return NextResponse.json({ message: status === 404 ? 'This folder does not exist.' : 'Failed to fetch server files.', path }, { status });
        }

        const files = contents
            .map(item => {
                const relativePath = item.filename.startsWith(base) ? item.filename.slice(base.length) || '/' : item.filename;
                return {
                    name: item.basename,
                    type: item.type === 'directory' ? 'folder' as const : 'file' as const,
                    path: relativePath,
                    size: item.size || 0,
                    lastModified: item.lastmod ? new Date(item.lastmod) : new Date(),
                    mimeType: item.mime || 'application/octet-stream',
                    isReadable: isReadableFile(item.basename),
                    isEditable: isEditableFile(item.basename),
                };
            })
            .filter(item => user.isAdmin || !isHiddenFromUsers(item.path));

        files.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return NextResponse.json({
            files,
            currentPath: rel,
            uniqueId: server.uniqueId,
            totalFiles: files.filter(f => f.type === 'file').length,
            totalFolders: files.filter(f => f.type === 'folder').length,
            access: user.isAdmin ? { uploads: true, editing: true, admin: true } : { ...getFileAccess(server), admin: false },
        });
    } catch (error) {
        console.error('Server files API error:', error);
        return NextResponse.json({ message: 'An error occurred while fetching server files.' }, { status: 500 });
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
