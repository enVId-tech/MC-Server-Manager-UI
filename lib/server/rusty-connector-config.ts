/**
 * RustyConnector Configuration Template
 * 
 * This file demonstrates how to configure RustyConnector integration
 * Copy these settings to your environment variables or configuration system
 * when you're ready to enable RustyConnector support.
 */

// Environment Variables for RustyConnector Integration
export const RUSTY_CONNECTOR_CONFIG = {
    // Main toggle for RustyConnector integration
    RUSTY_CONNECTOR_ENABLED: 'false', // Set to 'true' to enable
    
    // Whether to fall back to standard Velocity if RustyConnector fails
    RUSTY_CONNECTOR_FALLBACK_TO_VELOCITY: 'true',
    
    // Default family name for organizing servers
    RUSTY_CONNECTOR_DEFAULT_FAMILY: 'minecraft-servers',
    
    // Load balancing strategy: ROUND_ROBIN, LEAST_CONNECTION, MOST_CONNECTION
    RUSTY_CONNECTOR_LOAD_BALANCING: 'LEAST_CONNECTION',
    
    // Whether to automatically create server families
    RUSTY_CONNECTOR_AUTO_CREATE_FAMILIES: 'true',
    
    // Whether to enable cross-server player data synchronization
    RUSTY_CONNECTOR_PLAYER_DATA_SYNC: 'true',
    
    // Path to RustyConnector plugin directory in Velocity
    RUSTY_CONNECTOR_PLUGIN_PATH: '/velocity/plugins/RustyConnector',
    
    // Connection timeout for server registration (seconds)
    RUSTY_CONNECTOR_CONNECTION_TIMEOUT: '30',
    
    // Registration timeout for new servers (seconds)
    RUSTY_CONNECTOR_REGISTRATION_TIMEOUT: '10',
    
    // Language for RustyConnector messages
    RUSTY_CONNECTOR_LANGUAGE: 'en_us'
};

// TypeScript configuration for development
export interface RustyConnectorEnvironmentConfig {
    enabled: boolean;
    fallbackToVelocity: boolean;
    defaultFamily: string;
    loadBalancingStrategy: 'ROUND_ROBIN' | 'LEAST_CONNECTION' | 'MOST_CONNECTION';
    autoCreateFamilies: boolean;
    enablePlayerDataSync: boolean;
    pluginPath: string;
    connectionTimeout: number;
    registrationTimeout: number;
    language: string;
}

// Function to parse environment variables into typed configuration
export function parseRustyConnectorConfig(): RustyConnectorEnvironmentConfig {
    return {
        enabled: process.env.RUSTY_CONNECTOR_ENABLED === 'true',
        fallbackToVelocity: process.env.RUSTY_CONNECTOR_FALLBACK_TO_VELOCITY !== 'false',
        defaultFamily: process.env.RUSTY_CONNECTOR_DEFAULT_FAMILY || 'minecraft-servers',
        loadBalancingStrategy: (process.env.RUSTY_CONNECTOR_LOAD_BALANCING as unknown as 'ROUND_ROBIN' | 'LEAST_CONNECTION' | 'MOST_CONNECTION') || 'LEAST_CONNECTION',
        autoCreateFamilies: process.env.RUSTY_CONNECTOR_AUTO_CREATE_FAMILIES !== 'false',
        enablePlayerDataSync: process.env.RUSTY_CONNECTOR_PLAYER_DATA_SYNC !== 'false',
        pluginPath: process.env.RUSTY_CONNECTOR_PLUGIN_PATH || '/velocity/plugins/RustyConnector',
        connectionTimeout: parseInt(process.env.RUSTY_CONNECTOR_CONNECTION_TIMEOUT || '30'),
        registrationTimeout: parseInt(process.env.RUSTY_CONNECTOR_REGISTRATION_TIMEOUT || '10'),
        language: process.env.RUSTY_CONNECTOR_LANGUAGE || 'en_us'
    };
}

