import { logError, logInfo, logWarn } from ".././logger.ts";
import type { Constructor, PortainerStack } from "../types.ts";

interface StackControlsMixinBase {
    auth: {
        axiosInstance: import("axios").AxiosInstance;
    };
    ensureEnvId: () => Promise<number | null>;
    getStacks: () => Promise<PortainerStack[] | undefined>;
}

export function StackControlsMixin<TBase extends Constructor<StackControlsMixinBase>>(Base: TBase) {
    return class extends Base {
        /**
         * Validates stack ID parameter
         */
        validateStackId(stackId: number): boolean {
            if (typeof stackId !== 'number' || isNaN(stackId) || stackId <= 0) {
                logError('Invalid stackId: must be a positive number');
                return false;
            }
            return true;
        }

        /**
         * Validates and resolves environment ID
         */
        async validateAndResolveEnvironmentId(environmentId?: number | null): Promise<number | null> {
            if (environmentId !== undefined && environmentId !== null && 
                (typeof environmentId !== 'number' || isNaN(environmentId))) {
                logError('Invalid environmentId: must be a number, null, or undefined');
                return null;
            }

            let resolvedEnvId = environmentId;
            if (resolvedEnvId === null || resolvedEnvId === undefined) {
                resolvedEnvId = await this.ensureEnvId();
            }

            return resolvedEnvId;
        }

        /**
         * Executes a stack action via API
         */
        async executeStackAction(
            stackId: number,
            action: 'start' | 'stop',
            environmentId: number
        ): Promise<void> {
            const actionVerb = action === 'start' ? 'Starting' : 'Stopping';
            const actionPastTense = action === 'start' ? 'started' : 'stopped';
            
            logInfo(`${actionVerb} stack ${stackId}...`);
            await this.auth.axiosInstance.post(`/api/stacks/${stackId}/${action}?endpointId=${environmentId}`);
            logInfo(`Stack ${actionPastTense} successfully`);
        }


        /**
         * Start a stack
         * @param stackId - The ID of the stack to start
         * @param environmentId - Optional: The ID of the Portainer environment
         * @returns {Promise<boolean>} Promise resolving to true if successful, false otherwise
         */
        async startStack(stackId: number, environmentId?: number | null): Promise<boolean> {
            if (!this.validateStackId(stackId)) {
                return false;
            }

            const resolvedEnvId = await this.validateAndResolveEnvironmentId(environmentId);
            if (resolvedEnvId === null) {
                logError('No Portainer environments found. Cannot start stack.');
                return false;
            }

            try {
                await this.executeStackAction(stackId, 'start', resolvedEnvId);
                return true;
            } catch (error) {
                logError(`Failed to start stack ${stackId}:`, error);
                return false;
            }
        }

        /**
         * Stop a stack
         * @param stackId - The ID of the stack to stop
         * @param environmentId - Optional: The ID of the Portainer environment
         * @returns {Promise<boolean>} Promise resolving to true if successful, false otherwise
         */
        async stopStack(stackId: number, environmentId?: number | null): Promise<boolean> {
            if (!this.validateStackId(stackId)) {
                return false;
            }

            const resolvedEnvId = await this.validateAndResolveEnvironmentId(environmentId);
            if (resolvedEnvId === null) {
                logError('No Portainer environments found. Cannot stop stack.');
                return false;
            }

            try {
                await this.executeStackAction(stackId, 'stop', resolvedEnvId);
                return true;
            } catch (error) {
                logError(`Failed to stop stack ${stackId}:`, error);
                return false;
            }
        }

        /**
         * Update a stack with new compose file content
         * @param stackId - The ID of the stack to update
         * @param composeContent - The new docker-compose content
         * @param environmentId - Optional: The ID of the Portainer environment
         * @param pullImage - Whether to pull the latest image (default: true)
         * @returns Promise resolving to true if successful, false otherwise
         */
        async updateStack(
            stackId: number,
            composeContent: string,
            environmentId?: number | null,
            pullImage: boolean = true
        ): Promise<boolean> {
            if (!this.validateStackId(stackId)) {
                return false;
            }

            if (typeof composeContent !== 'string' || !composeContent.trim()) {
                logError('Invalid composeContent: must be a non-empty string');
                return false;
            }

            const resolvedEnvId = await this.validateAndResolveEnvironmentId(environmentId);
            if (resolvedEnvId === null) {
                logError('No Portainer environments found. Cannot update stack.');
                return false;
            }

            try {
                logInfo(`Updating stack ${stackId}...`);
                await this.auth.axiosInstance.put(
                    `/api/stacks/${stackId}?endpointId=${resolvedEnvId}`,
                    {
                        StackFileContent: composeContent,
                        Prune: false,
                        PullImage: pullImage
                    }
                );
                logInfo('Stack updated successfully');
                return true;
            } catch (error) {
                logError(`Failed to update stack ${stackId}:`, error);
                return false;
            }
        }

        /**
         * Redeploy a stack (stop, pull image, start)
         * @param stackId - The ID of the stack to redeploy
         * @param environmentId - Optional: The ID of the Portainer environment
         * @returns Promise resolving to true if successful, false otherwise
         */
        async redeployStack(
            stackId: number, 
            environmentId?: number | null
        ): Promise<boolean> {
            if (!this.validateStackId(stackId)) {
                return false;
            }

            const resolvedEnvId = await this.validateAndResolveEnvironmentId(environmentId);
            if (resolvedEnvId === null) {
                logError('No Portainer environments found. Cannot redeploy stack.');
                return false;
            }

            try {
                logInfo(`Redeploying stack ${stackId}...`);

                // Verify stack exists
                const stacks = await this.getStacks();
                if (!stacks) {
                    logError('No stacks found in the specified environment.');
                    return false;
                }

                const stack = stacks.find(s => s.Id === stackId);
                if (!stack) {
                    logError(`Stack ${stackId} not found`);
                    return false;
                }

                // Stop the stack (ignore errors if already stopped)
                try {
                    await this.stopStack(stackId, resolvedEnvId);
                } catch (e) {
                    logWarn('Stack may already be stopped:', e);
                }

                // Wait for cleanup
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Start the stack with latest image
                await this.startStack(stackId, resolvedEnvId);

                logInfo('Stack redeployed successfully');
                return true;
            } catch (error) {
                logError(`Failed to redeploy stack ${stackId}:`, error);
                return false;
            }
        }
    }
}