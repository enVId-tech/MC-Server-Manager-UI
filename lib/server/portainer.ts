import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { config } from 'dotenv';

// Load environment variables if not already loaded (without verbose output)
if (!process.env.PORTAINER_URL) {
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    console.log = () => {}; // Temporarily suppress console.log
    console.info = () => {}; // Temporarily suppress console.info
    
    config({ path: '.env.local', debug: false });
    
    // Restore console methods
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
}

// Basic interfaces for Portainer API objects.
export interface PortainerEnvironment {
    Id: number;
    Name: string;
    // Add other relevant environment properties
}

export interface PortainerStack {
    Id: number;
    Name: string;
    EndpointId: number;
}

export interface PortainerContainer {
    Id: string;
    Names: string[];
    Image: string;
    State: string;
    Status: string;
    Created?: number;
    StartedAt?: string;
    FinishedAt?: string;
    ExitCode?: number;
    NetworkSettings?: {
        Ports?: {
            [key: string]: Array<{
                HostIp?: string;
                HostPort?: string;
            }> | null;
        };
    };
    Ports?: Array<{
        IP?: string;
        PrivatePort: number;
        PublicPort?: number;
        Type: string;
    }>;
}

export interface PortainerImage {
    Id: string;
    RepoTags: string[];
    Created: number;
    Size: number;
}

export class PortainerApiClient {
    private portainerUrl: string;
    private apiKey: string | null;
    private username: string | null;
    private password: string | null;
    private authToken: string | null;
    private defaultEnvironmentId: number | null;
    public axiosInstance: AxiosInstance;

    /**
     * @param portainerUrl - The base URL of your Portainer instance
     * @param auth - Authentication: either API key string or {username, password} object
     * @param defaultEnvironmentId - Optional: A default environment ID to use for environment-specific calls.
     */
    constructor(portainerUrl: string, auth: string | { username: string, password: string }, defaultEnvironmentId: number | null = null) {
        if (!portainerUrl || !auth) {
            throw new Error('Portainer URL and authentication are required.');
        }

        this.portainerUrl = portainerUrl.endsWith('/') ? portainerUrl.slice(0, -1) : portainerUrl;
        this.defaultEnvironmentId = defaultEnvironmentId;
        this.authToken = null;

        // Determine authentication method
        if (typeof auth === 'string') {
            // API Key authentication
            this.apiKey = auth;
            this.username = null;
            this.password = null;
        } else {
            // Username/Password authentication
            this.apiKey = null;
            this.username = auth.username;
            this.password = auth.password;
        }

        // Create an Axios instance with default configurations
        this.axiosInstance = axios.create({
            baseURL: this.portainerUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            // For development: ignore SSL certificate validation when using IP addresses
            httpsAgent: (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) ?
                new https.Agent({ rejectUnauthorized: false }) :
                undefined,
        });

        // Set initial auth headers
        this.updateAuthHeaders();

        // Add an interceptor for common error handling or logging
        this.axiosInstance.interceptors.response.use(
            response => response,
            async error => {
                const config = error.config;
                const errorMessage = error.message || 'An unknown error occurred.';

                // If we get a 401 and we're using username/password, try to re-authenticate
                if (error.response?.status === 401 && this.username && this.password) {
                    console.log('Authentication failed, attempting to re-authenticate...');
                    try {
                        await this.authenticate();
                        // Retry the original request
                        return this.axiosInstance.request(config);
                    } catch (authError) {
                        console.error('Re-authentication failed:', authError);
                    }
                }

                console.error(`Portainer API Error: ${errorMessage}`);
                if (config) {
                    const fullUrl = `${config.baseURL || ''}${config.url || ''}`;
                    console.error(`Request: ${config.method?.toUpperCase()} ${fullUrl}`);
                }

                if (errorMessage.includes('Client sent an HTTP request to an HTTPS server')) {
                    console.error('Hint: This error suggests a protocol mismatch. Your PORTAINER_URL in your .env file might be using "http://" when it should be "https://". Please verify the URL and protocol.');
                }

                if (error.response) {
                    // The request was made and the server responded with a status code
                    // that falls out of the range of 2xx
                    console.error(`Response Status: ${error.response.status}`);
                    console.error('Response Data:', error.response.data);
                } else if (error.request) {
                    // The request was made but no response was received
                    console.error('No response received from Portainer. Check network connectivity, firewall rules, and if the Portainer instance is running at the specified URL.');
                } else {
                    // Something happened in setting up the request that triggered an Error
                    console.error('An error occurred while setting up the request.');
                }

                // You can throw the error again to allow the caller to handle it
                return Promise.reject(error);
            }
        );
    }

    /**
     * Update authentication headers based on the authentication method
     */
    private updateAuthHeaders() {
        if (this.apiKey) {
            this.axiosInstance.defaults.headers['X-API-Key'] = this.apiKey;
        } else if (this.authToken) {
            this.axiosInstance.defaults.headers['Authorization'] = `Bearer ${this.authToken}`;
        }
    }

    /**
     * Authenticate with username/password to get JWT token
     */
    async authenticate(): Promise<boolean> {
        if (!this.username || !this.password) {
            throw new Error('Username and password are required for authentication');
        }

        try {
            const response = await this.axiosInstance.post('/api/auth', {
                Username: this.username,
                Password: this.password
            });

            this.authToken = response.data.jwt;
            this.updateAuthHeaders();
            console.log('Successfully authenticated with Portainer');
            return true;
        } catch (error) {
            console.error('Failed to authenticate with Portainer:', error);
            return false;
        }
    }

