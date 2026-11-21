import { NextRequest, NextResponse } from "next/server";
import serverStorage from "@/lib/server/storage";
import { authorizeFile, isDenied } from '@/lib/server/fileAccess';
import { protectServerProperties, redactServerProperties } from '@/lib/server/accessPolicy';

const READABLE = [
    '.txt', '.properties', '.json', '.yml', '.yaml', '.log', '.conf', '.cfg', '.ini', '.md', '.xml', '.sh', '.bat',
    '.cmd', '.js', '.ts', '.java', '.py', '.sql', '.css', '.html', '.htm', '.toml', '.env', '.json5', '.mcmeta',
];
const EDITABLE = READABLE.filter(extension => extension !== '.log');
const MAX_READ_BYTES = 5 * 1024 * 1024;

function extensionOf(name: string): string {
    const index = name.lastIndexOf('.');
    return index < 0 ? '' : name.slice(index).toLowerCase();
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const filePath = searchParams.get('file');
        if (!filePath) return NextResponse.json({ message: 'Server and file path are required.' }, { status: 400 });

        const access = await authorizeFile(request, searchParams.get('server'), 'read', filePath);
        if (isDenied(access)) return access.response;
        const { user, rel, full } = access;

        const name = rel.slice(rel.lastIndexOf('/') + 1);
        let buffer: Buffer;
        try {
            buffer = await serverStorage.getFileContents(full);
        } catch (error) {
            const status = (error as { status?: number }).status === 404 ? 404 : 500;
            return NextResponse.json({ message: status === 404 ? 'The file does not exist.' : 'Failed to read the file.' }, { status });
        }

        const readable = READABLE.includes(extensionOf(name)) && buffer.length <= MAX_READ_BYTES && !buffer.includes(0);
        let content = readable ? buffer.toString('utf-8') : 'This file cannot be shown here.';
        if (readable && !user.isAdmin && name.toLowerCase() === 'server.properties') content = redactServerProperties(content);

        return NextResponse.json({
            content,
            isTextFile: readable,
            isEditable: readable && EDITABLE.includes(extensionOf(name)),
            filePath: rel,
            fileName: name,
            fileExtension: extensionOf(name).slice(1),
            size: buffer.length,
            encoding: 'utf-8',
        });
    } catch (error) {
        console.error('File content API error:', error);
        return NextResponse.json({ message: 'An error occurred while fetching file content.' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { uniqueId, filePath, content } = await request.json();
        if (!uniqueId || !filePath || typeof content !== 'string') {
            return NextResponse.json({ message: 'Server unique ID, file path, and content are required.' }, { status: 400 });
        }

        const access = await authorizeFile(request, uniqueId, 'edit', filePath);
        if (isDenied(access)) return access.response;
        const { user, rel, full } = access;

        const name = rel.slice(rel.lastIndexOf('/') + 1);
        let text: string = content;
        if (!user.isAdmin && name.toLowerCase() === 'server.properties') {
            const existing = (await serverStorage.exists(full)) ? (await serverStorage.getFileContents(full)).toString('utf-8') : '';
            text = protectServerProperties(existing, content);
        }

        await serverStorage.uploadFile(full, text, true);
        return NextResponse.json({
            message: 'File saved successfully',
            filePath: rel,
            fileName: name,
            size: Buffer.byteLength(text, 'utf8'),
            lastModified: new Date().toISOString(),
        });
    } catch (error) {
        console.error('File save API error:', error);
        return NextResponse.json({ message: 'Failed to save the file.' }, { status: 500 });
    }
}
