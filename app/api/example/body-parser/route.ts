import { NextRequest, NextResponse } from 'next/server';
import BodyParser from '@/lib/db/bodyParser';

// Example API route using custom body parser
export async function POST(request: NextRequest) {
    try {
        // Option 1: Auto-detect content type and parse
        const body = await BodyParser.parseAuto(request);
        console.log('Parsed body:', body);

        // Option 2: Explicitly parse JSON with custom options
        // const body = await BodyParser.parseJSON(request, { limit: '10mb' });

        // Option 3: Parse form data
        // const body = await BodyParser.parseFormData(request);

        // Option 4: Parse URL-encoded data
        // const body = await BodyParser.parseUrlEncoded(request);

        return NextResponse.json({
            message: 'Body parsed successfully',
            data: body
        });
    } catch (error) {
        console.error('Body parsing error:', error);
        return NextResponse.json({
            error: 'Failed to parse request body',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 400 });
    }
}

// Configure body parsing for this route
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};
