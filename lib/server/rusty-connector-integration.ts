import rustyConnectorService, { RustyConnectorServerConfig } from './rusty-connector';
import { generateRustyConnectorConfig, validateRustyConnectorCompatibility, RUSTY_CONNECTOR_SERVER_TYPES } from './rusty-connector-types';
import { VelocityServerConfig } from './velocity';

/**
 * Integration layer between RustyConnector and the existing server deployment system
 * This file provides the bridge between the main application and RustyConnector functionality
 */

export interface RustyConnectorIntegrationConfig {
    enabled: boolean;
    fallbackToVelocity: boolean; // Whether to fall back to standard Velocity if RustyConnector fails
    autoCreateFamilies: boolean; // Whether to automatically create server families
    defaultFamily: string; // Default family name for new servers
    loadBalancingStrategy: 'ROUND_ROBIN' | 'LEAST_CONNECTION' | 'MOST_CONNECTION';
    enablePlayerDataSync: boolean; // Whether to enable cross-server player data synchronization
}

export class RustyConnectorIntegration {
    private config: RustyConnectorIntegrationConfig;
    
    constructor(config: RustyConnectorIntegrationConfig = {
        enabled: false, // Disabled by default until explicitly enabled
        fallbackToVelocity: true,
        autoCreateFamilies: true,
        defaultFamily: 'minecraft-servers',
        loadBalancingStrategy: 'LEAST_CONNECTION',
        enablePlayerDataSync: true
    }) {
        this.config = config;
    }
    
