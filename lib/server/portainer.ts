import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { config } from 'dotenv';

// Load environment variables if not already loaded
if (!process.env.PORTAINER_URL) {
    config({ path: '.env.local' });
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
    constructor(portainerUrl: string, auth: string | {username: string, password: string}, defaultEnvironmentId: number | null = null) {
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
     * Fetches a list of all Portainer environments (endpoints).
     * @returns {Promise<PortainerEnvironment[]>} A promise that resolves to an array of environment objects.
     */
    async getEnvironments(): Promise<PortainerEnvironment[]> {
        try {
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

        // Method 1: Try the standard Portainer stack creation with compose string
        try {
            console.log('📋 Method 1: Standard stack creation with compose string...');
            
            const payload = {
                Name: stackName,
                ComposeFile: composeContent,
                Env: [],
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
            
            // Method 2: Try alternative stack creation endpoint
            try {
                console.log('📋 Method 2: Alternative stack creation endpoint...');
                
                const payload = {
                    Name: stackName,
                    StackFileContent: composeContent,
                    Env: []
                };
                
                const response = await this.axiosInstance.post(
                    `/api/stacks/create/compose/string?type=2&endpointId=${environmentId}`,
                    payload
                );
                
                console.log('✅ Method 2 Success! Stack created with alternative endpoint');
                console.log('📥 Response:', JSON.stringify(response.data, null, 2));
                return response.data;
                
            } catch (method2Error) {
                console.error('❌ Method 2 failed:', method2Error);
                
                // Method 3: Try with body parameters instead of query parameters
                try {
                    console.log('📋 Method 3: Body parameters approach...');
                    
                    const payload = {
                        Name: stackName,
                        StackFileContent: composeContent,
                        EndpointId: environmentId,
                        Type: 2, // Docker Compose
                        Method: 'string',
                        Env: []
                    };
                    
                    const response = await this.axiosInstance.post('/api/stacks', payload);
                    
                    console.log('✅ Method 3 Success! Stack created with body parameters');
                    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
                    return response.data;
                    
                } catch (method3Error) {
                    console.error('❌ Method 3 failed:', method3Error);
                    
                    // Method 4: Try with multipart form data approach (simulate file upload)
                    try {
                        console.log('📋 Method 4: Multipart form data approach...');
                        
                        // Create a form-like payload for file-based stack creation
                        const boundary = '----formdata-' + Math.random().toString(36);
                        const formData = [
                            `--${boundary}`,
                            'Content-Disposition: form-data; name="Name"',
                            '',
                            stackName,
                            `--${boundary}`,
                            'Content-Disposition: form-data; name="StackFileContent"',
                            '',
                            composeContent,
                            `--${boundary}`,
                            'Content-Disposition: form-data; name="EndpointId"',
                            '',
                            environmentId.toString(),
                            `--${boundary}`,
                            'Content-Disposition: form-data; name="Type"',
                            '',
                            '2',
                            `--${boundary}`,
                            'Content-Disposition: form-data; name="Method"',
                            '',
                            'string',
                            `--${boundary}--`
                        ].join('\r\n');
                        
                        const response = await this.axiosInstance.post('/api/stacks', formData, {
                            headers: {
                                'Content-Type': `multipart/form-data; boundary=${boundary}`
                            }
                        });
                        
                        console.log('✅ Method 4 Success! Stack created with multipart form data');
                        console.log('📥 Response:', JSON.stringify(response.data, null, 2));
                        return response.data;
                        
                    } catch (method4Error) {
                        console.error('❌ Method 4 failed:', method4Error);
                        
                        // Method 5: Direct container creation (most reliable fallback)
                        try {
                            console.log('📋 Method 5: Direct container creation...');
                            
                            // Parse Docker Compose to extract container configuration
                            const serviceName = stackName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                            
                            // Extract environment variables from compose content
                            const envVars: string[] = [];
                            const envMatch = composeContent.match(/environment:\s*([\s\S]*?)(?=\s*ports:|$)/);
                            if (envMatch) {
                                const envSection = envMatch[1];
                                const envLines = envSection.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
                                
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
                            const portBindings: Record<string, Array<{HostPort: string}>> = {};
                            const exposedPorts: Record<string, object> = {};
                            const portsMatch = composeContent.match(/ports:\s*([\s\S]*?)(?=\s*volumes:|restart:|networks:|$)/);
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
                            const volumesMatch = composeContent.match(/volumes:\s*([\s\S]*?)(?=\s*restart:|networks:|environment:|$)/);
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
                            
                            console.log(`📦 Creating container with:`);
                            console.log(`   Name: ${serviceName}`);
                            console.log(`   Environment variables: ${envVars.length} vars`);
                            console.log(`   Port bindings:`, portBindings);
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
                            
                            console.log('📤 Creating container with payload:', JSON.stringify(containerPayload, null, 2));
                            
                            const response = await this.axiosInstance.post(
                                `/api/endpoints/${environmentId}/docker/containers/create?name=${serviceName}`,
                                containerPayload
                            );
                            
                            console.log('✅ Container created successfully!');
                            console.log('📥 Container ID:', response.data.Id);
                            
                            // Start the container
                            const containerId = response.data.Id;
                            console.log('▶️ Starting container...');
                            await this.axiosInstance.post(`/api/endpoints/${environmentId}/docker/containers/${containerId}/start`);
                            
                            console.log('🎉 Container started successfully!');
                            return { 
                                Id: containerId, 
                                Name: serviceName,
                                method: 'direct-container',
                                containerCreated: true 
                            };
                            
                        } catch (method5Error) {
                            console.error('❌ Method 5 failed:', method5Error);
                            
                            // Final attempt: Log all errors and throw the most informative one
                            const errors = {
                                method1: method1Error instanceof Error ? method1Error.message : 'Unknown error',
                                method2: method2Error instanceof Error ? method2Error.message : 'Unknown error',
                                method3: method3Error instanceof Error ? method3Error.message : 'Unknown error',
                                method4: method4Error instanceof Error ? method4Error.message : 'Unknown error',
                                method5: method5Error instanceof Error ? method5Error.message : 'Unknown error'
                            };
                            
                            console.error('🚨 All stack creation methods failed:', errors);
                            
                            // Check if this is an authentication or permission issue
                            const method1AxiosError = method1Error as { response?: { status?: number, data?: unknown } };
                            if (method1AxiosError?.response?.status === 403) {
                                throw new Error('Permission denied: Check if the user has sufficient permissions to create stacks in Portainer');
                            }
                            if (method1AxiosError?.response?.status === 401) {
                                throw new Error('Authentication failed: Check Portainer credentials and ensure the user is logged in');
                            }
                            if (method1AxiosError?.response?.status === 405) {
                                throw new Error('Method not allowed: This Portainer version may not support stack creation via API');
                            }
                            
                            throw new Error(`Failed to create stack after trying 5 different methods. First error: ${errors.method1}`);
                        }
                    }
                }
            }
        }
    }

    /**
     * Alternative Portainer deployment - try Docker service creation instead of stacks
     */
    async deployToPortainerService(stackData: Record<string, unknown>, environmentId: number): Promise<Record<string, unknown>> {
        try {
            console.log('Trying Portainer service creation as alternative to stacks...');
            
            // Extract service configuration from stack data
            const serviceName = stackData.Name as string;
            
            // Parse the compose content to extract service definition
            const serviceConfig = {
                Name: serviceName,
                TaskTemplate: {
                    ContainerSpec: {
                        Image: 'itzg/minecraft-server:latest',
                        Env: (stackData.Env as Array<{name: string, value: string}>)?.map(env => `${env.name}=${env.value}`) || []
                    }
                },
                Mode: {
                    Replicated: {
                        Replicas: 1
                    }
                }
            };
            
            const response = await this.axiosInstance.post(
                `/api/endpoints/${environmentId}/docker/services/create`,
                serviceConfig
            );
            
            console.log('Service created successfully with Portainer service API');
            return response.data;
        } catch (error) {
            console.error('Failed to create service via Portainer service API:', error);
            throw error;
        }
    }

    /**
     * Start a stack in Portainer
     * @param stackId - The ID of the stack to start
     * @returns Promise resolving to the start operation result
     */
    async startStack(stackId: number): Promise<Record<string, unknown>> {
        try {
            const response = await this.axiosInstance.post(`/api/stacks/${stackId}/start`);
            return response.data;
        } catch (error) {
            console.error(`Failed to start stack ${stackId}:`, error);
            throw error;
        }
    }

    /**
     * Stop a stack in Portainer
     * @param stackId - The ID of the stack to stop
     * @returns Promise resolving to the stop operation result
     */
    async stopStack(stackId: number): Promise<Record<string, unknown>> {
        try {
            const response = await this.axiosInstance.post(`/api/stacks/${stackId}/stop`);
            return response.data;
        } catch (error) {
            console.error(`Failed to stop stack ${stackId}:`, error);
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
            const response = await this.axiosInstance.delete(
                `/api/stacks/${stackId}?external=false&endpointId=${environmentId}`
            );
            return response.data;
        } catch (error) {
            console.error(`Failed to delete stack ${stackId}:`, error);
            throw error;
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
            const response = await this.axiosInstance.get(
                `/api/endpoints/${environmentId}/docker/containers/${containerId}/logs?stdout=1&stderr=1&tail=${tail}`
            );
            return response.data;
        } catch (error) {
            console.error(`Failed to get logs for container ${containerId}:`, error);
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
            throw new Error('Environment ID is required to fetch used ports.');
        }
        try {
            const containers = await this.getContainers(environmentId, true);
            const usedPorts: number[] = [];
            
            for (const container of containers) {
                // Check ports from container list (faster method)
                if (container.Ports && Array.isArray(container.Ports)) {
                    for (const portMapping of container.Ports) {
                        if (portMapping.PublicPort && portMapping.PublicPort >= 25565 && portMapping.PublicPort <= 25595) {
                            usedPorts.push(portMapping.PublicPort);
                        }
                    }
                }
                
                // Fallback: Check detailed container information if needed
                try {
                    const containerDetails = await this.getContainerDetails(container.Id, environmentId);
                    
                    if (containerDetails?.NetworkSettings?.Ports) {
                        for (const [, hostBindings] of Object.entries(containerDetails.NetworkSettings.Ports)) {
                            if (hostBindings && Array.isArray(hostBindings)) {
                                for (const binding of hostBindings) {
                                    if (binding.HostPort) {
                                        const hostPort = parseInt(binding.HostPort, 10);
                                        if (!isNaN(hostPort) && hostPort >= 25565 && hostPort <= 25595) {
                                            usedPorts.push(hostPort);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (detailError) {
                    // If we can't get detailed info, continue with basic port info
                    console.warn(`Could not get detailed port info for container ${container.Id}:`, detailError);
                }
            }
            
            return [...new Set(usedPorts)]; // Remove duplicates
        } catch (error) {
            console.error(`Failed to fetch used ports for environment ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Get Portainer system information (including version)
     * @returns Promise resolving to system information
     */
    async getSystemInfo(): Promise<Record<string, unknown>> {
        try {
            const response = await this.axiosInstance.get('/api/system/info');
            return response.data;
        } catch (error) {
            console.error('Failed to get system info:', error);
            throw error;
        }
    }

    /**
     * Test Portainer API connectivity and version
     * @returns Promise resolving to connectivity test result
     */
    async testApiConnectivity(): Promise<{ success: boolean; version?: string; error?: string }> {
        try {
            await this.axiosInstance.get('/api/status');
            const systemInfo = await this.getSystemInfo();
            return {
                success: true,
                version: systemInfo.ServerVersion as string || 'Unknown'
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get a specific stack by name
     * @param stackName - The name of the stack to find
     * @returns Promise resolving to the stack data or null if not found
     */
    async getStackByName(stackName: string): Promise<PortainerStack | null> {
        try {
            const stacks = await this.getStacks();
            const stack = stacks.find(s => s.Name === stackName);
            return stack || null;
        } catch (error) {
            console.error('Failed to get stack by name:', error);
            return null;
        }
    }

    /**
     * Verify that a stack was created successfully
     * @param stackName - The name of the stack to verify
     * @param maxWaitTime - Maximum time to wait for stack to appear (in milliseconds)
     * @returns Promise resolving to true if stack exists, false otherwise
     */
    async verifyStackCreation(stackName: string, maxWaitTime: number = 10000): Promise<boolean> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            const stack = await this.getStackByName(stackName);
            if (stack) {
                console.log(`✅ Stack "${stackName}" verified successfully (ID: ${stack.Id})`);
                return true;
            }
            
            // Wait 1 second before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.error(`❌ Stack "${stackName}" not found after ${maxWaitTime}ms`);
        return false;
    }

    /**
     * Get a specific container by name
     * @param containerName - The name of the container to find
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the container data or null if not found
     */
    async getContainerByName(containerName: string, environmentId: number | null = this.defaultEnvironmentId): Promise<PortainerContainer | null> {
        try {
            if (environmentId === null) {
                throw new Error('Environment ID is required to get container by name.');
            }
            
            const containers = await this.getContainers(environmentId);
            const container = containers.find(c => 
                c.Names.some(name => name.includes(containerName)) ||
                c.Names.some(name => name === `/${containerName}`) // Docker adds leading slash
            );
            return container || null;
        } catch (error) {
            console.error('Failed to get container by name:', error);
            return null;
        }
    }

    /**
     * Verify that a container was created successfully
     * @param containerName - The name of the container to verify
     * @param environmentId - The ID of the Portainer environment
     * @param maxWaitTime - Maximum time to wait for container to appear (in milliseconds)
     * @returns Promise resolving to true if container exists, false otherwise
     */
    async verifyContainerCreation(containerName: string, environmentId: number, maxWaitTime: number = 10000): Promise<boolean> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            const container = await this.getContainerByName(containerName, environmentId);
            if (container) {
                console.log(`✅ Container "${containerName}" verified successfully (ID: ${container.Id})`);
                return true;
            }
            
            // Wait 1 second before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.error(`❌ Container "${containerName}" not found after ${maxWaitTime}ms`);
        return false;
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