import { createClient, WebDAVClient } from "webdav";
import https from "https";

/**
 * WebDAV Service
 * This service provides methods to interact with a WebDAV server.
 * It uses the `webdav` package to create a client and perform operations.
 *
 * @class WebDavService
 * @constructor
 * @param {string} webdavUrl - The URL of the WebDAV server.
 */
class WebDavService {
    private client: WebDAVClient;
    private currentUrl: string;

    public constructor(webdavUrl: string) {
        this.client = this.createClientWithOptions(webdavUrl);
        this.currentUrl = webdavUrl;
    }

    private createClientWithOptions(url: string): WebDAVClient {
        const options: {
            httpsAgent: https.Agent;
            username?: string;
            password?: string;
        } = {
            // For development only - disable SSL certificate validation
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        };

        // Add authentication if credentials are provided
        const username = process.env.WEBDAV_USERNAME;
        const password = process.env.WEBDAV_PASSWORD;
        
        if (username && password) {
            options.username = username;
            options.password = password;
            console.log(`WebDAV: Using authentication for user: ${username}`);
        } else {
            console.log('WebDAV: No authentication credentials provided');
        }

        return createClient(url, options);
    }

    /**
     * Get the current URL of the WebDAV server.
     * @param {string} newUrl - The new URL to set.
     * @returns {boolean} - Whether the URL has successfully updated
     */
    public updateUrl(newUrl: string): boolean {
        if (newUrl !== this.currentUrl) {
            console.log(`Updating WebDAV client URL from ${this.currentUrl} to ${newUrl}`);
            this.currentUrl = newUrl;
            this.client = this.createClientWithOptions(newUrl);
        }

        return this.currentUrl == newUrl;
    }

    /**
     * Get the current directory contents from the WebDAV server.
     * @param {string} path - The path to the directory. Defaults to '/'.
     */
    public async getDirectoryContents(path: string = '/'): Promise<unknown[]> {
        const contents = await this.client.getDirectoryContents(path);
        return Array.isArray(contents) ? contents : contents.data; // Ensure it returns an array
    }

    async getFileContents(filePath?: string): Promise<Buffer> {
        try {
            // If a specific file path is provided, use it. Otherwise, use currentUrl
            let pathToFetch: string;

            if (filePath) {
                pathToFetch = filePath;
            } else {
                // Extract the path from the current URL
                const baseUrl = process.env.WEBDAV_URL || "https://webdav.etran.dev/";
                let extractedPath = this.currentUrl;

                if (this.currentUrl.startsWith(baseUrl)) {
                    extractedPath = this.currentUrl.substring(baseUrl.length);
                } else {
                    // If the URL doesn't start with base URL, try to extract path from URL object
                    const url = new URL(this.currentUrl);
                    extractedPath = url.pathname;
                }

                pathToFetch = extractedPath;
            }

            // Clean up the path: remove double slashes and ensure single leading slash
            pathToFetch = pathToFetch.replace(/\/+/g, '/'); // Replace multiple slashes with single slash

            // Ensure the path starts with /
            if (!pathToFetch.startsWith('/')) {
                pathToFetch = '/' + pathToFetch;
            }

            console.log(`Fetching file with path: ${pathToFetch}`);            // Use the webdav client's getFileContents method with the extracted path
            const contents = await this.client.getFileContents(pathToFetch);

            // Always return a Buffer for consistency
            if (contents instanceof ArrayBuffer) {
                return Buffer.from(contents);
            } else if (contents instanceof Buffer) {
                return contents;
            } else if (contents && typeof contents === 'object' && 'buffer' in contents) {
                // Handle ArrayBufferLike types by converting to Buffer
                return Buffer.from(contents.buffer instanceof ArrayBuffer ? contents.buffer : contents as unknown as ArrayBufferLike);
            } else {
                // If it's a string, convert to Buffer
                return Buffer.from(contents as string, 'utf-8');
            }
        } catch (error) {
            console.error('Error fetching file:', error);
            throw error;
        }
    }

    /**
     * Upload a file to the WebDAV server.
     * @param filePath - The path to the file on the server.
     * @param data - The file data to upload.
     * @param forceOverwrite - Whether to force overwrite even if initial upload fails.
     */
    public async uploadFile(filePath: string, data: Buffer | string, forceOverwrite: boolean = true): Promise<void> {
        try {
            await this.client.putFileContents(filePath, data, { overwrite: true });
            console.log(`File uploaded successfully to ${filePath}`);
        } catch (error) {
            // Handle specific WebDAV error codes
            const webdavError = error as { status?: number; response?: { status?: number } };
            const statusCode = webdavError.status || webdavError.response?.status;

            if (statusCode === 409 && forceOverwrite) {
                console.warn(`File conflict at ${filePath}, attempting to delete and retry...`);
                try {
                    // Check if file exists first
                    const fileExists = await this.exists(filePath);
                    if (fileExists) {
                        // Try to delete the existing file and retry
                        await this.deleteFile(filePath);
                        console.log(`Deleted existing file at ${filePath}, retrying upload...`);
                    }

                    // Retry the upload
                    await this.client.putFileContents(filePath, data, { overwrite: true });
                    console.log(`File uploaded successfully to ${filePath} after conflict resolution`);
                    return;
                } catch (retryError) {
                    console.error(`Failed to resolve file conflict at ${filePath}:`, retryError);
                    throw new Error(`WebDAV file conflict could not be resolved: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
                }
            }

            console.error(`Error uploading file to ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Delete a file from the WebDAV server.
     * @param filePath - The path to the file on the server.
     */
    public async deleteFile(filePath: string): Promise<void> {
        try {
            await this.client.deleteFile(filePath);
            console.log(`File deleted successfully from ${filePath}`);
        } catch (error) {
            console.error(`Error deleting file from ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Create a directory on the WebDAV server.
     * @param dirPath - The path to the directory to create.
     */
    public async createDirectory(dirPath: string): Promise<void> {
        try {
            await this.client.createDirectory(dirPath, { recursive: true });
            console.log(`Directory created successfully at ${dirPath}`);
        } catch (error) {
            console.error(`Error creating directory at ${dirPath}:`, error);
            throw error;
        }
    }

    /**
     * Delete a directory from the WebDAV server.
     * @param dirPath - The path to the directory to delete.
     */
    public async deleteDirectory(dirPath: string): Promise<void> {
        try {
            await this.client.deleteFile(dirPath);
            console.log(`Directory deleted successfully from ${dirPath}`);
        } catch (error) {
            console.error(`Error deleting directory from ${dirPath}:`, error);
            throw error;
        }
    }

    /**
     * Check if a file or directory exists on the WebDAV server.
     * @param path - The path to check.
     */
    public async exists(path: string): Promise<boolean> {
        try {
            await this.client.stat(path);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Move/rename a file or directory on the WebDAV server.
     * @param sourcePath - The current path of the file/directory.
     * @param destPath - The new path for the file/directory.
     */
    public async moveFile(sourcePath: string, destPath: string): Promise<void> {
        try {
            // Try using the underlying client's moveFile method if available
            if (typeof this.client.moveFile === 'function') {
                await this.client.moveFile(sourcePath, destPath);
                console.log(`Successfully moved ${sourcePath} to ${destPath}`);
            } else {
                throw new Error('moveFile method not available on WebDAV client');
            }
        } catch (error) {
            console.error(`Error moving ${sourcePath} to ${destPath}:`, error);
            throw error;
        }
    }
}

// Singleton instance of WebDavService
const webdavService = new WebDavService(process.env.WEBDAV_URL || "https://example.com/");
export default webdavService;