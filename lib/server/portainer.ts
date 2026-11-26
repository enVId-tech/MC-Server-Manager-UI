import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { config } from 'dotenv';
import { sendDirectContainerInput, withDirectDocker } from '@/lib/server/dockerDirect';

// Load environment variables if not already loaded (without verbose output)
if (!process.env.PORTAINER_URL) {
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    console.log = () => {}; // Temporarily suppress console.log
    console.info = () => {}; // Temporarily suppress console.info
    
    config({ path: '.env', debug: false });
    
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
    /** Id of the image the container was created from */
    ImageID?: string;
    State: string;
    Status: string;
    Created?: number;
    StartedAt?: string;
    FinishedAt?: string;
    ExitCode?: number;
    NetworkSettings?: {
        Networks?: {
            [key: string]: {
                IPAddress?: string;
                Gateway?: string;
                MacAddress?: string;
            };
        };
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
    HostConfig?: {
        Memory?: number;
        CpuQuota?: number;
        CpuPeriod?: number;
        PortBindings?: Record<string, Array<{ HostPort?: string }> | null>;
        RestartPolicy?: {
            Name: string;
            MaximumRetryCount?: number;
        };
    };
    /** Bind mounts and volumes, present in both the list and the inspect response */
    Mounts?: Array<{
        Type?: string;
        Source?: string;
        Destination: string;
        RW?: boolean;
    }>;
    Labels?: Record<string, string>;
    /** Only present in the inspect response */
    Config?: {
        Env?: string[];
        Image?: string;
        User?: string;
        OpenStdin?: boolean;
        Tty?: boolean;
        Labels?: Record<string, string>;
    };
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
    private _environmentIdValidated: boolean = false;
    private validEnvironmentIds: { ids: Set<number>; at: number } | null = null;
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
        this._environmentIdValidated = false;

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
        // SSL certificate verification can be disabled via PORTAINER_REJECT_UNAUTHORIZED=false
        const rejectUnauthorized = process.env.PORTAINER_REJECT_UNAUTHORIZED === 'false' ? false :
            (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) ? false : true;
        
        this.axiosInstance = axios.create({
            baseURL: this.portainerUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            // For development or when explicitly disabled: ignore SSL certificate validation
            httpsAgent: new https.Agent({ rejectUnauthorized }),
        });
        // Docker calls go straight to the Docker socket when it belongs to the same engine as the Portainer
        // environment; everything else (stacks, other hosts, any failure) stays with Portainer
        this.axiosInstance.defaults.adapter = withDirectDocker(axios.getAdapter(this.axiosInstance.defaults.adapter ?? ['xhr', 'http', 'fetch']));

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
            this._environmentIdValidated = false; // Reset validation when changed
        }
    }

    /**
     * Get a valid environment ID, auto-discovering if necessary
     * This ensures we always use a valid environment ID
     */
    async getValidEnvironmentId(requestedId?: number | null): Promise<number> {
        const envId = requestedId ?? this.defaultEnvironmentId;
        const cached = this.validEnvironmentIds;
        if (!cached || Date.now() - cached.at > 60_000) {
            const environments = await this.getEnvironments();
            const ids = new Set(environments.map(env => env.Id));
            this.validEnvironmentIds = { ids, at: Date.now() };
            const firstId = environments[0]?.Id ?? null;
            if (firstId === null) {
                throw new Error('No valid Portainer environment found');
            }
            if (this.defaultEnvironmentId === null || !ids.has(this.defaultEnvironmentId)) {
                console.log(`Updating default environment ID from ${this.defaultEnvironmentId} to ${firstId}`);
                this.defaultEnvironmentId = firstId;
            }
            this._environmentIdValidated = true;
            return envId !== null && ids.has(envId) ? envId : firstId;
        }

        if (envId !== null && cached.ids.has(envId)) {
            return envId;
        }
        const firstId = [...cached.ids][0];
        if (firstId === undefined) {
            throw new Error('No valid Portainer environment found');
        }
        return firstId;
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
     * Fetches details of a specific Portainer environment.
     * @param environmentId - The ID of the environment to fetch.
     * @returns {Promise<PortainerEnvironment>} A promise that resolves to the environment object.
     */
    async getEnvironment(environmentId: number): Promise<PortainerEnvironment> {
        try {
            // Ensure we're authenticated before making API calls
            if (this.username && this.password && !this.authToken) {
                const authSuccess = await this.authenticate();
                if (!authSuccess) {
                    throw new Error('Authentication failed, cannot get environment');
                }
            }

            const response = await this.axiosInstance.get<PortainerEnvironment>(`/api/endpoints/${environmentId}`);
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch environment ${environmentId}:`, error);
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
        // If no environment ID is provided and no default is set, try to get the first one
        if (environmentId === null) {
            console.log('No environment ID provided for getContainers, attempting to fetch first available environment...');
            environmentId = await this.getFirstEnvironmentId();
            if (environmentId === null) {
                throw new Error('No Portainer environments found. Cannot fetch containers.');
            }
            console.log(`Using environment ID: ${environmentId}`);
        }
        
        try {
            const params = { all: includeAll };
            const response = await this.axiosInstance.get<PortainerContainer[]>(`/api/endpoints/${environmentId}/docker/containers/json`, { params });
            return response.data;
        } catch (error) {
            // If we get a 404, it might be that the environment ID is invalid/stale.
            // We try to auto-discover a valid environment ID and retry.
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                console.warn(`Environment ${environmentId} not found (404). Attempting to discover a valid environment...`);
                
                try {
                    const newEnvId = await this.getFirstEnvironmentId();
                    if (newEnvId !== null && newEnvId !== environmentId) {
                        console.log(`Found valid environment ${newEnvId}. Retrying getContainers...`);
                        const params = { all: includeAll };
                        const response = await this.axiosInstance.get<PortainerContainer[]>(`/api/endpoints/${newEnvId}/docker/containers/json`, { params });
                        
                        // If successful, update the defaultEnvironmentId for this instance if it was using the default
                        if (this.defaultEnvironmentId === environmentId) {
                            console.log(`Updating default environment ID from ${this.defaultEnvironmentId} to ${newEnvId}`);
                            this.defaultEnvironmentId = newEnvId;
                        }
                        
                        return response.data;
                    }
                } catch (retryError) {
                    console.error('Retry with new environment ID failed:', retryError);
                }
            }

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
     * Find containers by image name or label
     * @param environmentId - The ID of the Portainer environment
     * @param criteria - Search criteria (image name or label)
     * @returns Promise resolving to array of matching containers
     */
    async findContainers(
        environmentId: number | null = this.defaultEnvironmentId,
        criteria: { image?: string; label?: string }
    ): Promise<PortainerContainer[]> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to find containers.');
        }

        try {
            const containers = await this.getContainers(environmentId);
            
            return containers.filter(container => {
                let match = true;
                
                if (criteria.image) {
                    // Check if image name contains the search string (case insensitive)
                    if (!container.Image.toLowerCase().includes(criteria.image.toLowerCase())) {
                        match = false;
                    }
                }
                
                // Note: Portainer API container object might not expose labels directly in the list view
                // We might need to inspect each container if we want to filter by label accurately
                // For now, we'll rely on image name which is safer for list operations
                
                return match;
            });
        } catch (error) {
            console.error('❌ Failed to find containers:', error);
            throw error;
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
        const envMatch = composeContent.match(/environment:\s*([\s\S]*?)(?=\s*ports:|volumes:|restart:|networks:|healthcheck:|dns:|cap_add:|$)/);
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
        const volumesMatch = composeContent.match(/volumes:\s*([\s\S]*?)(?=\s*restart:|networks:|environment:|ports:|healthcheck:|dns:|cap_add:|$)/);
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

        const imageMatch = composeContent.match(/^\s*image:\s*['"]?([^\s'"]+)['"]?/m);
        const imageName = imageMatch?.[1] || 'itzg/minecraft-server:latest';

        // Create container payload
        const containerPayload = {
            Image: imageName,
            name: serviceName,
            Env: envVars,
            ExposedPorts: exposedPorts,
            Healthcheck: {
                Test: ['CMD', 'mc-health'],
                Interval: 15_000_000_000,
                Timeout: 10_000_000_000,
                Retries: 5,
                StartPeriod: 300_000_000_000,
            },
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
     * @param tail - Number of log lines to return, or `'all'` for all retained container logs (default: 1000)
     * @param timestamps - Whether Docker should prepend RFC3339Nano timestamps (default: true)
     * @returns Promise resolving to the container logs
     */
    async getContainerLogs(containerId: string, environmentId: number | null = this.defaultEnvironmentId, tail: number | 'all' = 1000, timestamps: boolean = true): Promise<string> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to get container logs.');
        }

        const tailQuery = tail === 'all' ? 'all' : String(Math.max(1, Math.floor(tail)));

        try {
            console.log(`📄 Getting logs for container ${containerId}...`);
            const response = await this.axiosInstance.get(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/logs?stdout=1&stderr=1&tail=${tailQuery}&timestamps=${timestamps ? 1 : 0}`
            );
            return response.data;
        } catch (error) {
            // If we get a 404, it might be that the environment ID is invalid/stale.
            // We try to auto-discover a valid environment ID and retry.
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                console.warn(`Failed to get logs for container ${containerId} on environment ${environmentId} (404). Attempting to discover a valid environment...`);
                
                try {
                    const newEnvId = await this.getFirstEnvironmentId();
                    if (newEnvId !== null && newEnvId !== environmentId) {
                        console.log(`Found valid environment ${newEnvId}. Retrying getContainerLogs...`);
                        const response = await this.axiosInstance.get(
                            `/api/endpoints/${newEnvId}/docker/containers/${containerId}/logs?stdout=1&stderr=1&tail=${tailQuery}&timestamps=${timestamps ? 1 : 0}`
                        );
                        
                        // If successful, update the defaultEnvironmentId for this instance if it was using the default
                        if (this.defaultEnvironmentId === environmentId) {
                            console.log(`Updating default environment ID from ${this.defaultEnvironmentId} to ${newEnvId}`);
                            this.defaultEnvironmentId = newEnvId;
                        }
                        
                        return response.data;
                    }
                } catch (retryError) {
                    console.error('Retry with new environment ID failed:', retryError);
                }
            }

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
                let foundContainerPort = false;
                if (container.Ports) {
                    for (const port of container.Ports) {
                        if (port.PublicPort) {
                            usedPorts.push(port.PublicPort);
                            foundContainerPort = true;
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
                                    foundContainerPort = true;
                                }
                            }
                        }
                    }
                }

                const collectPortBindings = (bindings?: Record<string, Array<{ HostPort?: string }> | null>) => {
                    if (!bindings) return;
                    for (const mappings of Object.values(bindings)) {
                        for (const mapping of mappings ?? []) {
                            const hostPort = Number.parseInt(mapping.HostPort ?? '', 10);
                            if (Number.isInteger(hostPort) && hostPort > 0) usedPorts.push(hostPort);
                        }
                    }
                };

                collectPortBindings(container.HostConfig?.PortBindings);
                // Stopped/created containers omit Ports in the list response; inspect them so reserved bindings stay protected
                if (!foundContainerPort && container.State !== 'running') {
                    try {
                        const details = await this.getContainerDetails(container.Id, environmentId);
                        collectPortBindings(details.HostConfig?.PortBindings);
                    } catch {
                        // Ignore containers that vanish during inspection
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
     * Get container statistics (CPU, memory usage, network I/O)
     * @param containerId - The ID of the container
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to container statistics
     */
    async getContainerStats(containerId: string, environmentId: number | null = this.defaultEnvironmentId): Promise<{
        memory_stats: { usage: number; limit: number };
        cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number; online_cpus?: number };
        precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
        networks: Record<string, { rx_bytes: number; tx_bytes: number }>;
    } | null> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to get container stats.');
        }

        try {
            const response = await this.axiosInstance.get(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/stats?stream=false`
            );
            return response.data;
        } catch (error) {
            console.error(`❌ Failed to get container stats for ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Update container resources (CPU and memory limits)
     * @param containerId - The ID of the container to update
     * @param environmentId - The ID of the Portainer environment
     * @param resources - The resource limits to apply
     * @returns Promise resolving when resources are updated
     */
    async updateContainerResources(
        containerId: string, 
        environmentId: number | null = this.defaultEnvironmentId,
        resources: {
            cpuQuota?: number; // CPU quota in microseconds per CPU period
            cpuPeriod?: number; // CPU period in microseconds 
            memory?: number;   // Memory limit in bytes
        }
    ): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to update container resources.');
        }

        try {
            console.log(`🔧 Updating resources for container ${containerId}...`);
            
            // Get current container configuration
            const containerInfo = await this.axiosInstance.get(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/json`
            );

            const updateConfig = {
                Memory: resources.memory || containerInfo.data.HostConfig.Memory,
                CpuQuota: resources.cpuQuota || containerInfo.data.HostConfig.CpuQuota,
                CpuPeriod: resources.cpuPeriod || containerInfo.data.HostConfig.CpuPeriod,
                // Preserve other existing configurations
                RestartPolicy: containerInfo.data.HostConfig.RestartPolicy,
            };

            await this.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/update`,
                updateConfig
            );

            console.log(`✅ Container resources updated successfully`);
        } catch (error) {
            console.error(`❌ Failed to update container resources for ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Exit code of a finished exec instance. Docker only reports it when asked, so without this every command
     * looked successful. Unknown (the inspect call failed) is reported as 0 as before.
     */
    private async getExecExitCode(execId: string, environmentId: number): Promise<number> {
        try {
            const inspect = await this.axiosInstance.get(`/api/endpoints/${environmentId}/docker/exec/${execId}/json`);
            const code = inspect.data?.ExitCode;
            return typeof code === 'number' ? code : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Execute a command in a running container
     * @param containerId - The ID of the container
     * @param command - The command to execute
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to command execution result
     */
    async executeCommand(
        containerId: string, 
        command: string, 
        environmentId: number | null = this.defaultEnvironmentId
    ): Promise<{ output: string; exitCode: number }> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to execute command.');
        }

        try {
            // Create exec instance
            const execResponse = await this.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/exec`,
                {
                    AttachStdout: true,
                    AttachStderr: true,
                    Cmd: ["/bin/sh", "-c", command]
                }
            );

            const execId = execResponse.data.Id;

            // Start the exec instance
            const startResponse = await this.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/exec/${execId}/start`,
                {
                    Detach: false,
                    Tty: false
                }
            );

            return {
                output: startResponse.data,
                exitCode: await this.getExecExitCode(execId, environmentId)
            };
        } catch (error) {
            // If we get a 404, it might be that the environment ID is invalid/stale.
            // We try to auto-discover a valid environment ID and retry.
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                console.warn(`Failed to execute command in container ${containerId} on environment ${environmentId} (404). Attempting to discover a valid environment...`);
                
                try {
                    const newEnvId = await this.getFirstEnvironmentId();
                    if (newEnvId !== null && newEnvId !== environmentId) {
                        console.log(`Found valid environment ${newEnvId}. Retrying executeCommand...`);
                        
                        // Create exec instance
                        const execResponse = await this.axiosInstance.post(
                            `/api/endpoints/${newEnvId}/docker/containers/${containerId}/exec`,
                            {
                                AttachStdout: true,
                                AttachStderr: true,
                                Cmd: ["/bin/sh", "-c", command]
                            }
                        );

                        const execId = execResponse.data.Id;

                        // Start the exec instance
                        const startResponse = await this.axiosInstance.post(
                            `/api/endpoints/${newEnvId}/docker/exec/${execId}/start`,
                            {
                                Detach: false,
                                Tty: false
                            }
                        );
                        
                        // If successful, update the defaultEnvironmentId for this instance if it was using the default
                        if (this.defaultEnvironmentId === environmentId) {
                            console.log(`Updating default environment ID from ${this.defaultEnvironmentId} to ${newEnvId}`);
                            this.defaultEnvironmentId = newEnvId;
                        }

                        return {
                            output: startResponse.data,
                            exitCode: await this.getExecExitCode(execId, newEnvId)
                        };
                    }
                } catch (retryError) {
                    console.error('Retry with new environment ID failed:', retryError);
                }
            }

            console.error(`❌ Failed to execute command in container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Writes a command line into a running container's standard input via Docker attach (`stdin=1&stream=1`),
     * which delivers input even when the container runs with `tty: true` or lacks `mc-send-to-console`.
     */
    async sendContainerInput(
        containerId: string,
        command: string,
        environmentId: number | null = this.defaultEnvironmentId
    ): Promise<{ sent: boolean; error?: string }> {
        if (environmentId === null) {
            return { sent: false, error: 'Environment ID is required to attach container stdin.' };
        }

        // Skip unreachable placeholder URL quickly (for example in offline unit tests)
        if (/your-portainer-instance\.com/i.test(this.portainerUrl)) {
            const directOnly = await sendDirectContainerInput(environmentId, containerId, command, async () => undefined).catch(() => false);
            return directOnly
                ? { sent: true }
                : { sent: false, error: 'Portainer is not configured for container attach.' };
        }

        try {
            const inspect = await this.axiosInstance.get<{ State?: { Running?: boolean }; Config?: { OpenStdin?: boolean } }>(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/json`,
                { timeout: 4_000 }
            );
            if (inspect.data?.State?.Running !== true) {
                return { sent: false, error: 'Container is not running.' };
            }
            if (inspect.data?.Config?.OpenStdin !== true) {
                return { sent: false, error: 'The proxy has no console input (stdin_open: true is off).' };
            }
        } catch (error) {
            return { sent: false, error: error instanceof Error ? error.message : 'Could not inspect container' };
        }

        try {
            const sentDirect = await sendDirectContainerInput(environmentId, containerId, command, async () => {
                const info = await this.axiosInstance.get<{ ID?: string }>(`/api/endpoints/${environmentId}/docker/info`, { timeout: 4_000 });
                return info.data?.ID;
            });
            if (sentDirect) return { sent: true };
        } catch {
            // Fall through to Portainer WebSocket attach
        }

        try {
            if (!this.apiKey && !this.authToken && this.username && this.password) {
                await this.authenticate();
            }
            const parsed = new URL(`${this.portainerUrl}/api/websocket/attach`);
            parsed.searchParams.set('endpointId', String(environmentId));
            parsed.searchParams.set('id', containerId);
            if (!this.apiKey && this.authToken) {
                parsed.searchParams.set('token', this.authToken);
            }
            const isHttps = parsed.protocol === 'https:';
            const rejectUnauthorized = process.env.PORTAINER_REJECT_UNAUTHORIZED === 'false'
                ? false
                : (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) ? false : true;
            const payload = Buffer.from(command.endsWith('\n') ? command : `${command}\n`, 'utf-8');
            const headers: Record<string, string> = {
                Connection: 'Upgrade',
                Upgrade: 'websocket',
                'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
                'Sec-WebSocket-Version': '13',
            };
            if (this.apiKey) headers['X-API-Key'] = this.apiKey;
            else if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

            const buildWsTextFrame = (data: Buffer): Buffer => {
                const mask = crypto.randomBytes(4);
                const len = data.length;
                const headerLen = len < 126 ? 2 : 4;
                const frame = Buffer.alloc(headerLen + 4 + len);
                frame[0] = 0x81; // FIN + text frame
                if (len < 126) {
                    frame[1] = 0x80 | len;
                } else {
                    frame[1] = 0x80 | 126;
                    frame.writeUInt16BE(len, 2);
                }
                mask.copy(frame, headerLen);
                for (let i = 0; i < len; i++) {
                    frame[headerLen + 4 + i] = data[i] ^ mask[i % 4];
                }
                return frame;
            };

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const done = (error?: Error) => {
                    if (settled) return;
                    settled = true;
                    if (error) reject(error);
                    else resolve();
                };
                const transport = isHttps ? https : http;
                const req = transport.request({
                    hostname: parsed.hostname,
                    port: parsed.port || (isHttps ? 443 : 80),
                    path: `${parsed.pathname}${parsed.search}`,
                    method: 'GET',
                    headers,
                    timeout: 4_000,
                    ...(isHttps ? { rejectUnauthorized } : {}),
                });
                req.on('upgrade', (_res, socket) => {
                    socket.setTimeout(4_000, () => { socket.destroy(); done(new Error('Portainer WebSocket attach timed out')); });
                    socket.on('error', err => done(err));
                    socket.write(buildWsTextFrame(payload), err => {
                        if (err) {
                            socket.destroy();
                            return done(err);
                        }
                        setTimeout(() => {
                            const closeFrame = Buffer.concat([Buffer.from([0x88, 0x80]), crypto.randomBytes(4)]);
                            socket.end(closeFrame);
                            done();
                        }, 150);
                    });
                });
                req.on('response', response => {
                    response.resume();
                    done(new Error(`Portainer WebSocket attach returned status ${response.statusCode ?? 0}`));
                });
                req.on('timeout', () => req.destroy(new Error('Portainer WebSocket attach timed out')));
                req.on('error', err => done(err));
                req.end();
            });
            return { sent: true };
        } catch (error) {
            return { sent: false, error: error instanceof Error ? error.message : 'Container attach failed' };
        }
    }

    /**
     * Get a tar archive of a path in the filesystem of a container.
     * @param containerId - The ID of the container
     * @param path - The path to the file or directory to archive
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the archive stream
     */
    async getContainerArchive(
        containerId: string,
        path: string,
        environmentId: number | null = this.defaultEnvironmentId
    ): Promise<NodeJS.ReadableStream> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to get container archive.');
        }

        try {
            const response = await this.axiosInstance.get(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/archive`,
                {
                    params: { path },
                    responseType: 'stream'
                }
            );
            return response.data;
        } catch (error) {
            console.error(`❌ Failed to get archive from container ${containerId}:`, error);
            throw error;
        }
    }

    /**
     * Get Minecraft server info via server.properties and status query
     * This is a simpler, more reliable method for getting basic server info
     */
    async getMinecraftServerInfo(
        containerId: string,
        environmentId: number | null = this.defaultEnvironmentId
    ): Promise<{ maxPlayers: number; serverName?: string; error?: string }> {
        try {
            // Try to read server.properties from the container
            const serverPropsResult = await this.executeCommand(
                containerId,
                'cat /minecraft/server.properties 2>/dev/null || echo "not found"',
                environmentId
            );
            
            let maxPlayers = 20; // default
            let serverName = 'Minecraft Server';
            
            if (serverPropsResult.output && !serverPropsResult.output.includes('not found')) {
                // Extract max-players from server.properties
                const maxPlayersMatch = serverPropsResult.output.match(/max-players=(\d+)/);
                if (maxPlayersMatch) {
                    maxPlayers = parseInt(maxPlayersMatch[1]);
                }
                
                // Extract server name
                const serverNameMatch = serverPropsResult.output.match(/server-name=(.+)/);
                if (serverNameMatch) {
                    serverName = serverNameMatch[1].trim();
                }
            }
            
            return {
                maxPlayers,
                serverName
            };
        } catch (error) {
            console.error(`❌ Failed to get server info for container ${containerId}:`, error);
            return {
                maxPlayers: 20,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get Minecraft server player count via RCON or server query
     * @param containerId - The ID of the container
     * @param environmentId - The ID of the Portainer environment
     * @param rconPort - RCON port if available
     * @param rconPassword - RCON password if available
     * @returns Promise resolving to player count information
     */
    async getMinecraftServerPlayerCount(
        containerId: string, 
        environmentId: number | null = this.defaultEnvironmentId,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _rconPort?: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _rconPassword?: string
    ): Promise<{ playersOnline: number; maxPlayers: number; playerList?: string[]; error?: string }> {
        try {
            console.log(`🔍 Getting player count for container ${containerId}...`);
            
            // Get more comprehensive logs for better analysis
            const logs = await this.getContainerLogs(containerId, environmentId, 500);
            
            // Method 1: Look for explicit player count messages
            // These are the most reliable when they exist
            const exactCountMatches = [
                /There are (\d+) of a max of (\d+) players online/gi,
                /(\d+) of (\d+) players online/gi,
                /Players online: (\d+)\/(\d+)/gi,
                /Current players: (\d+) \/ (\d+)/gi
            ];
            
            for (const pattern of exactCountMatches) {
                const matches = logs.match(pattern);
                if (matches && matches.length > 0) {
                    const lastMatch = matches[matches.length - 1];
                    const numbers = lastMatch.match(/(\d+)/g);
                    if (numbers && numbers.length >= 2) {
                        console.log(`✅ Found exact player count: ${numbers[0]}/${numbers[1]}`);
                        return {
                            playersOnline: parseInt(numbers[0]),
                            maxPlayers: parseInt(numbers[1])
                        };
                    }
                }
            }
            
            // Method 2: Get max players from server configuration
            const maxPlayersPatterns = [
                /max-players=(\d+)/g,
                /Maximum players: (\d+)/gi,
                /Player limit: (\d+)/gi
            ];
            
            let maxPlayers = 20; // default
            for (const pattern of maxPlayersPatterns) {
                const matches = logs.match(pattern);
                if (matches && matches.length > 0) {
                    const lastMatch = matches[matches.length - 1];
                    const number = lastMatch.match(/(\d+)/);
                    if (number) {
                        maxPlayers = parseInt(number[1]);
                        break;
                    }
                }
            }
            
            // Method 3: Analyze player activity in recent logs (improved algorithm)
            // Focus on the most recent 100 lines for current activity
            const recentLogLines = logs.split('\n').slice(-100);
            const playerTracker = new Map<string, { joined: boolean; lastSeen: number }>();
            
            // Process each log line to track player activity
            recentLogLines.forEach((line, index) => {
                // Player joined
                const joinMatch = line.match(/(\w+) joined the game/);
                if (joinMatch) {
                    const playerName = joinMatch[1];
                    playerTracker.set(playerName, { joined: true, lastSeen: index });
                }
                
                // Player left
                const leaveMatch = line.match(/(\w+) left the game/);
                if (leaveMatch) {
                    const playerName = leaveMatch[1];
                    const player = playerTracker.get(playerName);
                    if (player) {
                        player.joined = false;
                        player.lastSeen = index;
                    } else {
                        playerTracker.set(playerName, { joined: false, lastSeen: index });
                    }
                }
                
                // Player chat activity (indicates active presence)
                const chatMatch = line.match(/<(\w+)>/);
                if (chatMatch) {
                    const playerName = chatMatch[1];
                    const player = playerTracker.get(playerName);
                    if (player) {
                        player.joined = true; // Chat indicates player is online
                        player.lastSeen = index;
                    } else {
                        playerTracker.set(playerName, { joined: true, lastSeen: index });
                    }
                }
                
                // Player commands or achievements
                const commandMatch = line.match(/\[(\w+): /);
                if (commandMatch) {
                    const playerName = commandMatch[1];
                    if (playerName !== 'Server' && playerName !== 'RCON') {
                        const player = playerTracker.get(playerName);
                        if (player) {
                            player.joined = true;
                            player.lastSeen = index;
                        } else {
                            playerTracker.set(playerName, { joined: true, lastSeen: index });
                        }
                    }
                }
            });
            
            // Count currently online players
            const currentPlayers = Array.from(playerTracker.entries())
                .filter(([, info]) => info.joined)
                .map(([name]) => name);
            
            const playersOnline = currentPlayers.length;
            
            console.log(`📊 Player analysis: ${playersOnline}/${maxPlayers} (tracked: ${Array.from(playerTracker.keys()).join(', ') || 'none'})`);
            
            return {
                playersOnline: playersOnline,
                maxPlayers: maxPlayers,
                playerList: currentPlayers
            };
            
        } catch (error) {
            console.error(`❌ Failed to get player count for container ${containerId}:`, error);
            return {
                playersOnline: 0,
                maxPlayers: 20,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
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
     * Makes sure a Docker network exists, creating a bridge network when it does not.
     * Proxy stacks declare their network as external so several stacks can share it.
     */
    async ensureNetwork(networkName: string, environmentId: number | null = this.defaultEnvironmentId): Promise<'created' | 'exists'> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to create a network.');
        }
        const existing = await this.axiosInstance.get<Array<{ Name: string }>>(`/api/endpoints/${environmentId}/docker/networks`);
        if (Array.isArray(existing.data) && existing.data.some(network => network.Name === networkName)) return 'exists';
        await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/networks/create`, { Name: networkName, Driver: 'bridge', CheckDuplicate: true });
        return 'created';
    }

    /**
     * Connects a running or stopped container to a Docker network, so it can be reached by name from the other
     * containers on that network. Does nothing when it is connected already.
     */
    async connectContainerToNetwork(containerId: string, networkName: string, environmentId: number | null = this.defaultEnvironmentId): Promise<'connected' | 'already'> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to connect a container to a network.');
        }
        try {
            await this.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/networks/${encodeURIComponent(networkName)}/connect`,
                { Container: containerId }
            );
            return 'connected';
        } catch (error) {
            const message = JSON.stringify((error as { response?: { data?: unknown } })?.response?.data ?? '');
            if (/already exists in network|already connected/i.test(message)) return 'already';
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
            // If no environment ID is provided and no default is set, try to get the first one
            if (environmentId === null) {
                console.log('No environment ID provided, attempting to fetch first available environment...');
                environmentId = await this.getFirstEnvironmentId();
                if (environmentId === null) {
                    throw new Error('No Portainer environments found. Cannot fetch containers.');
                }
                console.log(`Using environment ID: ${environmentId}`);
            }

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

    /**
     * Update a stack with new compose file content
     * @param stackId - The ID of the stack to update
     * @param composeContent - The new docker-compose content
     * @param environmentId - The ID of the Portainer environment
     * @param pullImage - Whether to pull the latest image (default: true)
     * @returns Promise resolving when stack is updated
     */
    async updateStack(
        stackId: number, 
        composeContent: string, 
        environmentId: number | null = this.defaultEnvironmentId,
        pullImage: boolean = true
    ): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to update a stack.');
        }

        try {
            console.log(`🔄 Updating stack ${stackId}...`);
            await this.axiosInstance.put(
                `/api/stacks/${stackId}?endpointId=${environmentId}`,
                {
                    StackFileContent: composeContent,
                    Prune: false,
                    PullImage: pullImage
                }
            );
            console.log('✅ Stack updated successfully');
        } catch (error) {
            console.error(`❌ Failed to update stack ${stackId}:`, error);
            throw error;
        }
    }

    /**
     * Redeploy a stack (stop, pull image, start)
     * @param stackId - The ID of the stack to redeploy
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving when stack is redeployed
     */
    async redeployStack(stackId: number, environmentId: number | null = this.defaultEnvironmentId): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to redeploy a stack.');
        }

        try {
            console.log(`🔄 Redeploying stack ${stackId}...`);
            
            // Get current stack details
            const stacks = await this.getStacks();
            const stack = stacks.find(s => s.Id === stackId);
            
            if (!stack) {
                throw new Error(`Stack ${stackId} not found`);
            }

            // Stop the stack first
            try {
                await this.stopStack(stackId, environmentId);
            } catch (e) {
                console.warn('Stack may already be stopped:', e);
            }

            // Wait a moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Start the stack (this will pull the latest image if configured)
            await this.startStack(stackId, environmentId);
            
            console.log('✅ Stack redeployed successfully');
        } catch (error) {
            console.error(`❌ Failed to redeploy stack ${stackId}:`, error);
            throw error;
        }
    }

    /**
     * Pull the latest image for a container
     * @param imageName - The name of the image to pull
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving when image is pulled
     */
    async pullImage(imageName: string, environmentId: number | null = this.defaultEnvironmentId): Promise<void> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to pull an image.');
        }

        try {
            console.log(`📥 Pulling image ${imageName}...`);
            await this.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/images/create?fromImage=${encodeURIComponent(imageName)}`
            );
            console.log('✅ Image pulled successfully');
        } catch (error) {
            console.error(`❌ Failed to pull image ${imageName}:`, error);
            throw error;
        }
    }

    /**
     * Metadata (RepoTags, RepoDigests) of a local image by id or tag, or null when missing.
     */
    async getImageDetails(
        imageIdOrName: string,
        environmentId: number | null = this.defaultEnvironmentId
    ): Promise<{ Id?: string; RepoTags?: string[]; RepoDigests?: string[] } | null> {
        if (environmentId === null) return null;
        try {
            const response = await this.axiosInstance.get<{ Id?: string; RepoTags?: string[]; RepoDigests?: string[] }>(
                `/api/endpoints/${environmentId}/docker/images/${encodeURIComponent(imageIdOrName)}/json`
            );
            return response.data ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Manifest digest reported by the remote registry for an image tag without downloading layers,
     * or null when the registry could not be queried.
     */
    async getDistributionDigest(
        imageName: string,
        environmentId: number | null = this.defaultEnvironmentId
    ): Promise<string | null> {
        if (environmentId === null) return null;
        try {
            const imagePath = imageName.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const response = await this.axiosInstance.get<{ Descriptor?: { digest?: string } }>(
                `/api/endpoints/${environmentId}/docker/distribution/${imagePath}/json`,
                { timeout: 10_000 }
            );
            return response.data?.Descriptor?.digest ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Id of a local image (for example `itzg/minecraft-server:java21`), or null when it is not on the host.
     */
    async getImageId(imageName: string, environmentId: number | null = this.defaultEnvironmentId): Promise<string | null> {
        if (environmentId === null) return null;
        try {
            const response = await this.axiosInstance.get<{ Id?: string }>(`/api/endpoints/${environmentId}/docker/images/${imageName}/json`);
            return response.data.Id ?? null;
        } catch {
            return null;
        }
    }

    /**
     * What a container did since it was created: how often Docker restarted it, its state and how it last exited.
     */
    async getRestartState(containerId: string, environmentId: number | null = this.defaultEnvironmentId): Promise<{
        restartCount: number; status: string; restarting: boolean; exitCode: number; running: boolean;
    }> {
        if (environmentId === null) throw new Error('Environment ID is required to inspect a container.');
        const response = await this.axiosInstance.get<{
            RestartCount?: number;
            State?: { Status?: string; Restarting?: boolean; ExitCode?: number; Running?: boolean };
        }>(`/api/endpoints/${environmentId}/docker/containers/${containerId}/json`);
        return {
            restartCount: response.data.RestartCount ?? 0,
            status: response.data.State?.Status ?? 'unknown',
            restarting: response.data.State?.Restarting === true,
            exitCode: response.data.State?.ExitCode ?? 0,
            running: response.data.State?.Running === true,
        };
    }

    /**
     * Changes what Docker does when the container exits: `no`, `unless-stopped`, `always` or `on-failure`.
     */
    async setRestartPolicy(containerId: string, policy: 'no' | 'unless-stopped' | 'always' | 'on-failure', environmentId: number | null = this.defaultEnvironmentId): Promise<void> {
        if (environmentId === null) throw new Error('Environment ID is required to change a restart policy.');
        await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/update`, { RestartPolicy: { Name: policy } });
    }

    /**
     * Get the Portainer websocket URL for container console access
     * @param containerId - The ID of the container
     * @param environmentId - The ID of the Portainer environment
     * @returns The websocket URL for console access
     */
    getConsoleWebsocketUrl(containerId: string, environmentId: number | null = this.defaultEnvironmentId): string {
        if (environmentId === null) {
            throw new Error('Environment ID is required for console access.');
        }

        const baseUrl = this.portainerUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        return `${baseUrl}/api/websocket/exec?endpointId=${environmentId}&id=${containerId}`;
    }

    /**
     * Get stack by ID
     * @param stackId - The ID of the stack
     * @returns Promise resolving to the stack or null
     */
    async getStackById(stackId: number): Promise<PortainerStack | null> {
        try {
            const response = await this.axiosInstance.get(`/api/stacks/${stackId}`);
            return response.data;
        } catch (error) {
            console.error(`Error getting stack ${stackId}:`, error);
            return null;
        }
    }

    /**
     * Get stack file content
     * @param stackId - The ID of the stack
     * @returns Promise resolving to the compose file content
     */
    async getStackFileContent(stackId: number): Promise<string> {
        try {
            const response = await this.axiosInstance.get(`/api/stacks/${stackId}/file`);
            return response.data.StackFileContent || '';
        } catch (error) {
            console.error(`Error getting stack file for ${stackId}:`, error);
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
        },
    process.env.PORTAINER_ENV_ID ? parseInt(process.env.PORTAINER_ENV_ID) : null
);

export default portainer;