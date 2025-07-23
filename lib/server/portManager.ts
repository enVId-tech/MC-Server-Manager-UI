import dbConnect from '@/lib/db/dbConnect';
import User from '@/lib/objects/User';
import Server from '@/lib/objects/Server';
import portainer from '@/lib/server/portainer';
import { 
  PORT_RANGES, 
  getImportantPortNumbers, 
  isImportantPort, 
  getPortDescription,
  getPortReservationReason
} from '@/lib/config/portConfig';

export interface PortAllocationResult {
  success: boolean;
  port?: number;
  rconPort?: number;
  error?: string;
  details?: string[];
}

export interface PortReservationRange {
  start: number;
  end: number;
  description?: string;
}

export interface PortAvailabilityCheck {
  port: number;
  available: boolean;
  reason?: string;
  conflictType?: 'container' | 'database' | 'important' | 'reserved_range' | 'user_reserved';
}

/**
 * Advanced Port Management Service
 * Handles all port allocation logic with comprehensive conflict checking
 */
export class PortManager {
  
  /**
   * Check if a port is available considering all constraints
   */
  static async isPortAvailable(
    port: number, 
    userEmail: string, 
    environmentId: number,
    excludeServerId?: string
  ): Promise<PortAvailabilityCheck> {
    try {
      await dbConnect();

      // 1. Check if port is an important/system port
      if (isImportantPort(port)) {
        return {
          port,
          available: false,
          reason: `Port ${port} is reserved: ${getPortDescription(port)} - ${getPortReservationReason(port)}`,
          conflictType: 'important'
        };
      }

      // 2. Check if port is being used by containers
      const containerUsedPorts = await portainer.getUsedPorts(environmentId);
      if (containerUsedPorts.includes(port)) {
        return {
          port,
          available: false,
          reason: `Port ${port} is currently in use by a container`,
          conflictType: 'container'
        };
      }

      // 3. Check if port is recorded in database (excluding current server if specified)
      const dbQuery = excludeServerId 
        ? { $or: [{ port }, { rconPort: port }], uniqueId: { $ne: excludeServerId } }
        : { $or: [{ port }, { rconPort: port }] };
      
      const existingServer = await Server.findOne(dbQuery);
      if (existingServer) {
        return {
          port,
          available: false,
          reason: `Port ${port} is allocated to server: ${existingServer.serverName} (${existingServer.uniqueId})`,
          conflictType: 'database'
        };
      }

      // 4. Check if port falls within other users' reserved port ranges
      const requestingUser = await User.findOne({ email: userEmail });
      if (!requestingUser) {
        return {
          port,
          available: false,
          reason: 'User not found',
          conflictType: 'database'
        };
      }

      // Get all users with reserved port ranges
      const usersWithReservedRanges = await User.find({ 
        reservedPortRanges: { $exists: true, $ne: [] },
        email: { $ne: userEmail } // Exclude the requesting user
      });

      for (const user of usersWithReservedRanges) {
        if (user.reservedPortRanges) {
          for (const range of user.reservedPortRanges) {
            if (port >= range.start && port <= range.end) {
              return {
                port,
                available: false,
                reason: `Port ${port} is within reserved range ${range.start}-${range.end} for user: ${user.email}`,
                conflictType: 'reserved_range'
              };
            }
          }
        }
      }

      // 5. Port is available
      return {
        port,
        available: true,
        reason: 'Port is available'
      };

    } catch (error) {
      return {
        port,
        available: false,
        reason: `Error checking port availability: ${error instanceof Error ? error.message : 'Unknown error'}`,
        conflictType: 'database'
      };
    }
  }

