import { NextRequest, NextResponse } from 'next/server';
import { REST_API_LOGGING } from '../console-config';

export interface ApiLogContext {
    method: string;
    url: string;
    pathname: string;
    userAgent?: string;
    timestamp: Date;
    startTime: number;
}

/**
 * Log incoming API request
 */
export function logApiRequest(request: NextRequest): ApiLogContext | null {
    if (!REST_API_LOGGING.enabled) {
        return null;
    }

    const startTime = performance.now();
    const timestamp = new Date();
    const { method, url } = request;
    const pathname = new URL(url).pathname;
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    const context: ApiLogContext = {
        method,
        url,
        pathname,
        userAgent,
        timestamp,
        startTime
    };

    // Log request details
    console.log(`\n🌐 [API REQUEST] ${method} ${pathname}`);
    
    if (REST_API_LOGGING.logRequestHeaders) {
        console.log('📋 Request Headers:', Object.fromEntries(request.headers.entries()));
    }

    return context;
}

/**
 * Log API request body (for POST/PUT/PATCH requests)
 */
export async function logApiRequestBody(request: NextRequest, body: unknown) {
    if (!REST_API_LOGGING.enabled || !REST_API_LOGGING.logRequestBody) {
        return;
    }

    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        console.log('📝 Request Body:', body);
    }
}

/**
 * Log API response
 */
export function logApiResponse(
    context: ApiLogContext | null,
    response: NextResponse | Response,
    error?: Error
) {
    if (!REST_API_LOGGING.enabled || !context) {
        return;
    }

    const endTime = performance.now();
    const duration = Math.round(endTime - context.startTime);
    const status = response.status;

    // Check if we should log only errors
    if (REST_API_LOGGING.logOnlyErrors && status < 400 && !error) {
        return;
    }

    // Log response status and timing
    const statusEmoji = getStatusEmoji(status);
    console.log(`${statusEmoji} [API RESPONSE] ${context.method} ${context.pathname} - ${status}`);

    if (REST_API_LOGGING.logTiming) {
        console.log(`⏱️  Duration: ${duration}ms`);
    }

    if (REST_API_LOGGING.logResponseHeaders) {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });
        console.log('📋 Response Headers:', headers);
    }

    // Log error if present
    if (error) {
        console.error('❌ API Error:', error.message);
        if (error.stack) {
            console.error('🔍 Stack Trace:', error.stack);
        }
    }

    console.log(''); // Add spacing between requests
}

/**
 * Log response body (if enabled)
 */
export async function logApiResponseBody(responseData: unknown) {
    if (!REST_API_LOGGING.enabled || !REST_API_LOGGING.logResponseBody) {
        return;
    }

    console.log('📤 Response Body:', responseData);
}

/**
 * Get appropriate emoji for HTTP status codes
 */
function getStatusEmoji(status: number): string {
    if (status >= 200 && status < 300) return '✅';
    if (status >= 300 && status < 400) return '🔄';
    if (status >= 400 && status < 500) return '❌';
    if (status >= 500) return '💥';
    return '📡';
}

/**
 * Create a wrapper for API route handlers with automatic logging
 */
export function withApiLogging<T extends unknown[]>(
    handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
    return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
        const context = logApiRequest(request);
        let response: NextResponse;
        let error: Error | undefined;

        try {
            // Log request body for applicable methods
            if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
                try {
                    const body = await request.json();
                    await logApiRequestBody(request, body);
                    // Recreate request with body for handler
                    const newRequest = new NextRequest(request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: JSON.stringify(body)
                    });
                    response = await handler(newRequest, ...args);
                } catch {
                    // If body parsing fails, continue with original request
                    response = await handler(request, ...args);
                }
            } else {
                response = await handler(request, ...args);
            }
        } catch (err) {
            error = err instanceof Error ? err : new Error(String(err));
            // Create error response
            response = NextResponse.json(
                { error: 'Internal Server Error' },
                { status: 500 }
            );
        }

        logApiResponse(context, response, error);
        
        // Log response body if enabled
        if (REST_API_LOGGING.logResponseBody && response.headers.get('content-type')?.includes('application/json')) {
            try {
                const responseClone = response.clone();
                const responseData = await responseClone.json();
                await logApiResponseBody(responseData);
            } catch {
                // Ignore response body logging errors
            }
        }

        return response;
    };
}
