import axios from "axios";
import { logError, logWarn, logInfo } from "../../utils/logger.ts";
import type { Constructor } from "../types.ts";

interface ShellControlsMixinBase {
    auth: {
        axiosInstance: import("axios").AxiosInstance;
    };
    ensureEnvId: () => Promise<number | null>;
}

export interface CommandExecutionResult {
    output: string;
    exitCode: number;
}

export interface ExecConfig {
    AttachStdout: boolean;
    AttachStderr: boolean;
    Cmd: string[];
}

export interface ExecStartConfig {
    Detach: boolean;
    Tty: boolean;
}

export function ShellControlsMixin<TBase extends Constructor<ShellControlsMixinBase>>(Base: TBase) {
    return class extends Base {
        /**
         * Validates the parameters for command execution
         */
        validateExecuteCommandParams(
            containerId: string,
            command: string,
            environmentId?: number | null
        ): boolean {
            if (typeof containerId !== 'string' || containerId.trim() === '') {
                logError('Invalid containerId: must be a non-empty string');
                return false;
            }

            if (typeof command !== 'string' || command.trim() === '') {
                logError('Invalid command: must be a non-empty string');
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
         * Creates an exec configuration for shell command execution
         */
        createExecConfig(command: string): ExecConfig {
            return {
                AttachStdout: true,
                AttachStderr: true,
                Cmd: ["/bin/sh", "-c", command]
            };
        }

        /**
         * Creates a start configuration for exec instance
         */
        createExecStartConfig(): ExecStartConfig {
            return {
                Detach: false,
                Tty: false
            };
        }

        /**
         * Executes a command in a container for a specific environment
         */
        async executeCommandInEnvironment(
            containerId: string,
            command: string,
            envId: number
        ): Promise<CommandExecutionResult> {
            // Create exec instance
            const execConfig = this.createExecConfig(command);
            const execResponse = await this.auth.axiosInstance.post(
                `/api/endpoints/${envId}/docker/containers/${containerId}/exec`,
                execConfig
            );

            const execId = execResponse.data.Id;

            // Start the exec instance
            const startConfig = this.createExecStartConfig();
            const startResponse = await this.auth.axiosInstance.post(
                `/api/endpoints/${envId}/docker/exec/${execId}/start`,
                startConfig
            );

            return {
                output: startResponse.data,
                exitCode: 0
            };
        }

        /**
         * Attempts to retry command execution with a new environment ID
         */
        async retryWithNewEnvironment(
            containerId: string,
            command: string,
            originalEnvId: number
        ): Promise<CommandExecutionResult | null> {
            logWarn(
                `Failed to execute command in container ${containerId} on environment ${originalEnvId} (404). ` +
                `Attempting to discover a valid environment...`
            );

            try {
                const newEnvId = await this.ensureEnvId();
                
                if (newEnvId === null || newEnvId === originalEnvId) {
                    return null;
                }

                logInfo(`Found valid environment ${newEnvId}. Retrying executeCommand...`);
                
                const result = await this.executeCommandInEnvironment(containerId, command, newEnvId);
                
                logInfo(`Successfully executed command with environment ${newEnvId}`);
                
                return result;
            } catch (retryError) {
                logError('Retry with new environment ID failed:', retryError);
                return null;
            }
        }

        /**
         * Execute a command in a running container
         * @param containerId - The ID of the container
         * @param command - The command to execute
         * @param environmentId - Optional: The ID of the Portainer environment
         * @returns Promise resolving to command execution result, or null on validation failure
         */
        async executeCommand(
            containerId: string,
            command: string,
            environmentId?: number | null
        ): Promise<CommandExecutionResult | null> {
            // Validate parameters
            if (!this.validateExecuteCommandParams(containerId, command, environmentId)) {
                return null;
            }

            // Resolve environment ID
            let resolvedEnvId = environmentId;
            if (resolvedEnvId === null || resolvedEnvId === undefined) {
                resolvedEnvId = await this.ensureEnvId();
            }

            if (resolvedEnvId === null) {
                logError('No Portainer environments found. Cannot execute command.');
                return null;
            }

            try {
                // Execute command in the resolved environment
                return await this.executeCommandInEnvironment(containerId, command, resolvedEnvId);
            } catch (error: any) {
                // Handle 404 errors by attempting to discover a valid environment and retry
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    const retryResult = await this.retryWithNewEnvironment(
                        containerId,
                        command,
                        resolvedEnvId
                    );
                    
                    if (retryResult !== null) {
                        return retryResult;
                    }
                }

                // Log and rethrow the error if retry failed or wasn't attempted
                logError(`Failed to execute command in container ${containerId}:`, error);
                throw error;
            }
        }
    }
}