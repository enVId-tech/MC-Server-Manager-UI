import { NextRequest, NextResponse } from 'next/server';
import { logApiRequest, logApiResponse } from './lib/utils/api-logger';

export function proxy(request: NextRequest) {
    // Log API requests if the route is an API route
    let apiContext = null;
    if (request.nextUrl.pathname.startsWith('/api/')) {
        apiContext = logApiRequest(request);
    }

    // You can add custom body parsing logic here if needed
    // For most cases, Next.js built-in body parsing is sufficient
    
    // Example: Add custom headers or modify request
    const response = NextResponse.next();
    
    // Set custom headers for API routes
    if (request.nextUrl.pathname.startsWith('/api/')) {
        response.headers.set('X-Body-Parser', 'enabled');
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: response.headers,
        });
    }

    // Log API response (this will be called after the response is ready)
    if (apiContext) {
        // Note: This is a basic implementation. For more detailed response logging,
        // individual API routes should use the withApiLogging wrapper
        setTimeout(() => {
            logApiResponse(apiContext, response);
        }, 0);
    }
    
    return response;
}

// Configure which paths the middleware should run on
export const config = {
    matcher: [
        '/api/:path*',
        // Add other paths as needed
    ],
};
