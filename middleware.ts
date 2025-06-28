import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
    // You can add custom body parsing logic here if needed
    // For most cases, Next.js built-in body parsing is sufficient
    
    // Example: Add custom headers or modify request
    const response = NextResponse.next();
    
    // Set custom headers for API routes
    if (request.nextUrl.pathname.startsWith('/api/')) {
        response.headers.set('X-Body-Parser', 'enabled');
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
