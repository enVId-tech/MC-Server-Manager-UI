import { logError, logInfo } from "../../utils/logger.ts";
import type { Constructor } from "../types.ts";

interface ContainerControlsMixinBase {
    auth: {
        axiosInstance: import("axios").AxiosInstance;
    };
    ensureEnvId: () => Promise<number | null>;
}

type ContainerAction = 'start' | 'stop' | 'remove' | 'kill' | 'pause' | 'unpause' | 'restart';

export interface ContainerActionOptions {
    force?: boolean;
    removeVolumes?: boolean;
    signal?: string;
    timeout?: number;
}

export interface ContainerControls {
    action: ContainerAction;
    containerId: string;
    environmentId?: number | null;
    options?: ContainerActionOptions;
}

export function ContainerControlsMixin<TBase extends Constructor<ContainerControlsMixinBase>>(Base: TBase) {
    return class extends Base {
        readonly VALID_ACTIONS: ReadonlyArray<ContainerAction> = 
            ['start', 'stop', 'remove', 'kill', 'pause', 'unpause', 'restart'];

        /**
         * Validates container control parameters
         */
        validateContainerControls(controls: ContainerControls): boolean {
            if (!controls || typeof controls !== 'object') {
                logError('Invalid controls: must be an object');
                return false;
            }

            if (!controls.action || typeof controls.action !== 'string') {
                logError('Invalid action: must be a string');
                return false;
            }

            if (!this.VALID_ACTIONS.includes(controls.action)) {
                logError(`Invalid action: must be one of ${this.VALID_ACTIONS.join(', ')}`);
                return false;
            }

            if (!controls.containerId || typeof controls.containerId !== 'string') {
                logError('Invalid containerId: must be a non-empty string');
                return false;
            }

            if (controls.environmentId !== undefined && controls.environmentId !== null && 
                (typeof controls.environmentId !== 'number' || isNaN(controls.environmentId))) {
                logError('Invalid environmentId: must be a number, null, or undefined');
                return false;
            }

            return this.validateContainerOptions(controls.options);
        }

        /**
         * Validates container action options
         */
        validateContainerOptions(options?: ContainerActionOptions): boolean {
            if (!options) return true;

            if (typeof options !== 'object') {
                logError('Invalid options: must be an object');
                return false;
            }

            if (options.force !== undefined && typeof options.force !== 'boolean') {
                logError('Invalid options.force: must be a boolean');
                return false;
            }

            if (options.removeVolumes !== undefined && typeof options.removeVolumes !== 'boolean') {
                logError('Invalid options.removeVolumes: must be a boolean');
                return false;
            }

            if (options.signal !== undefined && typeof options.signal !== 'string') {
                logError('Invalid options.signal: must be a string');
                return false;
            }

            if (options.timeout !== undefined && 
                (typeof options.timeout !== 'number' || isNaN(options.timeout) || options.timeout < 0)) {
                logError('Invalid options.timeout: must be a non-negative number');
                return false;
            }

            return true;
        }

        /**
         * Builds URL for container actions
         */
        buildContainerUrl(environmentId: number, containerId: string, action: string): string {
            return `/api/endpoints/${environmentId}/docker/containers/${containerId}/${action}`;
        }

        /**
         * Executes the specified container action
         */
        async executeContainerAction(
            action: ContainerAction,
            containerId: string,
            environmentId: number,
            options?: ContainerActionOptions
        ): Promise<void> {
            switch (action) {
                case 'start':
                    await this.startContainer(containerId, environmentId);
                    break;
                case 'stop':
                    await this.stopContainer(containerId, environmentId);
                    break;
                case 'remove':
                    await this.removeContainer(containerId, environmentId, options);
                    break;
                case 'kill':
                    await this.killContainer(containerId, environmentId, options?.signal);
                    break;
                case 'pause':
                    await this.pauseContainer(containerId, environmentId);
                    break;
                case 'unpause':
                    await this.unpauseContainer(containerId, environmentId);
                    break;
                case 'restart':
                    await this.restartContainer(containerId, environmentId, options?.timeout);
                    break;
            }
        }

        /**
         * Starts a container
         */
        async startContainer(containerId: string, environmentId: number): Promise<void> {
            logInfo(`Starting container ${containerId}...`);
            await this.auth.axiosInstance.post(this.buildContainerUrl(environmentId, containerId, 'start'));
            logInfo('Container started successfully');
        }

        /**
         * Stops a container
         */
        async stopContainer(containerId: string, environmentId: number): Promise<void> {
            logInfo(`Stopping container ${containerId}...`);
            await this.auth.axiosInstance.post(this.buildContainerUrl(environmentId, containerId, 'stop'));
            logInfo('Container stopped successfully');
        }

        /**
         * Removes a container
         */
        async removeContainer(
            containerId: string,
            environmentId: number,
            options?: ContainerActionOptions
        ): Promise<void> {
            logInfo(`Removing container ${containerId}...`);
            const params = new URLSearchParams();
            if (options?.force) params.append('force', 'true');
            if (options?.removeVolumes) params.append('v', 'true');
            const url = `${this.buildContainerUrl(environmentId, containerId, '')}?${params.toString()}`;
            await this.auth.axiosInstance.delete(url);
            logInfo('Container removed successfully');
        }

        /**
         * Kills a container
         */
        async killContainer(
            containerId: string,
            environmentId: number,
            signal: string = 'SIGKILL'
        ): Promise<void> {
            logInfo(`Killing container ${containerId} with signal ${signal}...`);
            await this.auth.axiosInstance.post(
                `${this.buildContainerUrl(environmentId, containerId, 'kill')}?signal=${signal}`
            );
            logInfo('Container killed successfully');
        }

        /**
         * Pauses a container
         */
        async pauseContainer(containerId: string, environmentId: number): Promise<void> {
            logInfo(`Pausing container ${containerId}...`);
            await this.auth.axiosInstance.post(this.buildContainerUrl(environmentId, containerId, 'pause'));
            logInfo('Container paused successfully');
        }

        /**
         * Unpauses a container
         */
        async unpauseContainer(containerId: string, environmentId: number): Promise<void> {
            logInfo(`Unpausing container ${containerId}...`);
            await this.auth.axiosInstance.post(this.buildContainerUrl(environmentId, containerId, 'unpause'));
            logInfo('Container unpaused successfully');
        }

        /**
         * Restarts a container
         */
        async restartContainer(
            containerId: string,
            environmentId: number,
            timeout: number = 10000
        ): Promise<void> {
            logInfo(`Restarting container ${containerId}...`);
            const timeoutSeconds = (timeout / 1000).toPrecision(2);
            await this.auth.axiosInstance.post(
                `${this.buildContainerUrl(environmentId, containerId, 'restart')}?t=${timeoutSeconds}`
            );
            logInfo('Container restarted successfully');
        }

        /**
         * Handles container control actions
         * @param controls - Container control configuration
         * @returns Promise resolving to true if successful, false otherwise
         */

        async handleContainer(controls: ContainerControls): Promise<boolean> {
            // Validate all parameters
            if (!this.validateContainerControls(controls)) {
                return false;
            }

            // Resolve environment ID
            let environmentId = controls.environmentId;
            if (environmentId === null || environmentId === undefined) {
                environmentId = await this.ensureEnvId();
            }

            if (environmentId === null) {
                logError('No Portainer environments found. Cannot perform container action.');
                return false;
            }

            // Execute the action
            try {
                await this.executeContainerAction(
                    controls.action,
                    controls.containerId,
                    environmentId,
                    controls.options
                );
                return true;
            } catch (error) {
                logError(`Failed to ${controls.action} container ${controls.containerId}:`, error);
                return false;
            }
        }

        /**
 * Pull the latest image for a container
 * @param imageName - The name of the image to pull
 * @param environmentId - Optional: The ID of the Portainer environment
 * @returns {Promise<boolean>} Promise resolving when image is pulled
 */
        async pullImage(
            imageName: string,
            environmentId?: number | null): Promise<boolean> {
            if (!imageName || typeof imageName !== 'string') {
                logError('Invalid imageName: must be a non-empty string');
                return false;
            }

            if (environmentId !== undefined && environmentId !== null && (typeof environmentId !== 'number' || isNaN(environmentId))) {
                environmentId = await this.ensureEnvId();
            }

            if (environmentId === null) {
                logError('No Portainer environments found. Cannot pull image.');
                return false;
            }

            try {
                logInfo(`Pulling image ${imageName}...`);
                await this.auth.axiosInstance.post(
                    `/api/endpoints/${environmentId}/docker/images/create?fromImage=${encodeURIComponent(imageName)}`
                );
                logInfo(`Image ${imageName} pulled successfully`);
                return true;
            } catch (error) {
                logError(`Failed to pull image ${imageName}:`, error);
                return false;
            }
        }

        /**
         * Update container resources (CPU and memory limits)
         * @param containerId - The ID of the container to update
         * @param environmentId - The ID of the Portainer environment
         * @param resources - The resource limits to apply
         * @returns {Promise<boolean>} - Promise resolving when resources are updated
         */
        async updateContainerResources(
            containerId: string,
            resources: {
                cpuQuota?: number; // CPU quota in microseconds per CPU period
                cpuPeriod?: number; // CPU period in microseconds 
                memory?: number;   // Memory limit in bytes
            },
            environmentId?: number | null,
        ): Promise<boolean> {
            if (!containerId || typeof containerId !== 'string') {
                logError('Invalid containerId: must be a non-empty string');
                return false;
            }

            if (environmentId !== undefined && environmentId !== null && (typeof environmentId !== 'number' || isNaN(environmentId))) {
                environmentId = await this.ensureEnvId();
            }

            if (environmentId === null) {
                logError('No Portainer environments found. Cannot update container resources.');
                return false;
            }

            if (!resources || typeof resources !== 'object') {
                logError('Invalid resources: must be an object');
                return false;
            }

            if (resources.cpuQuota !== undefined && (typeof resources.cpuQuota !== 'number' || isNaN(resources.cpuQuota) || resources.cpuQuota < 0)) {
                logError('Invalid resources.cpuQuota: must be a non-negative number');
                return false;
            }

            if (resources.cpuPeriod !== undefined && (typeof resources.cpuPeriod !== 'number' || isNaN(resources.cpuPeriod) || resources.cpuPeriod <= 0)) {
                logError('Invalid resources.cpuPeriod: must be a positive number');
                return false;
            }

            if (resources.memory !== undefined && (typeof resources.memory !== 'number' || isNaN(resources.memory) || resources.memory < 0)) {
                logError('Invalid resources.memory: must be a non-negative number');
                return false;
            }

            try {
                logInfo(`Updating resources for container ${containerId}...`);

                // Get current container configuration
                const containerInfo = await this.auth.axiosInstance.get(
                    `/api/endpoints/${environmentId}/docker/containers/${containerId}/json`
                );

                const updateConfig = {
                    Memory: resources.memory || containerInfo.data.HostConfig.Memory,
                    CpuQuota: resources.cpuQuota || containerInfo.data.HostConfig.CpuQuota,
                    CpuPeriod: resources.cpuPeriod || containerInfo.data.HostConfig.CpuPeriod,
                    // Preserve other existing configurations
                    RestartPolicy: containerInfo.data.HostConfig.RestartPolicy,
                };

                await this.auth.axiosInstance.post(
                    `/api/endpoints/${environmentId}/docker/containers/${containerId}/update`,
                    updateConfig
                );

                logInfo(`Container resources updated successfully`);
                return true;
            } catch (error) {
                logError(`Failed to update container resources for ${containerId}:`, error);
                return false;
            }
        }
    }
}