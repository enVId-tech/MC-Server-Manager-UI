/**
 * Comprehensive server.properties configuration data
 * Organized by Minecraft version with property definitions, types, and valid values
 */

export type PropertyType = 'boolean' | 'string' | 'number' | 'select' | 'multiselect';

export interface PropertyDefinition {
  key: string;
  displayName: string;
  description: string;
  type: PropertyType;
  defaultValue: string | number | boolean;
  validValues?: (string | number)[];
  min?: number;
  max?: number;
  placeholder?: string;
  category: 'general' | 'world' | 'network' | 'performance' | 'gameplay' | 'advanced';
  serverManaged?: boolean; // If true, this property is filled server-side only
  clientEditable?: boolean; // If false, client cannot modify this field
  versionIntroduced?: string; // Minimum version where this property was introduced
  versionRemoved?: string; // Version where this property was removed (if any)
}

export interface VersionProperties {
  version: string;
  properties: PropertyDefinition[];
}

// Common property definitions that are consistent across versions
const commonProperties: PropertyDefinition[] = [
  // General Server Settings
  {
    key: 'motd',
    displayName: 'Server Description (MOTD)',
    description: 'The message displayed in the server list',
    type: 'string',
    defaultValue: 'A Minecraft Server',
    placeholder: 'Welcome to our Minecraft server!',
    category: 'general'
  },
  {
    key: 'server-port',
    displayName: 'Server Port',
    description: 'The port that the server listens on',
    type: 'number',
    defaultValue: 25565,
    min: 1024,
    max: 65535,
    category: 'network'
  },
  {
    key: 'online-mode',
    displayName: 'Online Mode',
    description: 'Enable online authentication with Mojang servers',
    type: 'boolean',
    defaultValue: true,
    category: 'general'
  },
  {
    key: 'max-players',
    displayName: 'Maximum Players',
    description: 'Maximum number of players that can join',
    type: 'number',
    defaultValue: 20,
    min: 1,
    max: 100,
    category: 'general'
  },
  
  // World Settings
  {
    key: 'gamemode',
    displayName: 'Default Game Mode',
    description: 'Default game mode for new players',
    type: 'select',
    defaultValue: 'survival',
    validValues: ['survival', 'creative', 'adventure', 'spectator'],
    category: 'world'
  },
  {
    key: 'difficulty',
    displayName: 'Difficulty',
    description: 'Game difficulty level',
    type: 'select',
    defaultValue: 'normal',
    validValues: ['peaceful', 'easy', 'normal', 'hard'],
    category: 'world'
  },
  {
    key: 'level-type',
    displayName: 'World Type',
    description: 'Type of world to generate',
    type: 'select',
    defaultValue: 'minecraft:normal',
    validValues: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'],
    category: 'world'
  },
  {
    key: 'level-seed',
    displayName: 'World Seed',
    description: 'Seed for world generation (leave empty for random)',
    type: 'string',
    defaultValue: '',
    placeholder: 'Enter a seed or leave empty',
    category: 'world'
  },
  {
    key: 'level-name',
    displayName: 'World Name',
    description: 'Name of the main world folder',
    type: 'string',
    defaultValue: 'world',
    category: 'world'
  },
  {
    key: 'generate-structures',
    displayName: 'Generate Structures',
    description: 'Generate villages, dungeons, etc.',
    type: 'boolean',
    defaultValue: true,
    category: 'world'
  },
  
  // Gameplay Settings
  {
    key: 'pvp',
    displayName: 'Player vs Player',
    description: 'Enable player vs player combat',
    type: 'boolean',
    defaultValue: true,
    category: 'gameplay'
  },
  {
    key: 'spawn-animals',
    displayName: 'Spawn Animals',
    description: 'Allow animals to spawn naturally',
    type: 'boolean',
    defaultValue: true,
    category: 'gameplay'
  },
  {
    key: 'spawn-monsters',
    displayName: 'Spawn Monsters',
    description: 'Allow monsters to spawn naturally',
    type: 'boolean',
    defaultValue: true,
    category: 'gameplay'
  },
  {
    key: 'spawn-npcs',
    displayName: 'Spawn NPCs',
    description: 'Allow NPCs (villagers) to spawn',
    type: 'boolean',
    defaultValue: true,
    category: 'gameplay'
  },
  {
    key: 'allow-flight',
    displayName: 'Allow Flight',
    description: 'Allow players to fly in survival mode',
    type: 'boolean',
    defaultValue: false,
    category: 'gameplay'
  },
  {
    key: 'enable-command-block',
    displayName: 'Enable Command Blocks',
    description: 'Allow command blocks to function',
    type: 'boolean',
    defaultValue: false,
    category: 'gameplay'
  },
  
  // Performance Settings
  {
    key: 'view-distance',
    displayName: 'View Distance',
    description: 'Maximum view distance in chunks',
    type: 'number',
    defaultValue: 10,
    min: 3,
    max: 32,
    category: 'performance'
  },
  {
    key: 'simulation-distance',
    displayName: 'Simulation Distance',
    description: 'Distance for block updates and mob spawning',
    type: 'number',
    defaultValue: 10,
    min: 3,
    max: 32,
    category: 'performance'
  },
  {
    key: 'spawn-protection',
    displayName: 'Spawn Protection Radius',
    description: 'Radius around spawn where only ops can build',
    type: 'number',
    defaultValue: 16,
    min: 0,
    max: 64,
    category: 'performance'
  },
  {
    key: 'entity-broadcast-range-percentage',
    displayName: 'Entity Broadcast Range',
    description: 'Percentage of view distance for entity updates',
    type: 'number',
    defaultValue: 100,
    min: 10,
    max: 1000,
    category: 'performance'
  },
  
  // Network Settings
  {
    key: 'server-ip',
    displayName: 'Server IP',
    description: 'IP address to bind to (leave empty for all)',
    type: 'string',
    defaultValue: '',
    placeholder: 'Leave empty to bind to all IPs',
    category: 'network'
  },
  {
    key: 'network-compression-threshold',
    displayName: 'Network Compression Threshold',
    description: 'Compress packets larger than this size',
    type: 'number',
    defaultValue: 256,
    min: -1,
    max: 2147483647,
    category: 'network'
  },
  {
    key: 'max-tick-time',
    displayName: 'Max Tick Time',
    description: 'Maximum time a tick can take before server watchdog stops it',
    type: 'number',
    defaultValue: 60000,
    min: 0,
    max: 9223372036854775807,
    category: 'performance'
  },
  
  // Advanced Settings
  {
    key: 'white-list',
    displayName: 'Enable Whitelist',
    description: 'Only allow whitelisted players to join',
    type: 'boolean',
    defaultValue: false,
    category: 'advanced'
  },
  {
    key: 'enforce-whitelist',
    displayName: 'Enforce Whitelist',
    description: 'Kick non-whitelisted players immediately',
    type: 'boolean',
    defaultValue: false,
    category: 'advanced'
  },
  {
    key: 'enable-rcon',
    displayName: 'Enable RCON',
    description: 'Enable remote console access',
    type: 'boolean',
    defaultValue: false,
    category: 'advanced'
  },
  {
    key: 'rcon.port',
    displayName: 'RCON Port',
    description: 'Port for RCON connections',
    type: 'number',
    defaultValue: 25575,
    min: 1024,
    max: 65535,
    category: 'advanced'
  },
  {
    key: 'rcon.password',
    displayName: 'RCON Password',
    description: 'Password for RCON access',
    type: 'string',
    defaultValue: '',
    placeholder: 'Enter a secure password',
    category: 'advanced'
  },
  {
    key: 'broadcast-rcon-to-ops',
    displayName: 'Broadcast RCON to Ops',
    description: 'Send RCON commands to online operators',
    type: 'boolean',
    defaultValue: true,
    category: 'advanced'
  },
  {
    key: 'broadcast-console-to-ops',
    displayName: 'Broadcast Console to Ops',
    description: 'Send console messages to online operators',
    type: 'boolean',
    defaultValue: true,
    category: 'advanced'
  },
  {
    key: 'enable-jmx-monitoring',
    displayName: 'Enable JMX Monitoring',
    description: 'Enable Java Management Extensions monitoring',
    type: 'boolean',
    defaultValue: false,
    category: 'advanced'
  },
  {
    key: 'sync-chunk-writes',
    displayName: 'Synchronous Chunk Writes',
    description: 'Force synchronous chunk writing',
    type: 'boolean',
    defaultValue: true,
    category: 'advanced'
  },
  {
    key: 'prevent-proxy-connections',
    displayName: 'Prevent Proxy Connections',
    description: 'Prevent connections through proxies',
    type: 'boolean',
    defaultValue: false,
    category: 'advanced'
  },
  {
    key: 'hide-online-players',
    displayName: 'Hide Online Players',
    description: 'Hide player list in server status',
    type: 'boolean',
    defaultValue: false,
    category: 'advanced'
  },
  
  // Server-managed properties (filled server-side only)
  {
    key: 'server-ip',
    displayName: 'Server IP Address',
    description: 'IP address the server binds to (managed by server)',
    type: 'string',
    defaultValue: '',
    serverManaged: true,
    clientEditable: false,
    category: 'network'
  },
  {
    key: 'query.port',
    displayName: 'Query Port',
    description: 'Port for server query (auto-assigned)',
    type: 'number',
    defaultValue: 25565,
    serverManaged: true,
    clientEditable: false,
    category: 'network'
  },
  {
    key: 'enable-query',
    displayName: 'Enable Query',
    description: 'Enable GameSpy4 protocol server listener',
    type: 'boolean',
    defaultValue: false,
    serverManaged: true,
    clientEditable: false,
    category: 'network'
  },
  {
    key: 'level-name',
    displayName: 'World Name',
    description: 'Name of the world folder (managed by server)',
    type: 'string',
    defaultValue: 'world',
    serverManaged: true,
    clientEditable: false,
    category: 'world'
  },
  {
    key: 'enable-status',
    displayName: 'Enable Server Status',
    description: 'Make server appear in server list',
    type: 'boolean',
    defaultValue: true,
    serverManaged: true,
    clientEditable: false,
    category: 'network'
  },
  {
    key: 'function-permission-level',
    displayName: 'Function Permission Level',
    description: 'Permission level for functions (server managed)',
    type: 'number',
    defaultValue: 2,
    min: 1,
    max: 4,
    serverManaged: true,
    clientEditable: false,
    category: 'advanced'
  },
  {
    key: 'op-permission-level',
    displayName: 'Operator Permission Level', 
    description: 'Default permission level for operators',
    type: 'number',
    defaultValue: 4,
    min: 1,
    max: 4,
    serverManaged: true,
    clientEditable: false,
    category: 'advanced'
  }
];