  /**
   * Allocate a port for a user with all safety checks
   */
  static async allocatePort(
    userEmail: string, 
    needsRcon: boolean = false, 
    environmentId: number = 1,
    preferredPort?: number
  ): Promise<PortAllocationResult> {
    try {
      await dbConnect();
      const details: string[] = [];

      const user = await User.findOne({ email: userEmail });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      details.push(`Allocating port for user: ${userEmail}`);
      details.push(`RCON required: ${needsRcon}`);
      details.push(`Environment ID: ${environmentId}`);

      // If user specified a preferred port, try that first
      if (preferredPort) {
        details.push(`Checking preferred port: ${preferredPort}`);
        const preferredCheck = await this.isPortAvailable(preferredPort, userEmail, environmentId);
        
        if (preferredCheck.available) {
          let rconPort: number | undefined;
          
          if (needsRcon) {
            rconPort = await this.findAvailableRconPort(preferredPort, userEmail, environmentId);
            if (!rconPort) {
              details.push(`Preferred port ${preferredPort} available but no RCON port found`);
              // Continue to automatic allocation
            } else {
              details.push(`Allocated preferred port ${preferredPort} with RCON port ${rconPort}`);
              return { success: true, port: preferredPort, rconPort, details };
            }
          } else {
            details.push(`Allocated preferred port: ${preferredPort}`);
            return { success: true, port: preferredPort, details };
          }
        } else {
          details.push(`Preferred port ${preferredPort} not available: ${preferredCheck.reason}`);
        }
      }

      // Try user's individual reserved ports first
      if (user.reservedPorts && user.reservedPorts.length > 0) {
        details.push(`Checking user's reserved ports: [${user.reservedPorts.join(', ')}]`);
        
        for (const reservedPort of user.reservedPorts) {
          const check = await this.isPortAvailable(reservedPort, userEmail, environmentId);
          
          if (check.available) {
            let rconPort: number | undefined;
            
            if (needsRcon) {
              rconPort = await this.findAvailableRconPort(reservedPort, userEmail, environmentId);
              if (!rconPort) {
                details.push(`Reserved port ${reservedPort} available but no RCON port found`);
                continue;
              }
            }
            
            details.push(`Allocated reserved port: ${reservedPort}${rconPort ? ` with RCON: ${rconPort}` : ''}`);
            return { success: true, port: reservedPort, rconPort, details };
          } else {
            details.push(`Reserved port ${reservedPort} not available: ${check.reason}`);
          }
        }
      }

      // Try user's reserved port ranges
      if (user.reservedPortRanges && user.reservedPortRanges.length > 0) {
        details.push(`Checking user's reserved port ranges`);
        
        for (const range of user.reservedPortRanges) {
          details.push(`Checking range: ${range.start}-${range.end} (${range.description || 'No description'})`);
          
          for (let port = range.start; port <= range.end; port++) {
            const check = await this.isPortAvailable(port, userEmail, environmentId);
            
            if (check.available) {
              let rconPort: number | undefined;
              
              if (needsRcon) {
                rconPort = await this.findAvailableRconPort(port, userEmail, environmentId);
                if (!rconPort) {
                  continue; // Try next port in range
                }
              }
              
              details.push(`Allocated port from reserved range: ${port}${rconPort ? ` with RCON: ${rconPort}` : ''}`);
              return { success: true, port, rconPort, details };
            }
          }
        }
      }

      // Fall back to general Minecraft server range
      details.push(`Checking general Minecraft server range: ${PORT_RANGES.MINECRAFT_SERVERS.start}-${PORT_RANGES.MINECRAFT_SERVERS.end}`);
      
      for (let port = PORT_RANGES.MINECRAFT_SERVERS.start; port <= PORT_RANGES.MINECRAFT_SERVERS.end; port++) {
        const check = await this.isPortAvailable(port, userEmail, environmentId);
        
        if (check.available) {
          let rconPort: number | undefined;
          
          if (needsRcon) {
            rconPort = await this.findAvailableRconPort(port, userEmail, environmentId);
            if (!rconPort) {
              continue; // Try next port
            }
          }
          
          details.push(`Allocated port from general range: ${port}${rconPort ? ` with RCON: ${rconPort}` : ''}`);
          return { success: true, port, rconPort, details };
        }
      }

      details.push('No available ports found in any range');
      return { 
        success: false, 
        error: 'No available ports found in the allowed ranges',
        details 
      };

    } catch (error) {
      return {
        success: false,
        error: `Error allocating port: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Find an available RCON port for a given main port
   */
  private static async findAvailableRconPort(
    mainPort: number, 
    userEmail: string, 
    environmentId: number
  ): Promise<number | undefined> {
    // Try RCON range first (preferred)
    for (let port = PORT_RANGES.MINECRAFT_RCON.start; port <= PORT_RANGES.MINECRAFT_RCON.end; port++) {
      const check = await this.isPortAvailable(port, userEmail, environmentId);
      if (check.available) {
        return port;
      }
    }

    // Try main port + 10 (traditional approach)
    const traditionalRcon = mainPort + 10;
    if (traditionalRcon <= PORT_RANGES.MINECRAFT_SERVERS.end) {
      const check = await this.isPortAvailable(traditionalRcon, userEmail, environmentId);
      if (check.available) {
        return traditionalRcon;
      }
    }

    // Try any available port in the main Minecraft range
    for (let port = PORT_RANGES.MINECRAFT_SERVERS.start; port <= PORT_RANGES.MINECRAFT_SERVERS.end; port++) {
      if (port !== mainPort) {
        const check = await this.isPortAvailable(port, userEmail, environmentId);
        if (check.available) {
          return port;
        }
      }
    }

    return undefined;
  }

  /**
   * Get a comprehensive port usage report
   */
  static async getPortUsageReport(environmentId: number): Promise<{
    totalPorts: number;
    usedPorts: number;
    availablePorts: number;
    importantPorts: number;
    containerUsedPorts: number[];
    databaseUsedPorts: number[];
    importantPortsList: number[];
    portDetails: PortAvailabilityCheck[];
  }> {
    try {
      await dbConnect();

      const containerUsedPorts = await portainer.getUsedPorts(environmentId);
      const serversWithPorts = await Server.find({}, { port: 1, rconPort: 1, serverName: 1, uniqueId: 1 });
      const databaseUsedPorts = serversWithPorts.flatMap(server =>
        [server.port, server.rconPort].filter(port => port !== undefined && port !== null)
      );

      const importantPortsList = getImportantPortNumbers();
      const allUsedPorts = [...new Set([...containerUsedPorts, ...databaseUsedPorts, ...importantPortsList])];

      const minecraftRange = PORT_RANGES.MINECRAFT_SERVERS;
      const totalPorts = minecraftRange.end - minecraftRange.start + 1;
      const usedInRange = allUsedPorts.filter(port => 
        port >= minecraftRange.start && port <= minecraftRange.end
      ).length;

      return {
        totalPorts,
        usedPorts: usedInRange,
        availablePorts: totalPorts - usedInRange,
        importantPorts: importantPortsList.length,
        containerUsedPorts,
        databaseUsedPorts,
        importantPortsList,
        portDetails: [] // Could be expanded to include detailed analysis
      };

    } catch (error) {
      throw new Error(`Failed to generate port usage report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate a user's reserved port ranges
   */
  static validateReservedPortRanges(ranges: PortReservationRange[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const range of ranges) {
      // Check if range is valid
      if (range.start > range.end) {
        errors.push(`Invalid range: start port ${range.start} is greater than end port ${range.end}`);
      }

      // Check if range conflicts with important ports
      for (let port = range.start; port <= range.end; port++) {
        if (isImportantPort(port)) {
          errors.push(`Range ${range.start}-${range.end} conflicts with important port ${port}: ${getPortDescription(port)}`);
        }
      }

      // Check if range is within allowed bounds
      const maxAllowedPort = 65535;
      const minAllowedPort = 1024; // Avoid system ports
      
      if (range.start < minAllowedPort || range.end > maxAllowedPort) {
        errors.push(`Range ${range.start}-${range.end} is outside allowed bounds (${minAllowedPort}-${maxAllowedPort})`);
      }
    }

    // Check for overlapping ranges
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const range1 = ranges[i];
        const range2 = ranges[j];
        
        if (range1.start <= range2.end && range2.start <= range1.end) {
          errors.push(`Ranges overlap: ${range1.start}-${range1.end} and ${range2.start}-${range2.end}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default PortManager;