    /**
     * Deploy a server with RustyConnector integration
     * This method would be called instead of the standard Velocity integration
     */
    async deployServerWithRustyConnector(
        serverConfig: VelocityServerConfig,
        serverType: 'PAPER' | 'PURPUR' | 'NEOFORGE' | 'FORGE' | 'FABRIC'
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        const details: string[] = [];
        
        if (!this.config.enabled) {
            return {
                success: false,
                error: 'RustyConnector integration is not enabled',
                details: ['Enable RustyConnector integration in configuration to use this feature']
            };
        }
        
        try {
            // Convert VelocityServerConfig to RustyConnectorServerConfig
            const rustyConnectorConfig: RustyConnectorServerConfig = {
                ...serverConfig,
                families: [this.config.defaultFamily],
                playerCap: 100, // Default, will be adjusted based on server type
                restricted: false,
                whitelist: [],
                softCap: 80,
                priority: 5,
                rustConnectionTimeout: 30
            };
            
            // Generate and validate configuration for the server type
            const configResult = generateRustyConnectorConfig(
                serverType,
                rustyConnectorConfig,
                this.config.defaultFamily
            );
            
            details.push(...configResult.recommendations);
            
            if (configResult.warnings.length > 0) {
                details.push('Warnings:');
                details.push(...configResult.warnings);
            }
            
            // Validate compatibility
            const validation = validateRustyConnectorCompatibility(serverType, configResult.serverConfig);
            
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Server configuration validation failed: ${validation.errors.join(', ')}`,
                    details: [...details, ...validation.errors, ...validation.warnings, ...validation.suggestions]
                };
            }
            
            if (validation.warnings.length > 0) {
                details.push('Validation warnings:');
                details.push(...validation.warnings);
            }
            
            if (validation.suggestions.length > 0) {
                details.push('Suggestions:');
                details.push(...validation.suggestions);
            }
            
            // Initialize RustyConnector if not already done
            const initResult = await rustyConnectorService.initializeRustyConnector();
            if (!initResult.success) {
                if (this.config.fallbackToVelocity) {
                    details.push('RustyConnector initialization failed, falling back to standard Velocity');
                    return { success: true, details: [...details, 'Using standard Velocity configuration instead'] };
                } else {
                    return {
                        success: false,
                        error: initResult.error,
                        details: [...details, ...initResult.details]
                    };
                }
            }
            
            details.push(...initResult.details);
            
            // Configure the server for RustyConnector
            const serverConfigResult = await rustyConnectorService.configureServerForRustyConnector(
                configResult.serverConfig,
                serverType
            );
            
            if (!serverConfigResult.success) {
                if (this.config.fallbackToVelocity) {
                    details.push('Server configuration failed, falling back to standard Velocity');
                    return { success: true, details: [...details, 'Using standard Velocity configuration instead'] };
                } else {
                    return {
                        success: false,
                        error: serverConfigResult.error,
                        details: [...details, ...serverConfigResult.details]
                    };
                }
            }
            
            details.push(...serverConfigResult.details);
            
            // Add server to RustyConnector
            const addResult = await rustyConnectorService.addServerToRustyConnector(configResult.serverConfig);
            
            if (!addResult.success) {
                if (this.config.fallbackToVelocity) {
                    details.push('Failed to add server to RustyConnector, falling back to standard Velocity');
                    return { success: true, details: [...details, 'Using standard Velocity configuration instead'] };
                } else {
                    return {
                        success: false,
                        error: addResult.error,
                        details: [...details, ...addResult.details]
                    };
                }
            }
            
            details.push(...addResult.details);
            details.push('Server successfully deployed with RustyConnector integration');
            
            return { success: true, details };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            if (this.config.fallbackToVelocity) {
                details.push(`RustyConnector deployment failed: ${errorMessage}`);
                details.push('Falling back to standard Velocity configuration');
                return { success: true, details };
            } else {
                return {
                    success: false,
                    error: errorMessage,
                    details: [...details, 'RustyConnector deployment failed']
                };
            }
        }
    }
    
    /**
     * Remove a server from RustyConnector
     */
    async removeServerFromRustyConnector(
        serverName: string
    ): Promise<{ success: boolean; error?: string; details: string[] }> {
        if (!this.config.enabled) {
            return {
                success: true,
                details: ['RustyConnector integration is not enabled, nothing to remove']
            };
        }
        
        return await rustyConnectorService.removeServerFromRustyConnector(serverName);
    }
    
    /**
     * Get server type configuration information
     */
    getServerTypeInfo(serverType: keyof typeof RUSTY_CONNECTOR_SERVER_TYPES) {
        const typeConfig = RUSTY_CONNECTOR_SERVER_TYPES[serverType];
        
        if (!typeConfig) {
            return {
                supported: false,
                error: `Server type ${serverType} is not supported by RustyConnector`
            };
        }
        
        return {
            supported: true,
            type: typeConfig.type,
            requiresProxy: typeConfig.requiresProxy,
            supportedForwardingModes: typeConfig.supportedForwardingModes,
            requiredMods: typeConfig.requiredMods || [],
            optionalMods: typeConfig.optionalMods || [],
            configurationFiles: typeConfig.configurationFiles,
            specialInstructions: typeConfig.specialInstructions || []
        };
    }
    
    /**
     * Check if RustyConnector integration is available and properly configured
     */
    async checkRustyConnectorAvailability(): Promise<{
        available: boolean;
        configured: boolean;
        error?: string;
        details: string[];
    }> {
        // ...existing code...
        
        if (!this.config.enabled) {
            return {
                available: false,
                configured: false,
                details: ['RustyConnector integration is disabled in configuration']
            };
        }
        
        try {
            const initResult = await rustyConnectorService.initializeRustyConnector();
            
            return {
                available: true,
                configured: initResult.success,
                error: initResult.error,
                details: initResult.details
            };
        } catch (error) {
            return {
                available: false,
                configured: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: ['Failed to check RustyConnector availability']
            };
        }
    }
    
    /**
     * Update integration configuration
     */
    updateConfiguration(newConfig: Partial<RustyConnectorIntegrationConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }
    
    /**
     * Get current integration configuration
     */
    getConfiguration(): RustyConnectorIntegrationConfig {
        return { ...this.config };
    }
    
    /**
     * Generate deployment report for a server type
     */
    generateDeploymentReport(
        serverType: keyof typeof RUSTY_CONNECTOR_SERVER_TYPES,
        serverConfig: VelocityServerConfig
    ): {
        compatible: boolean;
        recommendations: string[];
        warnings: string[];
        requiredMods: string[];
        optionalMods: string[];
        configurationSteps: string[];
    } {
        const typeInfo = this.getServerTypeInfo(serverType);
        
        if (!typeInfo.supported) {
            return {
                compatible: false,
                recommendations: [],
                warnings: [typeInfo.error || 'Server type not supported'],
                requiredMods: [],
                optionalMods: [],
                configurationSteps: []
            };
        }
        
        const rustyConfig: RustyConnectorServerConfig = {
            ...serverConfig,
            families: [this.config.defaultFamily],
            playerCap: 100,
            restricted: false,
            whitelist: [],
            softCap: 80,
            priority: 5,
            rustConnectionTimeout: 30
        };
        
        const configResult = generateRustyConnectorConfig(serverType, rustyConfig, this.config.defaultFamily);
        const validation = validateRustyConnectorCompatibility(serverType, configResult.serverConfig);
        
        const configurationSteps = [
            'Install RustyConnector plugin on Velocity proxy',
            'Configure server.properties for proxy support',
            ...(typeInfo.configurationFiles || []).map(file => `Configure ${file}`),
            'Add server to RustyConnector configuration',
            'Reload RustyConnector without restarting proxy'
        ];
        
        if ((typeInfo.requiredMods || []).length > 0) {
            configurationSteps.splice(2, 0, `Install required mods: ${(typeInfo.requiredMods || []).join(', ')}`);
        }
        
        return {
            compatible: validation.isValid,
            recommendations: [...configResult.recommendations, ...validation.suggestions],
            warnings: [...configResult.warnings, ...validation.warnings],
            requiredMods: typeInfo.requiredMods || [],
            optionalMods: typeInfo.optionalMods || [],
            configurationSteps
        };
    }
}

// Export singleton instance (disabled by default)
export const rustyConnectorIntegration = new RustyConnectorIntegration();

// Export types and utilities
export * from './rusty-connector';
export * from './rusty-connector-types';
