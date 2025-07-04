import { NextRequest } from 'next/server';

// Custom body parser utility for Next.js API routes
export class BodyParser {

    /**
     * Parse JSON body with custom configuration
     */
    static async parseJSON(request: NextRequest, options?: {
        limit?: string;
        strict?: boolean;
    }) {
        try {
            if (!options) {
                options = {};
            }

            const text = await request.text();
            return JSON.parse(text);
        } catch (error) {
            throw new Error(`Failed to parse JSON body: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Parse URL-encoded body
     */
    static async parseUrlEncoded(request: NextRequest, options?: {
        limit?: string;
        extended?: boolean;
    }) {
        try {
            if (!options) {
                options = {};
            }

            const text = await request.text();
            const params = new URLSearchParams(text);
            const result: Record<string, string> = {};

            for (const [key, value] of params) {
                result[key] = value;
            }

            return result;
        } catch (error) {
            throw new Error(`Failed to parse URL-encoded body: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Parse raw text body
     */
    static async parseText(request: NextRequest, options?: {
        limit?: string;
        type?: string;
    }) {
        try {
            if (!options) {
                options = {};
            }

            return await request.text();
        } catch (error) {
            throw new Error(`Failed to parse text body: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Parse multipart form data
     */
    static async parseFormData(request: NextRequest) {
        try {
            const formData = await request.formData();
            const result: Record<string, unknown> = {};

            for (const [key, value] of formData.entries()) {
                if (value instanceof File) {
                    result[key] = {
                        name: value.name,
                        size: value.size,
                        type: value.type,
                        file: value
                    };
                } else {
                    result[key] = value;
                }
            }

            return result;
        } catch (error) {
            throw new Error(`Failed to parse form data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Auto-detect content type and parse accordingly
     */
    static async parseAuto(request: NextRequest) {
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            return this.parseJSON(request);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            return this.parseUrlEncoded(request);
        } else if (contentType.includes('multipart/form-data')) {
            return this.parseFormData(request);
        } else if (contentType.includes('text/')) {
            return this.parseText(request);
        } else {
            // Default to JSON for API routes
            return this.parseJSON(request);
        }
    }
}

// Export default parsing function
export default BodyParser;
