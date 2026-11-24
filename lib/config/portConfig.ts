/**
 * Port Configuration
 * This file defines system-wide port restrictions and reservations
 */

export interface PortRange {
  start: number;
  end: number;
  description: string;
}

export interface ImportantPort {
  port: number;
  description: string;
  reason: string;
}

/**
 * Important ports that should NEVER be allocated to containers
 * These are system-critical or commonly used ports
 */
export const IMPORTANT_PORTS: ImportantPort[] = [
  { port: 25565, description: 'Default Minecraft Server Port', reason: 'Default Minecraft port - reserved for direct access' },
  { port: 3306, description: 'MySQL Database', reason: 'Database connections' },
  { port: 5432, description: 'PostgreSQL Database', reason: 'Database connections' },
  { port: 6379, description: 'Redis Cache', reason: 'Cache server' },
  { port: 9000, description: 'Portainer', reason: 'Container management' },
  { port: 9443, description: 'Portainer HTTPS', reason: 'Secure container management' },
  { port: 8080, description: 'HTTP Alternative', reason: 'Common web service port' },
  { port: 8443, description: 'HTTPS Alternative', reason: 'Common secure web service port' },
  { port: 3000, description: 'Node.js Development', reason: 'Common development port' },
  { port: 5000, description: 'Flask/Development', reason: 'Common development port' },
  { port: 27017, description: 'MongoDB', reason: 'NoSQL database' },
  { port: 30001, description: 'WebDAV Service', reason: 'File management service' },
];

/**
 * Default port ranges for different environments
 */
export const PORT_RANGES = {
  MINECRAFT_SERVERS: { start: 25566, end: 25999 }, // Main range for Minecraft servers, filled upwards from the port after the default one
  MINECRAFT_RCON: { start: 35566, end: 35999 }, // RCON ports
  VELOCITY_PROXY: { start: 25500, end: 25564 }, // Velocity proxy servers
  DEVELOPMENT: { start: 26000, end: 26999 }, // Development/testing
  SYSTEM_RESERVED: { start: 1, end: 1023 }, // System reserved ports
  EPHEMERAL: { start: 49152, end: 65535 }, // Ephemeral ports
} as const;

/**
 * Get all important port numbers as an array
 */
export function getImportantPortNumbers(): number[] {
  return IMPORTANT_PORTS.map(p => p.port);
}

/**
 * Check if a port is considered important/reserved
 */
export function isImportantPort(port: number): boolean {
  return IMPORTANT_PORTS.some(p => p.port === port);
}

/**
 * Get description for an important port
 */
export function getPortDescription(port: number): string | undefined {
  const importantPort = IMPORTANT_PORTS.find(p => p.port === port);
  return importantPort?.description;
}

export const RESTRICTED_SERVICE_PORTS: ImportantPort[] = [
  { port: 19132, description: 'Bedrock / Geyser Port', reason: 'Reserved for Bedrock proxy connections' },
  { port: 25575, description: 'Default Minecraft RCON Port', reason: 'Reserved for default RCON fallback' },
];

/**
 * Get reason why a port is reserved
 */
export function getPortReservationReason(port: number): string | undefined {
  const importantPort = IMPORTANT_PORTS.find(p => p.port === port) ?? RESTRICTED_SERVICE_PORTS.find(p => p.port === port);
  return importantPort?.reason;
}

/**
 * True when a port must never be allocated to a backend game server (system ports, proxy range including 25565,
 * important service ports, Bedrock/RCON defaults, or ephemeral dynamic ports).
 */
export function isRestrictedPort(port: number): boolean {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return true;
  if (port >= PORT_RANGES.EPHEMERAL.start) return true;
  if (port >= PORT_RANGES.VELOCITY_PROXY.start && port <= 25565) return true;
  if (RESTRICTED_SERVICE_PORTS.some(p => p.port === port)) return true;
  return isImportantPort(port);
}

/** Human-readable explanation when `isRestrictedPort(port)` is true */
export function getRestrictedPortReason(port: number): string | undefined {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return `Port ${port} is outside valid port bounds (1-65535)`;
  if (port < 1024) return `Port ${port} is a system privileged port (1-1023)`;
  if (port >= PORT_RANGES.EPHEMERAL.start) return `Port ${port} is inside the ephemeral port range (${PORT_RANGES.EPHEMERAL.start}-65535)`;
  if (isImportantPort(port)) return `Port ${port} is reserved: ${getPortDescription(port)} - ${getPortReservationReason(port)}`;
  if (port >= PORT_RANGES.VELOCITY_PROXY.start && port <= PORT_RANGES.VELOCITY_PROXY.end) {
    return `Port ${port} is reserved for Velocity/proxy instances (${PORT_RANGES.VELOCITY_PROXY.start}-${PORT_RANGES.VELOCITY_PROXY.end})`;
  }
  const extra = RESTRICTED_SERVICE_PORTS.find(p => p.port === port);
  if (extra) return `Port ${port} is reserved: ${extra.description} - ${extra.reason}`;
  return undefined;
}

/**
 * Check if a port is within a range
 */
export function isPortInRange(port: number, range: { start: number; end: number }): boolean {
  return port >= range.start && port <= range.end;
}

/**
 * Get all ports in a range
 */
export function getPortsInRange(range: { start: number; end: number }): number[] {
  const ports: number[] = [];
  for (let port = range.start; port <= range.end; port++) {
    ports.push(port);
  }
  return ports;
}

/**
 * Validate port configuration
 */
export function validatePortConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for overlapping ranges
  const ranges = Object.values(PORT_RANGES);
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const range1 = ranges[i];
      const range2 = ranges[j];
      
      if (range1.start <= range2.end && range2.start <= range1.end) {
        errors.push(`Port ranges overlap: ${JSON.stringify(range1)} and ${JSON.stringify(range2)}`);
      }
    }
  }
  
  // Check if important ports conflict with ranges
  for (const importantPort of IMPORTANT_PORTS) {
    for (const [rangeName, range] of Object.entries(PORT_RANGES)) {
      if (isPortInRange(importantPort.port, range)) {
        errors.push(`Important port ${importantPort.port} conflicts with ${rangeName} range`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