// Version-specific properties (properties that were added or changed in specific versions)
const versionSpecificProperties: Record<string, PropertyDefinition[]> = {
  '1.19': [
    {
      key: 'enforce-secure-profile',
      displayName: 'Enforce Secure Profile',
      description: 'Enforce secure chat profiles',
      type: 'boolean',
      defaultValue: true,
      category: 'advanced',
      versionIntroduced: '1.19'
    },
    {
      key: 'text-filtering-config',
      displayName: 'Text Filtering Config',
      description: 'Text filtering configuration file',
      type: 'string',
      defaultValue: '',
      serverManaged: true,
      clientEditable: false,
      category: 'advanced',
      versionIntroduced: '1.19'
    }
  ],
  '1.20': [
    {
      key: 'log-ips',
      displayName: 'Log IP Addresses',
      description: 'Log player IP addresses',
      type: 'boolean',
      defaultValue: true,
      category: 'advanced',
      versionIntroduced: '1.20'
    },
    {
      key: 'initial-enabled-packs',
      displayName: 'Initial Enabled Data Packs',
      description: 'Data packs enabled on world creation',
      type: 'string',
      defaultValue: 'vanilla',
      serverManaged: true,
      clientEditable: false,
      category: 'world',
      versionIntroduced: '1.20'
    }
  ],
  '1.21': [
    {
      key: 'accepts-transfers',
      displayName: 'Accept Transfers',
      description: 'Allow server transfer packets',
      type: 'boolean',
      defaultValue: false,
      category: 'network',
      versionIntroduced: '1.21'
    },
    {
      key: 'server-links-file',
      displayName: 'Server Links File',
      description: 'Path to server links configuration',
      type: 'string',
      defaultValue: 'server-links.json',
      serverManaged: true,
      clientEditable: false,
      category: 'advanced',
      versionIntroduced: '1.21'
    }
  ]
};

