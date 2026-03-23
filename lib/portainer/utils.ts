import { PortainerApi } from "./api.ts";
import type { PortainerContainer } from "./types.ts";
import { logInfo, logWarn, logError } from "./logger.ts";

/**
 * Get the first available environment ID
 * @returns {Promise<number | null>} - Promise resolving to the first environment ID or null if none found
 */
export async function getFirstEnvironmentId(): Promise<number | null> {
    try {
        const environments = await PortainerApi.instance.getEnvironments();
        if (!environments || environments.length === 0) {
            logError('No environments found in the Portainer instance.');
            return null;
        }
        return environments.length > 0 ? environments[0]!.Id : null;
    } catch (error) {
        logError('Error getting first environment ID:', error);
        return Promise.resolve(null);
    }
}

/**
 * Get a container by specific details
 * @param criteria - The search criteria (image name, label, etc.)
 * @returns {Promise<PortainerContainer | null>} - Promise resolving to the container object or null if not found
 */
export async function getContainerByDetails(
    criteria: { image?: string; label?: string }
): Promise<PortainerContainer | null> {
    if (!criteria || typeof criteria !== 'object') {
        logError('Invalid criteria: must be an object');
        return null;
    }

    if (!criteria.image && !criteria.label) {
        logError('At least one search criteria (image or label) must be provided.');
        return null;
    }

    if (criteria.image !== undefined && typeof criteria.image !== 'string') {
        logError('Search criteria.image must be of type string.');
        return null;
    }

    if (criteria.label !== undefined && typeof criteria.label !== 'string') {
        logError('Search criteria.label must be of type string.');
        return null;
    }

    try {
        const containers = await PortainerApi.instance.getContainers(true);
        if (!containers) {
            logError('No containers found in the specified environment.');
            return null;
        }

        const container = await containers.find((container: PortainerContainer) => {
            let matches = true;
            if (criteria.image) {
                matches = matches && container.Image === criteria.image;
            }
            if (criteria.label) {
                matches = matches && container.Labels && container.Labels[criteria.label] !== undefined;
            }
            return matches;
        });

        return container || null;
    } catch (error) {
        logError('Failed to get container by details:', error);
        return null;
    }
}

/**
 * Get a stack by name
 * @param stackName - The name of the stack to find
 * @returns {Promise<any | null>} - Promise resolving to the stack object or null if not found
 */
export async function getStackByName(stackName: string): Promise<any | null> {
    try {
        if (!stackName || typeof stackName !== 'string') {
            logError('Invalid stackName: must be a non-empty string');
            return null;
        }

        const stacks = await PortainerApi.instance.getStacks();

        if (!stacks) {
            logError('No stacks found in the specified environment.');
            return null;
        }

        const stack = stacks.find((s: any) => s.Name === stackName);

        return stack || null;
    } catch (error) {
        logError(`Failed to get stack by name "${stackName}":`, error);
        return null;
    }
}

/**
 * Get a stack by ID
 * @param stackid - The ID of the stack to find
 * @param environmentId - The ID of the Portainer environment
 * @returns {Promise<any | null>} - Promise resolving to the stack object or null if not found
 */
export async function getStackById(stackid: number, environmentId: number): Promise<any | null> {
    try {
        if (typeof stackid !== 'number' || isNaN(stackid) || stackid <= 0) {
            logError('Invalid stackid: must be a positive number');
            return null;
        }

        if (typeof environmentId !== 'number' || isNaN(environmentId) || environmentId <= 0) {
            logError('Invalid environmentId: must be a positive number');
            return null;
        }

        const stacks = await PortainerApi.instance.getStacks();
        if (!stacks) {
            logError('No stacks found in the specified environment.');
            return null;
        }
        const stack = stacks.find((s: any) => s.Id === stackid && s.EndpointId === environmentId);
        return stack || null;
    } catch (error) {
        logError(`Failed to get stack by id "${stackid}" and environmentId "${environmentId}":`, error);
        return null;
    }
}

/**
 * Verify that a stack was created successfully
 * @param stackName - The name of the stack to verify
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<boolean>} - Promise resolving to true if stack exists
 */
export async function verifyStackCreation(stackName: string, timeoutMs: number = 5000): Promise<boolean> {
    if (!stackName || typeof stackName !== 'string') {
        logError('Invalid stackName: must be a non-empty string');
        return false;
    }

    if (timeoutMs === undefined || timeoutMs === null) {
        logWarn('timeoutMs is missing, using default value of 5000 ms.');
        timeoutMs = 5000;
    } else if (typeof timeoutMs !== 'number' || isNaN(timeoutMs) || Math.floor(timeoutMs) < 0) {
        logWarn("timeoutMs is an invalid number, setting it to default value of 5000 ms.");
        timeoutMs = 5000;
    } else {
        timeoutMs = Math.floor(timeoutMs);
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const stack = await getStackByName(stackName);
            if (stack) {
                logInfo(`Stack "${stackName}" verified successfully`);
                return true;
            }
        } catch (error) {
            logWarn('Error during stack verification:', error);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logWarn(`Stack verification timed out for "${stackName}"`);
    return false;
}

/**
 * Verify that a container was created successfully
 * @param containerName - The name of the container to verify
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<boolean>} - Promise resolving to true if container exists
 */
export async function verifyContainerCreation(containerName: string, timeoutMs: number = 5000): Promise<boolean> {
    if (!containerName || typeof containerName !== 'string') {
        logError('Invalid containerName: must be a non-empty string');
        return false;
    }

    if (timeoutMs === undefined || timeoutMs === null) {
        logWarn('timeoutMs is missing, using default value of 5000 ms.');
        timeoutMs = 5000;
    } else if (typeof timeoutMs !== 'number' || isNaN(timeoutMs) || Math.floor(timeoutMs) < 0) {
        logWarn("timeoutMs is an invalid number, setting it to default value of 5000 ms.");
        timeoutMs = 5000;
    } else {
        timeoutMs = Math.floor(timeoutMs);
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const container = await PortainerApi.getInstance().getContainerDetails(containerName);

            if (container) {
                logInfo(`Container "${containerName}" verified successfully (State: ${container.State})`);
                return true;
            }
        } catch (error) {
            logWarn('Error during container verification:', error);
        }

        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logWarn(`Container verification timed out for "${containerName}"`);
    return false;
}