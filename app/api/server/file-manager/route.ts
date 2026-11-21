import { NextRequest, NextResponse } from "next/server";
import serverStorage from "@/lib/server/storage";
import { isProtectedPath } from "@/lib/config/proxies";
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';

export async function POST(request: NextRequest) {
    try {
        const { serverSlug, path, name, type, content } = await request.json();
        if (!serverSlug || !path || !name || !type) {
            return NextResponse.json({ message: 'Server slug, path, name, and type are required.' }, { status: 400 });
        }
        if (type !== 'file' && type !== 'folder') {
            return NextResponse.json({ message: 'Type must be either "file" or "folder".' }, { status: 400 });
        }
        if (typeof name !== 'string' || /[\\/\0]/.test(name) || name === '.' || name === '..') {
            return NextResponse.json({ message: 'That name is not allowed.' }, { status: 400 });
        }

        const target = `${String(path).replace(/\/+$/, '')}/${name}`;
        const access = await authorizeFile(request, serverSlug, 'edit', target);
        if (isDenied(access)) return access.response;

        if (await serverStorage.exists(access.full)) {
            return NextResponse.json({ message: `${type === 'file' ? 'File' : 'Folder'} already exists at this location.` }, { status: 409 });
        }
        if (type === 'folder') await serverStorage.createDirectory(access.full);
        else await serverStorage.uploadFile(access.full, typeof content === 'string' ? content : '');

        return NextResponse.json({ message: `${type === 'file' ? 'File' : 'Folder'} created successfully`, path: access.rel, name, type });
    } catch (error) {
        console.error('File creation API error:', error);
        return NextResponse.json({ message: 'Failed to create the item.' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { serverSlug, path, type } = await request.json();
        if (!serverSlug || !path) return NextResponse.json({ message: 'Server slug and path are required.' }, { status: 400 });
        if (type !== 'file' && type !== 'folder') {
            return NextResponse.json({ message: 'Invalid type specified. Use "file" or "folder".' }, { status: 400 });
        }
        if (isProtectedPath(path)) {
            return NextResponse.json({ message: 'This file or folder is protected and cannot be deleted.' }, { status: 403 });
        }

        const access = await authorizeFile(request, serverSlug, 'edit', path);
        if (isDenied(access)) return access.response;
        if (access.rel === '/') return NextResponse.json({ message: 'The server folder itself cannot be deleted here.' }, { status: 400 });

        if (!(await serverStorage.exists(access.full))) {
            return NextResponse.json({ message: 'Item not found at this location.' }, { status: 404 });
        }
        if (type === 'file') await serverStorage.deleteFile(access.full);
        else await serverStorage.deleteDirectoryRecursively(access.full);

        return NextResponse.json({ message: `${type === 'file' ? 'File' : 'Folder'} deleted successfully`, path: access.rel });
    } catch (error) {
        console.error('File deletion API error:', error);
        return NextResponse.json({ message: 'Failed to delete the item.' }, { status: 500 });
    }
}
