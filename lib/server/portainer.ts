import axios, { AxiosInstance } from 'axios';
import https from 'https';

// Basic interfaces for Portainer API objects.
// You can expand these with more properties as needed.
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
}

export interface PortainerImage {
    Id: string;
    RepoTags: string[];
    Created: number;
    Size: number;
}

class PortainerApiClient {
    private portainerUrl: string;
    private apiKey: string;
    private defaultEnvironmentId: number | null;
    public axiosInstance: AxiosInstance;

    /**
     * @param portainerUrl - The base URL of your Portainer instance
     * @param apiKey - Your Portainer API key (e.g., 'ptr_your_generated_api_key_here').
     * @param defaultEnvironmentId - Optional: A default environment ID to use for environment-specific calls.
     */
    constructor(portainerUrl: string, apiKey: string, defaultEnvironmentId: number | null = null) {
        if (!portainerUrl || !apiKey) {
            throw new Error('Portainer URL and API Key are required.');
        }

        this.portainerUrl = portainerUrl.endsWith('/') ? portainerUrl.slice(0, -1) : portainerUrl;
        this.apiKey = apiKey;
        this.defaultEnvironmentId = defaultEnvironmentId;

        // Create an Axios instance with default configurations
        this.axiosInstance = axios.create({
            baseURL: this.portainerUrl,
            headers: {
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json',
            },
            // For development: ignore SSL certificate validation when using IP addresses
            httpsAgent: process.env.NODE_ENV === 'development' ? 
                new https.Agent({ rejectUnauthorized: false }) : 
                undefined,
        });

        // Add an interceptor for common error handling or logging
        this.axiosInstance.interceptors.response.use(
            response => response,
            error => {
                const config = error.config;
                const errorMessage = error.message || 'An unknown error occurred.';

                console.error(`Portainer API Error: ${errorMessage}`);
                if (config) {
                    const fullUrl = `${config.baseURL || ''}${config.url || ''}`;
                    console.error(`Request: ${config.method?.toUpperCase()} ${fullUrl}`);
                }

                if (errorMessage.includes('Client sent an HTTP request to an HTTPS server')) {
                    console.error('Hint: This error suggests a protocol mismatch. Your PORTAINER_URL in your .env file might be using "http://" when it should be "https://://". Please verify the URL and protocol.');
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
            await this.axiosInstance.get('/api/system/status');
            console.log('Successfully connected to Portainer API.');
            return true;
        } catch {
            // The interceptor now handles detailed logging, so we can ignore the error here.
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
     * Create a new stack in Portainer
     * @param stackData - The stack configuration data
     * @param environmentId - The ID of the Portainer environment
     * @returns Promise resolving to the created stack data
     */
    async createStack(stackData: Record<string, unknown>, environmentId: number | null = this.defaultEnvironmentId): Promise<Record<string, unknown>> {
        if (environmentId === null) {
            throw new Error('Environment ID is required to create a stack.');
        }
        try {
            const response = await this.axiosInstance.post(
                `/api/stacks?type=2&method=string&endpointId=${environmentId}`,
                stackData
            );
            return response.data;
        } catch (error) {
            console.error(`Failed to create stack:`, error);
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
}

const portainer = new PortainerApiClient(
    process.env.PORTAINER_URL || 'https://your-portainer-instance.com:9443',
    process.env.PORTAINER_API_KEY || 'ptr_your_generated_api_key_here',
);

export default portainer;