// Supported Minecraft versions
export const supportedVersions = [
  '1.21.3',
  '1.21.2', 
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.5',
  '1.20.4',
  '1.20.3',
  '1.20.2',
  '1.20.1',
  '1.20',
  '1.19.4',
  '1.19.3',
  '1.19.2',
  '1.19.1',
  '1.19',
  '1.18.2',
  '1.18.1',
  '1.18',
  'latest'
];

/**
 * Parse version string for comparison
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
  if (version === 'latest') {
    return { major: 999, minor: 999, patch: 999 };
  }
  
  const cleanVersion = version.replace(/[^\d.]/g, '');
  const parts = cleanVersion.split('.').map(part => parseInt(part, 10) || 0);
  
  return {
    major: parts[0] || 1,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

/**
 * Check if a version is greater than or equal to another
 */
function isVersionGreaterOrEqual(version: string, targetVersion: string): boolean {
  const v1 = parseVersion(version);
  const v2 = parseVersion(targetVersion);
  
  if (v1.major !== v2.major) return v1.major >= v2.major;
  if (v1.minor !== v2.minor) return v1.minor >= v2.minor;
  return v1.patch >= v2.patch;
}

/**
 * Get server properties for a specific Minecraft version
 */
export function getServerPropertiesForVersion(version: string): PropertyDefinition[] {
  let properties = [...commonProperties];
  
  // Add version-specific properties based on version
  const versionNumber = parseFloat(version.replace(/[^\d.]/g, ''));
  
  if (versionNumber >= 1.19 || version === 'latest') {
    properties = properties.concat(versionSpecificProperties['1.19'] || []);
  }
  
  if (versionNumber >= 1.20 || version === 'latest') {
    properties = properties.concat(versionSpecificProperties['1.20'] || []);
  }
  
  if (versionNumber >= 1.21 || version === 'latest') {
    properties = properties.concat(versionSpecificProperties['1.21'] || []);
  }
  
  // Filter properties based on version requirements
  properties = properties.filter(prop => {
    // Check if property was introduced after the current version
    if (prop.versionIntroduced && !isVersionGreaterOrEqual(version, prop.versionIntroduced)) {
      return false;
    }
    
    // Check if property was removed before the current version
    if (prop.versionRemoved && isVersionGreaterOrEqual(version, prop.versionRemoved)) {
      return false;
    }
    
    return true;
  });
  
  // Sort properties by category for better organization
  const categoryOrder = ['general', 'world', 'gameplay', 'performance', 'network', 'advanced'];
  properties.sort((a, b) => {
    const aCategoryIndex = categoryOrder.indexOf(a.category);
    const bCategoryIndex = categoryOrder.indexOf(b.category);
    
    if (aCategoryIndex !== bCategoryIndex) {
      return aCategoryIndex - bCategoryIndex;
    }
    
    return a.displayName.localeCompare(b.displayName);
  });
  
  return properties;
}

