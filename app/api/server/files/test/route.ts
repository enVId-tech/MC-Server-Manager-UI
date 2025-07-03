import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const serverSlug = searchParams.get('server');
        const path = searchParams.get('path') || '/';
        
        // Return mock data for testing
        const mockFiles = [
            { name: 'server.properties', type: 'file', path: '/server.properties', size: 1024 },
            { name: 'whitelist.json', type: 'file', path: '/whitelist.json', size: 256 },
            { name: 'world', type: 'folder', path: '/world', size: 0 },
            { name: 'plugins', type: 'folder', path: '/plugins', size: 0 },
        ];

        console.log('Test API called with:', { serverSlug, path });

        return NextResponse.json({ 
            files: mockFiles,
            currentPath: path,
            serverSlug,
            message: 'Test API working'
        });

    } catch (error) {
        console.error('Test API error:', error);
        return NextResponse.json({ 
            message: 'Test API error',
            error: (error as Error).message 
        }, { status: 500 });
    }
}
