/**
 * Writetainer-Lib - A TypeScript library for interacting with Portainer API
 * 
 * Main entry point for the library. This file exports all public APIs.
 * @module writetainer-lib
 */

// ============================================
// Core Classes
// ============================================

/**
 * Main API client for interacting with Portainer
 * Provides methods for managing containers, stacks, and environments
 */
export { PortainerApi } from './api.ts';

/**
 * Factory for creating Portainer resources (stacks, containers)
 * Provides high-level methods for resource creation with validation
 */
export { PortainerFactory } from './factory.ts';

/**
 * Authentication client for Portainer
 * Handles authentication and axios instance configuration
 */
export { PortainerAuth } from './auth.ts';

// ============================================
// Type Definitions
// ============================================

/**
 * Type definitions for Portainer resources
 */
export type {
    PortainerEnvironment,
    PortainerStack,
    PortainerContainer,
    PortainerImage,
    PortainerStackContent,
    Constructor
} from './types.ts';

// ============================================
// Utility Functions
// ============================================

/**
 * Utility functions for working with Portainer resources
 */
export {
    getFirstEnvironmentId,
    getContainerByDetails,
    getStackById,
    getStackByName,
    verifyStackCreation,
    verifyContainerCreation
} from './utils.ts';

// ============================================
// Logging Functions
// ============================================

/**
 * Logging utilities for the library
 * Uses debug package under the hood with 'portainer-api' namespace
 */
export {
    logInfo,
    logWarn,
    logError,
    setLogger
} from '../utils/logger.ts';