/**
 * Get properties grouped by category
 */
export function getServerPropertiesByCategory(version: string): Record<string, PropertyDefinition[]> {
  const properties = getServerPropertiesForVersion(version);
  const grouped: Record<string, PropertyDefinition[]> = {};
  
  properties.forEach(prop => {
    if (!grouped[prop.category]) {
      grouped[prop.category] = [];
    }
    grouped[prop.category].push(prop);
  });
  
  return grouped;
}

/**
 * Convert server properties to server.properties file format
 */
export function convertToServerPropertiesFormat(properties: Record<string, string | number | boolean>): string {
  const lines: string[] = [];
  
  Object.entries(properties).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      lines.push(`${key}=${value}`);
    }
  });
  
  return lines.join('\n');
}

/**
 * Validate a property value
 */
export function validatePropertyValue(property: PropertyDefinition, value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null; // Allow empty values for optional properties
  }
  
  switch (property.type) {
    case 'number':
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return `${property.displayName} must be a valid number`;
      }
      if (property.min !== undefined && numValue < property.min) {
        return `${property.displayName} must be at least ${property.min}`;
      }
      if (property.max !== undefined && numValue > property.max) {
        return `${property.displayName} must be at most ${property.max}`;
      }
      break;
      
    case 'select':
      if (property.validValues && !property.validValues.includes(value as string | number)) {
        return `${property.displayName} must be one of: ${property.validValues.join(', ')}`;
      }
      break;
      
    case 'boolean':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        return `${property.displayName} must be true or false`;
      }
      break;
  }
  
  return null;
}

/**
 * Get default properties for a specific version with their default values
 */
export function getDefaultPropertiesForVersion(version: string): Record<string, string | number | boolean> {
  const propertiesByCategory = getServerPropertiesByCategory(version);
  const defaultProperties: Record<string, string | number | boolean> = {};
  
  // Collect all properties from all categories
  Object.values(propertiesByCategory).flat().forEach(property => {
    defaultProperties[property.key] = property.defaultValue;
  });
  
  return defaultProperties;
}