    set DefaultEnvironmentId(environmentId: number | null) {
        if (environmentId === null || typeof environmentId === 'number') {
            this.defaultEnvironmentId = environmentId;
        }
    }

    /**
     * Tests the connection to the Portainer API by fetching system status.
     * @returns {Promise<boolean>} A promise that resolves to true if the connection is successful.
     */
    async testConnection(): Promise<boolean> {
        try {
            // If using username/password authentication, authenticate first
            if (this.username && this.password && !this.authToken) {
                const authSuccess = await this.authenticate();
                if (!authSuccess) {
                    return false;
                }
            }

            await this.axiosInstance.get('/api/system/status');
            console.log('Successfully connected to Portainer API.');
            return true;
        } catch (error) {
            console.error('Failed to connect to Portainer API:', error);
            return false;
        }
    }

    /**
     * Fetches Portainer system information including version.
     * @returns {Promise<Record<string, unknown>>} A promise that resolves to system information.
     */
    async getSystemInfo(): Promise<Record<string, unknown>> {
        try {
            // If using username/password authentication, authenticate first
            if (this.username && this.password && !this.authToken) {
                const authSuccess = await this.authenticate();
                if (!authSuccess) {
                    throw new Error('Authentication failed');
                }
            }

            const response = await this.axiosInstance.get('/api/system/status');
            return response.data;
        } catch (error) {
            console.error('Failed to fetch system info:', error);
            throw error;
        }
    }

    /**
     * Fetches a list of all Portainer environments (endpoints).
     * @returns {Promise<PortainerEnvironment[]>} A promise that resolves to an array of environment objects.
     */
    async getEnvironments(): Promise<PortainerEnvironment[]> {
        try {
            // Ensure we're authenticated before making API calls
            if (this.username && this.password && !this.authToken) {
                const authSuccess = await this.authenticate();
                if (!authSuccess) {
                    throw new Error('Authentication failed, cannot get environments');
                }
            }

            const response = await this.axiosInstance.get<PortainerEnvironment[]>('/api/endpoints');
            return response.data;
        } catch (error) {
            console.error('Failed to fetch environments:', error);
            throw error; // Re-throw to allow upstream handling
        }
    }

    /**
     * Fetches a list of all stacks managed by Portainer.
     * @returns {Promise<PortainerStack[]>} A promise that resolves to an array of stack objects.
     */
    async getStacks(): Promise<PortainerStack[]> {
        try {
            const response = await this.axiosInstance.get<PortainerStack[]>('/api/stacks');
            return response.data;
        } catch (error) {
            console.error('Failed to fetch stacks:', error);
            throw error;
        }
    }

