import { NextRequest, NextResponse } from 'next/server';
import { logApiRequest, logApiResponse } from './lib/utils/api-logger';

export function proxy(request: NextRequest) {
    // Log API requests if the route is an API route
    let apiContext = null;
    if (request.nextUrl.pathname.startsWith('/api/')) {
        apiContext = logApiRequest(request);
    }

    // The API is only used by this application's own pages (same origin), so no CORS headers are added.
    // Sending `Access-Control-Allow-Origin: *` would let any website read responses from the API.
    const response = NextResponse.next();

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
    ],
};
