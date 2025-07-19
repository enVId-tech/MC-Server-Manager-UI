import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '../../../../lib/utils/api-logger';

/**
 * Example API route demonstrating REST API logging
 * GET /api/test/logging - Test the logging functionality
 */
async function handler(request: NextRequest) {
    const { method } = request;
    
    if (method === 'GET') {
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return NextResponse.json({
            message: 'Logging test successful!',
            timestamp: new Date().toISOString(),
            method,
            headers: Object.fromEntries(request.headers.entries()),
        });
    }
    
    if (method === 'POST') {
        try {
            const body = await request.json();
            
            // Simulate some processing
            await new Promise(resolve => setTimeout(resolve, 200));
            
            return NextResponse.json({
                message: 'POST request processed successfully',
                received: body,
                timestamp: new Date().toISOString(),
            });
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON body' },
                { status: 400 }
            );
        }
    }
    
    return NextResponse.json(
        { error: `Method ${method} not allowed` },
        { status: 405 }
    );
}

// Export the handler wrapped with API logging
export const GET = withApiLogging(handler);
export const POST = withApiLogging(handler);
