import { logError } from "../../utils/logger.ts";
import type { Constructor, PortainerContainer, PortainerImage, PortainerStack } from "../types.ts";

interface ResourceFetchingMixinBase {
    auth: {
        axiosInstance: import("axios").AxiosInstance;
        isValidated: boolean;
    };
    ensureEnvId: () => Promise<number | null>;
}

export function ResourceFetchingMixin<TBase extends Constructor<ResourceFetchingMixinBase>>(Base: TBase) {
    return class extends Base {
        /**
         * Fetches a list of all stacks managed by Portainer.
         * @returns {Promise<PortainerStack[] | undefined>} A promise that resolves to an array of stack objects.
         */
        async getStacks(): Promise<PortainerStack[] | undefined> {
            try {
                if (!this.auth.isValidated) {
                    logError('Authentication is not validated. Cannot fetch stacks.');
                    return undefined;
                }

                const response = await this.auth.axiosInstance.get<PortainerStack[]>('/api/stacks');
                return response.data;
            } catch (error) {
                logError('Failed to fetch stacks:', error);
                return undefined;
            }
        }

        /**
         * Fetches a list of all containers within a specific Portainer environment.
         * This proxies the Docker API's /containers/json endpoint.
         * @param includeAll - Whether to include all containers (running, stopped, etc.).
         * @param environmentId - Optional: The ID of the Portainer environment. Defaults to `this.defaultEnvironmentId`.
         * @returns {Promise<PortainerContainer[] | undefined>} A promise that resolves to an array of container objects.
         */
        async getContainers(includeAll: boolean, environmentId?: number | null): Promise<PortainerContainer[] | undefined> {
            if (typeof includeAll !== 'boolean') {
                logError('Invalid includeAll: must be a boolean');
                return undefined;
            }

            if (!this.auth.isValidated) {
                logError('Authentication is not validated. Cannot fetch containers.');
                return undefined;
            }

            if (environmentId !== undefined && environmentId !== null && (typeof environmentId !== 'number' || isNaN(environmentId))) {
                logError('Invalid environmentId: must be a number, null, or undefined');
                return undefined;
            }

            // If no environment ID is provided and no default is set, try to get the first one
            if (environmentId === null || environmentId === undefined) {
                environmentId = await this.ensureEnvId();
            }

            if (environmentId === null) {
                logError('No Portainer environments found. Cannot fetch containers.');
                return undefined;
            }

            try {
                const params = { all: includeAll };
                const response = await this.auth.axiosInstance.get<PortainerContainer[]>(`/api/endpoints/${environmentId}/docker/containers/json`, { params });
                return response.data;
            } catch (error) {
                logError(`Failed to fetch containers: ${error}`);
                return undefined;
            }
        }

        /**
         * Fetches the overall system status of the Portainer instance.
         * @returns {Promise<any | undefined>} A promise that resolves to the system status object.
         */
        async getStatus(): Promise<any | undefined> {
            try {
                if (!this.auth.isValidated) {
                    logError('Authentication is not validated. Cannot fetch system status.');
                    return undefined;
                }

                const response = await this.auth.axiosInstance.get('/api/system/status');
                return response.data;
            } catch (error) {
                logError('Failed to fetch system status:', error);
                return undefined;
            }
        }

        /**
         * Get stack file content
         * @param stackId - The ID of the stack
         * @returns {Promise<string | undefined>} Promise resolving to the compose file content
         */
        async getStackFileContent(stackId: number): Promise<string | undefined> {
            try {
                if (typeof stackId !== 'number' || isNaN(stackId) || stackId <= 0) {
                    logError('Invalid stackId: must be a positive number');
                    return undefined;
                }

                if (!this.auth.isValidated) {
                    logError('Authentication is not validated. Cannot fetch stack file content.');
                    return undefined;
                }

                const response = await this.auth.axiosInstance.get(`/api/stacks/${stackId}/file`);
                return response.data.StackFileContent || '';
            } catch (error) {
                logError(`Error getting stack file for ${stackId}:`, error);
                return undefined;
            }
        }

        /**
         * Fetches detailed information about a specific container within a Portainer environment.
         * @param containerId - The ID of the container to fetch details for.
         * @param environmentId - Optional: The ID of the Portainer environment, uses the set environmentId by default
         * @returns {Promise<PortainerContainer | undefined>} A promise that resolves to the container object.
         */
        async getContainerDetails(identifier: string, environmentId?: number | null): Promise<PortainerContainer | undefined> {
            if (!identifier || typeof identifier !== 'string') {
                logError('Invalid identifier: must be a non-empty string');
                return undefined;
            }

            if (!this.auth.isValidated) {
                logError('Authentication is not validated. Cannot fetch container details.');
                return undefined;
            }

            if (environmentId !== undefined && environmentId !== null && (typeof environmentId !== 'number' || isNaN(environmentId))) {
                logError('Invalid environmentId: must be a number, null, or undefined');
                return undefined;
            }

            if (environmentId === null || environmentId === undefined) {
                environmentId = await this.ensureEnvId();
            }

            if (environmentId === null) {
                logError('No Portainer environments found. Cannot fetch container details.');
                return undefined;
            }

            const containers = await this.getContainers(true, environmentId);

            if (!containers) {
                logError('No containers found in the specified environment.');
                return undefined;
            }

            let container: PortainerContainer | undefined = await this.auth.axiosInstance.get<PortainerContainer>(`/api/endpoints/${environmentId}/docker/containers/${identifier}/json`).then(res => res.data).catch(() => undefined);

            // If not found by ID, try to find by name
            if (!container) {
                container = containers.find(c =>
                    c.Names.some(name =>
                        name.includes(identifier) || name === `/${identifier}`
                    )
                );
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

            return container;
        }

        /**
         * Get container statistics (CPU, memory usage, network I/O)
         * @param containerId - The ID of the container
         * @param environmentId - The ID of the Portainer environment
         * @returns Promise resolving to container statistics
         */
        async getContainerStats(containerId: string, environmentId?: number | null): Promise<{
            memory_stats: { usage: number; limit: number };
            cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number; online_cpus?: number };
            precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
            networks: Record<string, { rx_bytes: number; tx_bytes: number }>;
        } | null> {
            if (!containerId || typeof containerId !== 'string') {
                logError('Invalid containerId: must be a non-empty string');
                return null;
            }

            if (!this.auth.isValidated) {
                logError('Authentication is not validated. Cannot fetch container stats.');
                return null;
            }

            if (environmentId === null || environmentId === undefined) {
                environmentId = await this.ensureEnvId();
            }

            if (environmentId === null) {
                logError('No Portainer environments found. Cannot fetch container stats.');
                return null;
            }

            try {
                const response = await this.auth.axiosInstance.get(
                    `/api/endpoints/${environmentId}/docker/containers/${containerId}/stats?stream=false`
                );
                return response.data;
            } catch (error) {
                logError(`Failed to get container stats for ${containerId}:`, error);
                return null;
            }
        }

        /**
         * Finds container by name in container list
         */
        findContainerByName(
            containers: PortainerContainer[],
            containerName: string
        ): PortainerContainer | undefined {
            return containers.find(c =>
                c.Names.some(name => name.includes(containerName) || name === `/${containerName}`)
            );
        }

        /**
         * Fetches a list of all Docker images within a specific Portainer environment.
         * This proxies the Docker API's /images/json endpoint.
         * @param environmentId - Optional: The ID of the Portainer environment.
         * @returns {Promise<PortainerImage[] | undefined>} A promise that resolves to an array of image objects.
         */
        async getImages(environmentId?: number | null): Promise<PortainerImage[] | undefined> {
            if (environmentId !== undefined && environmentId !== null && (typeof environmentId !== 'number' || isNaN(environmentId))) {
                logError('Invalid environmentId: must be a number, null, or undefined');
                return undefined;
            }

            if (!this.auth.isValidated) {
                logError('Authentication is not validated. Cannot fetch images.');
                return undefined;
            }

            if (environmentId === null || environmentId === undefined) {
                environmentId = await this.ensureEnvId();
            }

            if (environmentId === null) {
                logError('No Portainer environments found. Cannot fetch images.');
                return undefined;
            }

            try {
                const response = await this.auth.axiosInstance.get<PortainerImage[]>(`/api/endpoints/${environmentId}/docker/images/json`);
                return response.data;
            } catch (error) {
                logError(`Failed to fetch images for environment ${environmentId}:`, error);
                return undefined;
            }
        }
    }
}