    /**
     * Fetches a list of all containers within a specific Portainer environment.
     * This proxies the Docker API's /containers/json endpoint.
     * @param environmentId - The ID of the Portainer environment. Defaults to `this.defaultEnvironmentId`.
     * @param includeAll - Whether to include all containers (running, stopped, etc.).
     * @returns {Promise<PortainerContainer[]>} A promise that resolves to an array of container objects.
     */
    async getContainers(environmentId: number | null = this.defaultEnvironmentId, includeAll: boolean = true): Promise<PortainerContainer[]> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to fetch containers.');
        }
        try {
            const params = { all: includeAll };
            const response = await this.axiosInstance.get<PortainerContainer[]>(`/api/endpoints/${environmentId}/docker/containers/json`, { params });
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch containers for environment ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Fetches details of a specific container within a Portainer environment.
     * This proxies the Docker API's /containers/{id}/json endpoint.
     * @param environmentId - The ID of the Portainer environment.
     * @param containerId - The ID of the container.
     * @returns {Promise<any>} A promise that resolves to the container details object.
     */
    async getContainerDetails(containerId: string, environmentId: number | null = this.defaultEnvironmentId): Promise<PortainerContainer> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to fetch container details.');
        }
        if (!containerId) {
            throw new Error('Container ID is required to fetch container details.');
        }
        try {
            const response = await this.axiosInstance.get<PortainerContainer>(`/api/endpoints/${environmentId}/docker/containers/${containerId}/json`);
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch details for container ${containerId} in environment ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Fetches a list of all Docker images within a specific Portainer environment.
     * This proxies the Docker API's /images/json endpoint.
     * @param environmentId - The ID of the Portainer environment.
     * @returns {Promise<PortainerImage[]>} A promise that resolves to an array of image objects.
     */
    async getImages(environmentId: number | null = this.defaultEnvironmentId): Promise<PortainerImage[]> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to fetch images.');
        }
        try {
            const response = await this.axiosInstance.get<PortainerImage[]>(`/api/endpoints/${environmentId}/docker/images/json`);
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch images for environment ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Get a container by name
     * @param containerName - The name of the container to find
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the container object or null if not found
     */
    async getContainerByName(containerName: string, environmentId: number | null = this.defaultEnvironmentId): Promise<PortainerContainer | null> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to get container by name.');
        }

        try {
            const containers = await this.getContainers(environmentId, true);
            const container = containers.find(c =>
                c.Names.some(name => name.includes(containerName)) ||
                c.Names.some(name => name === `/${containerName}`) ||
                c.Names.some(name => name.replace('/', '') === containerName)
            );

            return container || null;
        } catch (error) {
            console.error(`Failed to get container by name "${containerName}":`, error);
            return null;
        }
    }

    /**
     * Get a stack by name
     * @param stackName - The name of the stack to find
     * @returns Promise resolving to the stack object or null if not found
     */
    async getStackByName(stackName: string): Promise<PortainerStack | null> {
        try {
            const stacks = await this.getStacks();
            const stack = stacks.find(s => s.Name === stackName);
            return stack || null;
        } catch (error) {
            console.error(`Failed to get stack by name "${stackName}":`, error);
            return null;
        }
    }

    /**
     * Verify that a stack was created successfully
     * @param stackName - The name of the stack to verify
     * @param timeoutMs - Timeout in milliseconds (default: 5000)
     * @returns Promise resolving to true if stack exists
     */
    async verifyStackCreation(stackName: string, timeoutMs: number = 5000): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                const stack = await this.getStackByName(stackName);
                if (stack) {
                    console.log(`✅ Stack "${stackName}" verified successfully`);
                    return true;
                }
            } catch (error) {
                console.warn('Error during stack verification:', error);
            }

            // Wait 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.warn(`⚠️ Stack verification timed out for "${stackName}"`);
        return false;
    }

    /**
     * Verify that a container was created successfully
     * @param containerName - The name of the container to verify
     * @param environmentId - The ID of the Portainer environment
     * @param timeoutMs - Timeout in milliseconds (default: 5000)
     * @returns Promise resolving to true if container exists and is running
     */
    async verifyContainerCreation(containerName: string, environmentId: number, timeoutMs: number = 5000): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                const containers = await this.getContainers(environmentId, true);
                const container = containers.find(c =>
                    c.Names.some(name => name.includes(containerName)) ||
                    c.Names.some(name => name === `/${containerName}`)
                );

                if (container) {
                    console.log(`✅ Container "${containerName}" verified successfully (State: ${container.State})`);
                    return true;
                }
            } catch (error) {
                console.warn('Error during container verification:', error);
            }

            // Wait 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.warn(`⚠️ Container verification timed out for "${containerName}"`);
        return false;
    }

    /**
     * Clean up any existing container with the same name
     * @param containerName - The name of the container to clean up
     * @param environmentId - The ID of the Portainer environment
     */
    async cleanupExistingContainer(containerName: string, environmentId: number): Promise<void> {
        try {
            const containers = await this.getContainers(environmentId, true);
            const existingContainer = containers.find(c =>
                c.Names.some(name => name.includes(containerName)) ||
                c.Names.some(name => name === `/${containerName}`)
            );

            if (existingContainer) {
                console.log(`🗑️ Cleaning up existing container "${containerName}" (ID: ${existingContainer.Id})`);

                // Stop the container if it's running
                if (existingContainer.State === 'running') {
                    await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${existingContainer.Id}/stop`);
                    console.log('🛑 Container stopped');
                }

                // Remove the container
                await this.axiosInstance.delete(`/api/endpoints/${environmentId}/docker/containers/${existingContainer.Id}`);
                console.log('🗑️ Container removed');
            }
        } catch (error) {
            console.warn(`Warning: Failed to cleanup existing container "${containerName}":`, error);
            // Don't throw error for cleanup failures
        }
    }

    /**
     * Extract container configuration from Docker Compose content and create container directly
     * @param stackData - The stack configuration data
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the created container data
     */
    async createContainerFromCompose(stackData: Record<string, unknown>, environmentId: number): Promise<Record<string, unknown>> {
        console.log('📦 Creating container from Docker Compose content...');

        const stackName = stackData.Name as string;
        const composeContent = (stackData.ComposeFile || stackData.StackFileContent) as string;
        const serviceName = stackName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        // Parse Docker Compose to extract container configuration
        const envVars: string[] = [];
        const envMatch = composeContent.match(/environment:\s*([\s\S]*?)(?=\s*ports:|volumes:|restart:|networks:|$)/);
        if (envMatch) {
            const envSection = envMatch[1];
            const envLines = envSection.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#') && !line.startsWith('-'));

            for (const line of envLines) {
                if (line.includes(':')) {
                    const [key, ...valueParts] = line.split(':');
                    const value = valueParts.join(':').trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
                    if (key && value) {
                        envVars.push(`${key.trim()}=${value}`);
                    }
                }
            }
        }

        // Extract port mappings
        const portBindings: Record<string, Array<{ HostPort: string }>> = {};
        const exposedPorts: Record<string, object> = {};
        const portsMatch = composeContent.match(/ports:\s*([\s\S]*?)(?=\s*volumes:|restart:|networks:|environment:|$)/);
        if (portsMatch) {
            const portsSection = portsMatch[1];
            const portLines = portsSection.split('\n').map(line => line.trim()).filter(line => line.startsWith('-'));

            for (const line of portLines) {
                const portMapping = line.replace(/^-\s*['"]?/, '').replace(/['"]?$/, '');
                if (portMapping.includes(':')) {
                    const [hostPort, containerPort] = portMapping.split(':');
                    const containerPortKey = `${containerPort}/tcp`;
                    exposedPorts[containerPortKey] = {};
                    portBindings[containerPortKey] = [{ HostPort: hostPort }];
                }
            }
        }

        // Extract volume mounts
        const binds: string[] = [];
        const volumesMatch = composeContent.match(/volumes:\s*([\s\S]*?)(?=\s*restart:|networks:|environment:|ports:|$)/);
        if (volumesMatch) {
            const volumesSection = volumesMatch[1];
            const volumeLines = volumesSection.split('\n').map(line => line.trim()).filter(line => line.startsWith('-'));

            for (const line of volumeLines) {
                const volumeMapping = line.replace(/^-\s*['"]?/, '').replace(/['"]?$/, '');
                if (volumeMapping.includes(':')) {
                    binds.push(volumeMapping);
                }
            }
        }

        console.log(`📦 Creating container "${serviceName}" with:`);
        console.log(`   Environment variables: ${envVars.length} vars`);
        console.log(`   Port bindings:`, Object.keys(portBindings));
        console.log(`   Volume binds:`, binds);

        // Create container payload
        const containerPayload = {
            Image: 'itzg/minecraft-server:latest',
            name: serviceName,
            Env: envVars,
            ExposedPorts: exposedPorts,
            HostConfig: {
                PortBindings: portBindings,
                Binds: binds,
                RestartPolicy: {
                    Name: 'unless-stopped'
                }
            },
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            OpenStdin: true,
            Labels: {
                'minecraft.server.id': stackName.replace('minecraft-', ''),
                'minecraft.server.name': serviceName,
                'minecraft.server.type': 'PAPER',
                'minecraft.managed-by': 'minecraft-server-creator'
            }
        };

        // Clean up any existing container with the same name
        await this.cleanupExistingContainer(serviceName, environmentId);

        console.log('📤 Creating container...');
        const response = await this.axiosInstance.post(
            `/api/endpoints/${environmentId}/docker/containers/create?name=${serviceName}`,
            containerPayload
        );

        console.log('✅ Container created successfully!');
        const containerId = response.data.Id;

        // Start the container
        console.log('▶️ Starting container...');
        await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/start`);

        // Verify container creation
        const verified = await this.verifyContainerCreation(serviceName, environmentId, 10000);
        if (!verified) {
            throw new Error('Container creation verification failed');
        }

        console.log('🎉 Container started and verified successfully!');
        return {
            Id: containerId,
            Name: serviceName,
            method: 'direct-container',
            containerCreated: true,
            verified: true
        };
    }

    /**
     * Create a new stack in Portainer with Docker Compose content
     * @param stackData - The stack configuration data
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the created stack data
     */
    async createStack(stackData: Record<string, unknown>, environmentId: number | null = this.defaultEnvironmentId): Promise<Record<string, unknown>> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to create a stack.');
        }

        console.log(`🚀 Attempting to create stack on environment ${environmentId}`);
        console.log('Stack data:', JSON.stringify(stackData, null, 2));

        const stackName = stackData.Name as string;
        const composeContent = (stackData.ComposeFile || stackData.StackFileContent) as string;

        if (!stackName || !composeContent) {
            throw new Error('Stack name and compose content are required');
        }

        // Check if stack already exists
        try {
            const existingStack = await this.getStackByName(stackName);
            if (existingStack) {
                console.log(`⚠️ Stack "${stackName}" already exists (ID: ${existingStack.Id})`);
                return existingStack as unknown as Record<string, unknown>;
            }
        } catch {
            // Stack doesn't exist, continue with creation
            console.log('Stack does not exist, proceeding with creation...');
        }

        // Method 1: Try the standard Portainer stack creation with compose string
        try {
            console.log('📋 Method 1: Standard stack creation with compose string...');

            const payload = {
                Name: stackName,
                ComposeFile: composeContent,
                Env: stackData.Env || [],
                FromAppTemplate: false
            };

            console.log('📤 Sending payload:', JSON.stringify(payload, null, 2));

            const response = await this.axiosInstance.post(
                `/api/stacks?type=2&method=string&endpointId=${environmentId}`,
                payload
            );

            console.log('✅ Method 1 Success! Stack created with standard API');
            console.log('📥 Response:', JSON.stringify(response.data, null, 2));
            return response.data;

        } catch (method1Error) {
            console.error('❌ Method 1 failed:', method1Error);

            // Method 2: Try the string-based endpoint
            try {
                console.log('📋 Method 2: String-based stack creation...');

                const payload = {
                    Name: stackName,
                    StackFileContent: composeContent,
                    Env: stackData.Env || []
                };

                const response = await this.axiosInstance.post(
                    `/api/stacks/create/standalone/string?endpointId=${environmentId}&type=2`,
                    payload
                );

                console.log('✅ Method 2 Success! Stack created with string endpoint');
                return response.data;

            } catch (method2Error) {
                console.error('❌ Method 2 failed:', method2Error);

                // Method 3: Try with repository simulation
                try {
                    console.log('📋 Method 3: Repository simulation...');

                    const payload = {
                        name: stackName,
                        stackFileContent: composeContent,
                        env: stackData.Env || [],
                        fromAppTemplate: false,
                        repositoryAuthentication: false,
                        repositoryURL: "",
                        repositoryReferenceName: "",
                        composeFormat: true
                    };

                    const response = await this.axiosInstance.post(
                        `/api/stacks/create/compose/string?endpointId=${environmentId}&type=2`,
                        payload
                    );

                    console.log('✅ Method 3 Success! Stack created with repository simulation');
                    return response.data;

                } catch (method3Error) {
                    console.error('❌ Method 3 failed:', method3Error);

                    // Method 4: Direct container creation fallback
                    console.log('📋 Method 4: Falling back to direct container creation...');
                    return await this.createContainerFromCompose(stackData, environmentId);
                }
            }
        }
    }

    /**
     * Alternative Portainer deployment - try Docker container creation instead of stacks
     * This is more compatible than Docker services which require swarm mode
     */
    async deployToPortainerService(stackData: Record<string, unknown>, environmentId: number): Promise<Record<string, unknown>> {
        try {
            console.log('🔄 Trying direct container creation as alternative to stacks...');

            // Use the existing container creation method which is more reliable
            // and doesn't require Docker swarm mode
            const containerResult = await this.createContainerFromCompose(stackData, environmentId);

            console.log('✅ Container created successfully via direct container API');
            return containerResult;
        } catch (error) {
            console.error('❌ Failed to create container via direct container API:', error);
            throw error;
        }
    }

    /**
     * Smart stack creation with automatic fallback and verification
     * @param stackData - The stack configuration data
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the created stack data
     */
    async createStackSmart(stackData: Record<string, unknown>, environmentId: number | null = this.defaultEnvironmentId): Promise<Record<string, unknown>> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to create a stack.');
        }

        const stackName = stackData.Name as string;
        const composeContent = (stackData.ComposeFile || stackData.StackFileContent) as string;

        if (!stackName || !composeContent) {
            throw new Error('Stack name and compose content are required');
        }

        console.log(`🧠 Smart stack creation for "${stackName}" on environment ${environmentId}`);

        // Check if stack already exists
        const existingStack = await this.getStackByName(stackName);
        if (existingStack) {
            console.log(`⚠️ Stack "${stackName}" already exists (ID: ${existingStack.Id})`);
            return existingStack as unknown as Record<string, unknown>;
        }

        // Try the main create stack method first
        try {
            const result = await this.createStack(stackData, environmentId);

            // Verify the stack was actually created
            const verified = await this.verifyStackCreation(stackName, 10000);
            if (verified) {
                console.log(`✅ Stack creation successful`);
                return result;
            } else {
                console.warn(`⚠️ Stack creation returned success but verification failed`);
                throw new Error('Stack creation verification failed');
            }
        } catch (error) {
            console.error(`❌ Stack creation failed:`, error);

            // If stack creation fails, try direct container creation as fallback
            console.log('🔄 Falling back to direct container creation...');
            try {
                const containerResult = await this.createContainerFromCompose(stackData, environmentId);
                console.log('✅ Fallback container creation successful');
                return containerResult;
            } catch (containerError) {
                console.error('❌ Fallback container creation also failed:', containerError);
                throw new Error(`Stack creation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Container fallback error: ${containerError instanceof Error ? containerError.message : 'Unknown error'}`);
            }
        }
    }

    /**
     * Create stack using Portainer 2.x optimized format
     */
    async createStackPortainer2x(stackData: Record<string, unknown>, environmentId: number): Promise<Record<string, unknown>> {
        console.log('📋 Portainer 2.x stack creation...');

        const stackName = stackData.Name as string;
        const composeContent = (stackData.ComposeFile || stackData.StackFileContent) as string;

        const payload = {
            name: stackName, // lowercase 'name' for newer Portainer versions
            stackFileContent: composeContent, // camelCase for newer versions
            env: stackData.Env || [],
            fromAppTemplate: false,
            repositoryAuthentication: false,
            repositoryURL: "",
            repositoryReferenceName: "",
            composeFormat: true
        };

        const response = await this.axiosInstance.post(
            `/api/stacks/create/compose/string?endpointId=${environmentId}&type=2`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Portainer 2.x stack created successfully');
        return response.data;
    }

    /**
     * Create stack using Portainer 1.x compatible format
     */
    async createStackPortainer1x(stackData: Record<string, unknown>, environmentId: number): Promise<Record<string, unknown>> {
        console.log('📋 Portainer 1.x stack creation...');

        const stackName = stackData.Name as string;
        const composeContent = (stackData.ComposeFile || stackData.StackFileContent) as string;

        const payload = {
            Name: stackName, // uppercase 'Name' for older versions
            ComposeFileContent: composeContent, // Different property name
            Env: stackData.Env || [],
            EndpointId: environmentId
        };

        const response = await this.axiosInstance.post(
            `/api/stacks?type=2&method=1&endpointId=${environmentId}`,
            payload
        );

        console.log('✅ Portainer 1.x stack created successfully');
        return response.data;
    }

    /**
     * Create stack using endpoint-specific API path
     */
    async createStackEndpointSpecific(stackData: Record<string, unknown>, environmentId: number): Promise<Record<string, unknown>> {
        console.log('📋 Endpoint-specific stack creation...');

        const stackName = stackData.Name as string;
        const composeContent = (stackData.ComposeFile || stackData.StackFileContent) as string;

        const payload = {
            Name: stackName,
            StackFileContent: composeContent,
            Env: stackData.Env || []
        };

        const response = await this.axiosInstance.post(
            `/api/endpoints/${environmentId}/stacks?type=2&method=string`,
            payload
        );

        console.log('✅ Endpoint-specific stack created successfully');
        return response.data;
    }

    /**
     * Create stack using legacy API format
     */
    async createStackLegacy(stackData: Record<string, unknown>, environmentId: number): Promise<Record<string, unknown>> {
        console.log('📋 Legacy stack creation...');

        const stackName = stackData.Name as string;
        const composeContent = (stackData.ComposeFile || stackData.StackFileContent) as string;

        const payload = {
            name: stackName,
            compose: composeContent, // Very basic property name
            environmentId: environmentId,
            type: 'compose'
        };

        const response = await this.axiosInstance.post('/api/stacks/compose', payload);

        console.log('✅ Legacy stack created successfully');
        return response.data;
    }

    /**
     * Create stack using minimal payload (last resort before container creation)
     */
    async createStackMinimal(stackData: Record<string, unknown>, environmentId: number): Promise<Record<string, unknown>> {
        console.log('📋 Minimal stack creation...');

        const stackName = stackData.Name as string;
        const composeContent = (stackData.ComposeFile || stackData.StackFileContent) as string;

        // Absolutely minimal payload
        const payload = {
            Name: stackName,
            ComposeFile: composeContent
        };

        const response = await this.axiosInstance.post(
            `/api/stacks?endpointId=${environmentId}`,
            payload
        );

        console.log('✅ Minimal stack created successfully');
        return response.data;
    }

    /**
     * Create stack with comprehensive verification and retry logic
     * @param stackData - The stack configuration data
     * @param environmentId - The ID of the Portainer environment
     * @param maxRetries - Maximum number of retry attempts
     * @returns Promise resolving to the created stack data with verification
     */
    async createStackWithVerification(stackData: Record<string, unknown>, environmentId: number | null = this.defaultEnvironmentId, maxRetries: number = 3): Promise<Record<string, unknown>> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to create a stack.');
        }

        const stackName = stackData.Name as string;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 Stack creation attempt ${attempt}/${maxRetries} for "${stackName}"`);

                // Try smart stack creation
                const result = await this.createStackSmart(stackData, environmentId);

                // Double-check verification
                console.log('🔍 Final verification of stack creation...');
                const verified = await this.verifyStackCreation(stackName, 10000);

                if (verified) {
                    console.log(`🎉 Stack "${stackName}" created and verified successfully!`);
                    return result;
                } else {
                    throw new Error('Stack creation reported success but verification failed');
                }

            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                console.error(`❌ Stack creation attempt ${attempt} failed:`, lastError.message);

                if (attempt < maxRetries) {
                    console.log(`⏳ Waiting 2 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.error(`🚨 All ${maxRetries} stack creation attempts failed`);
                }
            }
        }

        // If all stack creation attempts fail, try direct container creation as final fallback
        console.log('🔄 Stack creation failed, falling back to direct container creation...');
        try {
            const containerResult = await this.createContainerFromCompose(stackData, environmentId);
            console.log('✅ Fallback container creation successful');
            return containerResult;
        } catch (containerError) {
            console.error('❌ Fallback container creation also failed:', containerError);
            throw new Error(`Stack creation failed after ${maxRetries} attempts. Last error: ${lastError?.message}. Container fallback error: ${containerError instanceof Error ? containerError.message : 'Unknown error'}`);
        }
    }

    /**
     * Rollback operation - cleanup any resources that were created during a failed deployment
     */
    private rollbackResources: Array<{
        type: 'stack' | 'container';
        id: string | number;
        environmentId: number;
        name: string;
    }> = [];

    /**
     * Track a resource for potential rollback
     * @param resource - The resource to track
     */
    private trackResourceForRollback(resource: {
        type: 'stack' | 'container';
        id: string | number;
        environmentId: number;
        name: string;
    }): void {
        this.rollbackResources.push(resource);
        console.log(`🔍 Tracking ${resource.type} "${resource.name}" (ID: ${resource.id}) for potential rollback`);
    }

    /**
     * Clear rollback tracking (call when operation succeeds)
     */
    private clearRollbackTracking(): void {
        console.log(`✅ Operation successful, clearing rollback tracking for ${this.rollbackResources.length} resources`);
        this.rollbackResources = [];
    }

    /**
     * Execute rollback - remove all tracked resources
     * @param reason - The reason for the rollback
     */
    async executeRollback(reason: string): Promise<void> {
        if (this.rollbackResources.length === 0) {
            console.log('ℹ️ No resources to rollback');
            return;
        }

        console.log(`🔄 Executing rollback due to: ${reason}`);
        console.log(`🗑️ Rolling back ${this.rollbackResources.length} resources...`);

        const rollbackErrors: string[] = [];

        // Rollback in reverse order (last created first)
        for (let i = this.rollbackResources.length - 1; i >= 0; i--) {
            const resource = this.rollbackResources[i];

            try {
                console.log(`🗑️ Rolling back ${resource.type} "${resource.name}" (ID: ${resource.id})...`);

                if (resource.type === 'stack') {
                    await this.deleteStack(resource.id as number, resource.environmentId);
                } else if (resource.type === 'container') {
                    // Stop and remove container
                    try {
                        await this.axiosInstance.post(`/api/endpoints/${resource.environmentId}/docker/containers/${resource.id}/stop`);
                    } catch (stopError) {
                        // Container might already be stopped
                        console.warn(`Warning: Could not stop container ${resource.id}:`, stopError);
                    }

                    await this.axiosInstance.delete(`/api/endpoints/${resource.environmentId}/docker/containers/${resource.id}`);
                }

                console.log(`✅ Successfully rolled back ${resource.type} "${resource.name}"`);
            } catch (error) {
                const errorMsg = `Failed to rollback ${resource.type} "${resource.name}": ${error instanceof Error ? error.message : 'Unknown error'}`;
                rollbackErrors.push(errorMsg);
                console.error(`❌ ${errorMsg}`);
            }
        }

        // Clear tracking after rollback attempt
        this.rollbackResources = [];

        if (rollbackErrors.length > 0) {
            console.warn(`⚠️ Rollback completed with ${rollbackErrors.length} errors:`, rollbackErrors);
        } else {
            console.log('✅ Rollback completed successfully');
        }
    }

    /**
     * Create stack with comprehensive rollback on failure
     * @param stackData - The stack configuration data
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the created stack data
     */
    async createStackWithRollback(stackData: Record<string, unknown>, environmentId: number | null = this.defaultEnvironmentId): Promise<Record<string, unknown>> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to create a stack.');
        }

        const stackName = stackData.Name as string;
        let result: Record<string, unknown>;

        try {
            console.log(`🚀 Creating stack "${stackName}" with rollback protection...`);

            // Clear any previous rollback tracking
            this.clearRollbackTracking();

            // Try to create the stack
            result = await this.createStackSmart(stackData, environmentId);

            // Track the created resource
            if (result.Id) {
                this.trackResourceForRollback({
                    type: result.containerCreated ? 'container' : 'stack',
                    id: result.Id as string | number,
                    environmentId,
                    name: stackName
                });
            }

            // Verify the creation
            const verified = result.containerCreated ?
                await this.verifyContainerCreation(stackName, environmentId, 10000) :
                await this.verifyStackCreation(stackName, 10000);

            if (!verified) {
                throw new Error(`${result.containerCreated ? 'Container' : 'Stack'} creation verification failed`);
            }

            console.log(`✅ Stack "${stackName}" created and verified successfully`);
            this.clearRollbackTracking();
            return result;

        } catch (error) {
            const errorMessage = `Stack creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(`❌ ${errorMessage}`);

            // Execute rollback
            await this.executeRollback(errorMessage);

            // Re-throw the original error with rollback info
            throw new Error(`${errorMessage}. All created resources have been cleaned up.`);
        }
    }

    /**
     * Get container logs from Portainer
     * @param containerId - The ID of the container
     * @param environmentId - The ID of the Portainer environment
     * @param tail - Number of log lines to return (default: 1000)
     * @returns Promise resolving to the container logs
     */
    async getContainerLogs(containerId: string, environmentId: number | null = this.defaultEnvironmentId, tail: number = 1000): Promise<string> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to get container logs.');
        }

        try {
            console.log(`📄 Getting logs for container ${containerId}...`);
            const response = await this.axiosInstance.get(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/logs?stdout=1&stderr=1&tail=${tail}&timestamps=1`
            );
            return response.data;
        } catch (error) {
            console.error(`❌ Failed to get logs for container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Get all used ports from containers in Portainer
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to an array of used port numbers
     */
    async getUsedPorts(environmentId: number | null = this.defaultEnvironmentId): Promise<number[]> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to get used ports.');
        }

        try {
            const containers = await this.getContainers(environmentId, true);
            const usedPorts: number[] = [];

            for (const container of containers) {
                if (container.Ports) {
                    for (const port of container.Ports) {
                        if (port.PublicPort) {
                            usedPorts.push(port.PublicPort);
                        }
                    }
                }

                // Also check NetworkSettings.Ports
                if (container.NetworkSettings?.Ports) {
                    for (const [, portMappings] of Object.entries(container.NetworkSettings.Ports)) {
                        if (portMappings) {
                            for (const mapping of portMappings) {
                                if (mapping.HostPort) {
                                    usedPorts.push(parseInt(mapping.HostPort));
                                }
                            }
                        }
                    }
                }
            }

            return [...new Set(usedPorts)].sort((a, b) => a - b);
        } catch (error) {
            console.error(`❌ Failed to get used ports for environment ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a stack from Portainer
     * @param stackId - The ID of the stack to delete
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the delete operation result
     */
    async deleteStack(stackId: number, environmentId: number | null = this.defaultEnvironmentId): Promise<Record<string, unknown>> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to delete a stack.');
        }

        try {
            console.log(`🗑️ Deleting stack ${stackId} from environment ${environmentId}...`);
            const response = await this.axiosInstance.delete(`/api/stacks/${stackId}?endpointId=${environmentId}`);
            console.log('✅ Stack deleted successfully');
            return response.data;
        } catch (error) {
            console.error(`❌ Failed to delete stack ${stackId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a stack by name
     * @param stackName - The name of the stack to delete
     * @param environmentId - The ID of the Portainer environment (optional)
     * @returns Promise resolving to the deletion operation result, or null if stack not found
     */
    async deleteStackByName(stackName: string, environmentId: number | null = this.defaultEnvironmentId): Promise<Record<string, unknown> | null> {
        if (!stackName) {
            throw new Error('Stack name is required to delete stack.');
        }
        try {
            console.log(`🔍 Looking for stack: ${stackName}`);
            const stack = await this.getStackByName(stackName);
            
            if (!stack) {
                console.log(`⚠️ Stack '${stackName}' not found`);
                return null;
            }

            console.log(`📋 Found stack: ${stackName} (ID: ${stack.Id})`);
            return await this.deleteStack(stack.Id, environmentId);
        } catch (error) {
            console.error(`❌ Failed to delete stack ${stackName}:`, error);
            throw error;
        }
    }

    /**
     * Start a container
     * @param containerId - The ID of the container to start
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving when container is started
     */
    async startContainer(containerId: string, environmentId: number | null = this.defaultEnvironmentId): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to start a container.');
        }

        try {
            console.log(`▶️ Starting container ${containerId}...`);
            await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/start`);
            console.log('✅ Container started successfully');
        } catch (error) {
            console.error(`❌ Failed to start container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Stop a container
     * @param containerId - The ID of the container to stop
     * @param environmentId - The ID of the Portainer environment
     * @param timeout - Timeout in seconds (default: 10)
     * @returns Promise resolving when container is stopped
     */
    async stopContainer(containerId: string, environmentId: number | null = this.defaultEnvironmentId, timeout: number = 10): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to stop a container.');
        }

        try {
            console.log(`🛑 Stopping container ${containerId}...`);
            await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/stop?t=${timeout}`);
            console.log('✅ Container stopped successfully');
        } catch (error) {
            console.error(`❌ Failed to stop container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Remove a container
     * @param containerId - The ID of the container to remove
     * @param environmentId - The ID of the Portainer environment
     * @param force - Force removal of running container
     * @param removeVolumes - Remove associated volumes
     * @returns Promise resolving when container is removed
     */
    async removeContainer(containerId: string, environmentId: number | null = this.defaultEnvironmentId, force: boolean = false, removeVolumes: boolean = false): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to remove a container.');
        }

        try {
            console.log(`🗑️ Removing container ${containerId}...`);
            const params = new URLSearchParams();
            if (force) params.append('force', 'true');
            if (removeVolumes) params.append('v', 'true');
            
            const url = `/api/endpoints/${environmentId}/docker/containers/${containerId}?${params.toString()}`;
            await this.axiosInstance.delete(url);
            console.log('✅ Container removed successfully');
        } catch (error) {
            console.error(`❌ Failed to remove container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Kill a container (force stop)
     * @param containerId - The ID of the container to kill
     * @param environmentId - The ID of the Portainer environment
     * @param signal - Kill signal (default: SIGKILL)
     * @returns Promise resolving when container is killed
     */
    async killContainer(containerId: string, environmentId: number | null = this.defaultEnvironmentId, signal: string = 'SIGKILL'): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to kill a container.');
        }

        try {
            console.log(`💀 Killing container ${containerId} with signal ${signal}...`);
            await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/kill?signal=${signal}`);
            console.log('✅ Container killed successfully');
        } catch (error) {
            console.error(`❌ Failed to kill container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Pause a container
     * @param containerId - The ID of the container to pause
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving when container is paused
     */
    async pauseContainer(containerId: string, environmentId: number | null = this.defaultEnvironmentId): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to pause a container.');
        }

        try {
            console.log(`⏸️ Pausing container ${containerId}...`);
            await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/pause`);
            console.log('✅ Container paused successfully');
        } catch (error) {
            console.error(`❌ Failed to pause container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Unpause a container
     * @param containerId - The ID of the container to unpause
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving when container is unpaused
     */
    async unpauseContainer(containerId: string, environmentId: number | null = this.defaultEnvironmentId): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to unpause a container.');
        }

        try {
            console.log(`▶️ Unpausing container ${containerId}...`);
            await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/unpause`);
            console.log('✅ Container unpaused successfully');
        } catch (error) {
            console.error(`❌ Failed to unpause container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Get a container by identifier (name or partial ID)
     * @param identifier - Container name or partial ID to search for
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the container object or null if not found
     */
    async getContainerByIdentifier(identifier: string, environmentId: number | null = this.defaultEnvironmentId): Promise<PortainerContainer | null> {
        try {
            const containers = await this.getContainers(environmentId, true);
            
            // Search by exact name match first
            let container = containers.find(c => 
                c.Names.some(name => {
                    const cleanName = name.startsWith('/') ? name.substring(1) : name;
                    return cleanName === identifier;
                })
            );

            // If not found by exact name, search by partial ID match
            if (!container) {
                container = containers.find(c => c.Id.startsWith(identifier));
            }

            // If still not found, search by partial name match
            if (!container) {
                container = containers.find(c => 
                    c.Names.some(name => {
                        const cleanName = name.startsWith('/') ? name.substring(1) : name;
                        return cleanName.includes(identifier);
                    })
                );
            }

            return container || null;
        } catch (error) {
            console.error(`Error finding container by identifier "${identifier}":`, error);
            return null;
        }
    }

    /**
     * Get the first available environment ID
     * @returns Promise resolving to the first environment ID or null if none found
     */
    async getFirstEnvironmentId(): Promise<number | null> {
        try {
            const environments = await this.getEnvironments();
            return environments.length > 0 ? environments[0].Id : null;
        } catch (error) {
            console.error('Error getting first environment ID:', error);
            return null;
        }
    }

    /**
     * Restart a container
     * @param containerId - The ID of the container to restart
     * @param environmentId - The ID of the Portainer environment
     * @param timeout - Timeout in seconds (default: 10)
     * @returns Promise resolving when container is restarted
     */
    async restartContainer(containerId: string, environmentId: number | null = this.defaultEnvironmentId, timeout: number = 10): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to restart a container.');
        }

        try {
            console.log(`🔄 Restarting container ${containerId}...`);
            await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/restart?t=${timeout}`);
            console.log('✅ Container restarted successfully');
        } catch (error) {
            console.error(`❌ Failed to restart container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Start a stack
     * @param stackId - The ID of the stack to start
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving when stack is started
     */
    async startStack(stackId: number, environmentId: number | null = this.defaultEnvironmentId): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to start a stack.');
        }

        try {
            console.log(`▶️ Starting stack ${stackId}...`);
            await this.axiosInstance.post(`/api/stacks/${stackId}/start?endpointId=${environmentId}`);
            console.log('✅ Stack started successfully');
        } catch (error) {
            console.error(`❌ Failed to start stack ${stackId}:`, error);
            throw error;
        }
    }

    /**
     * Stop a stack
     * @param stackId - The ID of the stack to stop
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving when stack is stopped
     */
    async stopStack(stackId: number, environmentId: number | null = this.defaultEnvironmentId): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to stop a stack.');
        }

        try {
            console.log(`🛑 Stopping stack ${stackId}...`);
            await this.axiosInstance.post(`/api/stacks/${stackId}/stop?endpointId=${environmentId}`);
            console.log('✅ Stack stopped successfully');
        } catch (error) {
            console.error(`❌ Failed to stop stack ${stackId}:`, error);
            throw error;
        }
    }
}

const portainer = new PortainerApiClient(
    process.env.PORTAINER_URL || 'https://your-portainer-instance.com:9443',
    process.env.PORTAINER_API_KEY ?
        process.env.PORTAINER_API_KEY :
        {
            username: process.env.PORTAINER_USERNAME || 'admin',
            password: process.env.PORTAINER_PASSWORD || 'password'
        }
);

export default portainer;