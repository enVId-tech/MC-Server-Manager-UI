import { logError, logInfo, logWarn } from ".././logger.ts";
import { PortainerAuth } from "../auth.ts";
import type { Constructor, PortainerEnvironment } from "../types.ts";
import { getFirstEnvironmentId } from "../utils.ts";

export interface EnvironmentsMixinBase {
    auth: PortainerAuth;
    environmentId: number | null;
}

export function EnvironmentsMixin<TBase extends Constructor<EnvironmentsMixinBase>>(Base: TBase) {
    return class extends Base {
        /**
         * Fetches details of a specific Portainer environment.
         * @param environmentId - The ID of the environment to fetch.
         * @returns {Promise<PortainerEnvironment | undefined>} A promise that resolves to the environment object.
         */
        async getEnvironmentDetails(): Promise<PortainerEnvironment | undefined> {
            try {
                if (!this.auth.isValidated) {
                    return undefined;
                }

                const response = await this.auth.axiosInstance.get<PortainerEnvironment>(`/api/endpoints/${this.environmentId}`);
                return response.data;
            } catch (error) {
                logError(`Failed to fetch environment ${this.environmentId}:`, error);
                return undefined;
            }
        }

        /**
         * Fetches a list of all Portainer environments (endpoints).
         * @returns {Promise<PortainerEnvironment[] | undefined>} A promise that resolves to an array of environment objects.
         */
        async getEnvironments(): Promise<PortainerEnvironment[] | undefined> {
            try {
                if (!this.auth.isValidated) {
                    logError('Authentication is not validated. Cannot fetch environments.');
                    return undefined;
                }

                logInfo('Fetching environments from Portainer...');

                const response = await this.auth.axiosInstance.get<PortainerEnvironment[]>('/api/endpoints');

                logInfo(`Fetched ${response.data.length} environments from Portainer.`);

                return response.data;
            } catch (error) {
                logError('Failed to fetch environments:', error);
                return undefined;
            }
        }

        /**
         * Ensures that an environment ID is set, fetching the first available if not.
         * @returns {Promise<number | null>} The environment ID or null if none available
         */
        public async ensureEnvId(): Promise<number | null> {
            // Return existing environment ID if already set
            if (this.environmentId !== null) {
                return this.environmentId;
            }

            // Attempt to get first available environment
            logWarn('Environment ID is not set, getting default environment ID.');
            const firstEnvId = await getFirstEnvironmentId();
            
            if (firstEnvId === null || firstEnvId === undefined) {
                logWarn('No Portainer environments found.');
                logError("ALERT: Any Portainer operations requiring an environment ID will fail until one is set.");
                return null;
            }

            this.environmentId = firstEnvId;
            return this.environmentId;
        }
    }
}