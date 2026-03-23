import { logError, logInfo, logWarn } from "../../utils/logger.ts";
import type { Constructor, PortainerContainer } from "../types.ts";
import { getStackById, getStackByName } from "../utils.ts";

interface ResourceDeletionMixinBase {
    auth: {
        axiosInstance: import("axios").AxiosInstance;
    };
    ensureEnvId: () => Promise<number | null>;
    getContainers: (includeAll: boolean, environmentId?: number | null) => Promise<PortainerContainer[] | undefined>;
    findContainerByName: (continers: PortainerContainer[], containerName: string) => PortainerContainer | undefined;
}

export function ResourceDeletionMixin<TBase extends Constructor<ResourceDeletionMixinBase>>(Base: TBase) {
    return class extends Base {
        /**
         * Validates parameters for container cleanup
         */
        validateCleanupParams(containerName: string, environmentId?: number | null): boolean {
            if (!containerName || typeof containerName !== 'string') {
                logError('Invalid containerName: must be a non-empty string');
                return false;
            }

            if (environmentId !== undefined && environmentId !== null && 
                (typeof environmentId !== 'number' || isNaN(environmentId))) {
                logError('Invalid environmentId: must be a number, null, or undefined');
                return false;
            }

            return true;
        }

        /**
         * Stops and removes a container
         */
        async stopAndRemoveContainer(
            container: PortainerContainer,
            environmentId: number
        ): Promise<void> {
            if (container.State === 'running') {
                await this.auth.axiosInstance.post(
                    `/api/endpoints/${environmentId}/docker/containers/${container.Id}/stop`
                );
                logInfo('Container stopped');
            }

            await this.auth.axiosInstance.delete(
                `/api/endpoints/${environmentId}/docker/containers/${container.Id}`
            );
            logInfo('Container removed');
        }
        /**
         * Clean up any existing container with the same name
         * @param containerName - The name of the container to clean up
         * @param environmentId - Optional: The ID of the Portainer environment
         * @returns {Promise<boolean>} Promise resolving to true if a container was cleaned up, false otherwise
         */
        async cleanupExistingContainer(containerName: string, environmentId?: number | null): Promise<boolean> {
            // Validate parameters
            if (!this.validateCleanupParams(containerName, environmentId)) {
                return false;
            }

            try {
                // Resolve environment ID
                let resolvedEnvId = environmentId;
                if (resolvedEnvId === null || resolvedEnvId === undefined) {
                    resolvedEnvId = await this.ensureEnvId();
                }
    
                if (resolvedEnvId === null) {
                    logError('No Portainer environments found. Cannot cleanup container.');
                    return false;
                }
    
                // Get containers and find target
                const containers = await this.getContainers(true);
                if (!containers) {
                    logError("No containers found, canceled cleanup operation.")
                    return false;
                }
                
                const existingContainer = this.findContainerByName(containers, containerName);
    
                if (existingContainer) {
                    logInfo(`Cleaning up existing container "${containerName}" (ID: ${existingContainer.Id})`);
                    await this.stopAndRemoveContainer(existingContainer, resolvedEnvId);
                    return true;
                }
                
                return false;
            } catch (error) {
                logWarn(`Warning: Failed to cleanup existing container "${containerName}":`, error);
                return false;
            }
        }
        /**
         * Delete a stack from Portainer using the given stack id.
         * @param stackId - The ID of the stack to delete
         * @param environmentId - Optional: The ID of the Portainer environment
         * @returns {Promise<Record<string, unknown> | undefined>} Promise resolving to the delete operation result
         */
        deleteStack(stackId: number, environmentId?: number | null): Promise<Record<string, unknown> | undefined>;
        /**
        * Delete a stack from Portainer using the given stack id.
        * @param stackId - The ID of the stack to delete
        * @param environmentId - Optional: The ID of the Portainer environment
        * @returns {Promise<Record<string, unknown> | undefined>} Promise resolving to the delete operation result
        */
        deleteStack(stackName: string, environmentId?: number | null): Promise<Record<string, unknown> | undefined>;

        /**
         * Delete a stack from Portainer using the given stack id.
         * @param stackId - The ID of the stack to delete
         * @param environmentId - Optional: The ID of the Portainer environment
         * @returns {Promise<Record<string, unknown> | undefined>} Promise resolving to the delete operation result
         */
        async deleteStack(stackId: number | string, environmentId?: number | null): Promise<Record<string, unknown> | undefined> {
            if (typeof stackId !== 'number' && typeof stackId !== 'string') {
                logError('Invalid stackId: must be a number or string');
                return undefined;
            }

            if (typeof stackId === 'number' && (isNaN(stackId) || stackId <= 0)) {
                logError('Invalid stackId: must be a positive number');
                return undefined;
            }

            if (typeof stackId === 'string' && !stackId.trim()) {
                logError('Invalid stackId: string must not be empty');
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
                logError('No Portainer environments found. Cannot delete stack.');
                return undefined;
            }

            if (typeof stackId === "number") {
                const stack = await getStackById(stackId, environmentId);
                if (!stack) {
                    logError(`Stack ID ${stackId} does not exist in environment ${environmentId}`);
                    return undefined;
                }
            }

            if (typeof stackId === "string") {
                const stack = await getStackByName(stackId);
                if (!stack) {
                    logError(`Stack with name "${stackId}" does not exist in environment ${environmentId}`);
                    return undefined;
                }
                stackId = stack.Id;
            }

            try {
                logInfo(`Deleting stack ${stackId} from environment ${environmentId}...`);
                const response = await this.auth.axiosInstance.delete(`/api/stacks/${stackId}?endpointId=${environmentId}`);
                logInfo('Stack deleted successfully');
                return response.data;
            } catch (error) {
                logError(`Failed to delete stack ${stackId}:`, error);
                return undefined;
            }
        }
    }
}