// Example .env file content (commented out)
/*
# RustyConnector Configuration
# Enable RustyConnector integration for dynamic server management
RUSTY_CONNECTOR_ENABLED=false

# Fallback to standard Velocity if RustyConnector fails
RUSTY_CONNECTOR_FALLBACK_TO_VELOCITY=true

# Default server family for organization
RUSTY_CONNECTOR_DEFAULT_FAMILY=minecraft-servers

# Load balancing strategy
RUSTY_CONNECTOR_LOAD_BALANCING=LEAST_CONNECTION

# Automatically create server families
RUSTY_CONNECTOR_AUTO_CREATE_FAMILIES=true

# Enable cross-server player data sync
RUSTY_CONNECTOR_PLAYER_DATA_SYNC=true

# RustyConnector plugin path
RUSTY_CONNECTOR_PLUGIN_PATH=/velocity/plugins/RustyConnector

# Connection timeouts
RUSTY_CONNECTOR_CONNECTION_TIMEOUT=30
RUSTY_CONNECTOR_REGISTRATION_TIMEOUT=10

# Language
RUSTY_CONNECTOR_LANGUAGE=en_us
*/

// Example Docker Compose environment section
/*
environment:
  # ... other environment variables ...
  
  # RustyConnector Integration
  RUSTY_CONNECTOR_ENABLED: "false"
  RUSTY_CONNECTOR_FALLBACK_TO_VELOCITY: "true"
  RUSTY_CONNECTOR_DEFAULT_FAMILY: "minecraft-servers"
  RUSTY_CONNECTOR_LOAD_BALANCING: "LEAST_CONNECTION"
  RUSTY_CONNECTOR_AUTO_CREATE_FAMILIES: "true"
  RUSTY_CONNECTOR_PLAYER_DATA_SYNC: "true"
  RUSTY_CONNECTOR_PLUGIN_PATH: "/velocity/plugins/RustyConnector"
  RUSTY_CONNECTOR_CONNECTION_TIMEOUT: "30"
  RUSTY_CONNECTOR_REGISTRATION_TIMEOUT: "10"
  RUSTY_CONNECTOR_LANGUAGE: "en_us"
*/

// Installation instructions (as comments)
/*
# RustyConnector Installation Instructions

## Prerequisites
1. Velocity proxy server running
2. Appropriate permissions to modify Velocity plugins
3. Network access between Velocity and Minecraft servers

## Installation Steps

### 1. Download RustyConnector Plugin
- Download the latest RustyConnector plugin for Velocity
- Place the .jar file in your Velocity plugins directory
- Restart Velocity to load the plugin

### 2. Configure Environment Variables
- Set RUSTY_CONNECTOR_ENABLED=true in your environment
- Configure other settings as needed (see examples above)
- Restart your MinecraftServerCreator application

### 3. Server Type Specific Setup

#### Paper/Purpur Servers
- No additional mods required
- Uses native Velocity support
- Modern forwarding recommended

#### Fabric Servers
- Install FabricProxy-Lite mod on server
- Configure config/fabricproxy-lite.toml
- Optional: VelocityForward for modern forwarding

#### Forge/NeoForge Servers
- Install BungeeForward or similar proxy mod
- Configure proxy settings in mod config
- Legacy forwarding typically required

### 4. Verification
- Check Velocity console for RustyConnector startup messages
- Verify plugin loads without errors
- Test server registration through the web interface

## Troubleshooting

### Common Issues
1. Plugin not loading: Check Velocity version compatibility
2. Server registration fails: Verify network connectivity
3. Forwarding not working: Check mod installation and configuration

### Logs to Check
- Velocity proxy logs for RustyConnector messages
- Individual server logs for connection attempts
- MinecraftServerCreator application logs for integration errors

## Benefits of RustyConnector
- Add/remove servers without proxy restart
- Dynamic load balancing
- Server families for organization
- Cross-server player data synchronization
- Better performance than static configuration
*/
