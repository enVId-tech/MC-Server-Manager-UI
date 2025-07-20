/**
 * Utility functions for Minecraft version detection and comparison
 */

export interface VersionComparison {
  isNewer: boolean;
  isOlder: boolean;
  isSame: boolean;
  majorDifference: number;
  minorDifference: number;
}

/**
 * Parse Minecraft version string into comparable format
 */
export function parseMinecraftVersion(version: string): { major: number; minor: number; patch: number } {
  // Handle special versions
  if (version === 'latest') {
    return { major: 999, minor: 999, patch: 999 };
  }

  // Remove any prefixes and clean the version string
  const cleanVersion = version.replace(/^(minecraft:?|mc:?|v)/i, '');
  
  // Split into parts and convert to numbers
  const parts = cleanVersion.split('.').map(part => {
    const num = parseInt(part.replace(/[^\d]/g, ''), 10);
    return isNaN(num) ? 0 : num;
  });

  return {
    major: parts[0] || 1,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

/**
 * Compare two Minecraft versions
 */
export function compareVersions(version1: string, version2: string): VersionComparison {
  const v1 = parseMinecraftVersion(version1);
  const v2 = parseMinecraftVersion(version2);

  const majorDiff = v1.major - v2.major;
  const minorDiff = v1.minor - v2.minor;
  const patchDiff = v1.patch - v2.patch;

  let isNewer = false;
  let isOlder = false;
  let isSame = false;

  if (majorDiff > 0) {
    isNewer = true;
  } else if (majorDiff < 0) {
    isOlder = true;
  } else {
    // Same major version, check minor
    if (minorDiff > 0) {
      isNewer = true;
    } else if (minorDiff < 0) {
      isOlder = true;
    } else {
      // Same major and minor, check patch
      if (patchDiff > 0) {
        isNewer = true;
      } else if (patchDiff < 0) {
        isOlder = true;
      } else {
        isSame = true;
      }
    }
  }

  return {
    isNewer,
    isOlder,
    isSame,
    majorDifference: majorDiff,
    minorDifference: minorDiff
  };
}

/**
 * Check if a version upgrade/downgrade is considered safe
 */
export function isVersionChangeSafe(fromVersion: string, toVersion: string): {
  isSafe: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme';
  reason: string;
} {
  const comparison = compareVersions(toVersion, fromVersion);

  if (comparison.isSame) {
    return {
      isSafe: true,
      riskLevel: 'none',
      reason: 'Versions are identical'
    };
  }

  if (comparison.isOlder) {
    // Downgrade
    const majorDiff = Math.abs(comparison.majorDifference);
    const minorDiff = Math.abs(comparison.minorDifference);

    if (majorDiff > 0) {
      return {
        isSafe: false,
        riskLevel: 'extreme',
        reason: 'Major version downgrade - will cause severe corruption'
      };
    }

    if (minorDiff > 2) {
      return {
        isSafe: false,
        riskLevel: 'high',
        reason: 'Large minor version downgrade - high risk of data loss'
      };
    }

    if (minorDiff > 0) {
      return {
        isSafe: false,
        riskLevel: 'medium',
        reason: 'Minor version downgrade - moderate risk'
      };
    }

    return {
      isSafe: false,
      riskLevel: 'low',
      reason: 'Patch version downgrade - low risk'
    };
  }

  if (comparison.isNewer) {
    // Upgrade
    const majorDiff = comparison.majorDifference;
    const minorDiff = comparison.minorDifference;

    if (majorDiff > 1) {
      return {
        isSafe: false,
        riskLevel: 'high',
        reason: 'Large major version upgrade - significant changes expected'
      };
    }

    if (majorDiff === 1) {
      return {
        isSafe: false,
        riskLevel: 'medium',
        reason: 'Major version upgrade - world will be permanently upgraded'
      };
    }

    if (minorDiff > 3) {
      return {
        isSafe: false,
        riskLevel: 'medium',
        reason: 'Large minor version upgrade - some compatibility issues possible'
      };
    }

    return {
      isSafe: true,
      riskLevel: 'low',
      reason: 'Minor upgrade - generally safe'
    };
  }

  return {
    isSafe: false,
    riskLevel: 'medium',
    reason: 'Unknown version comparison result'
  };
}

/**
 * Extract version from world file analysis
 */
export function extractVersionFromAnalysis(analysis: unknown): string | null {
  if (!analysis || typeof analysis !== 'object') {
    return null;
  }
  
  const analysisObj = analysis as Record<string, unknown>;
  
  // Check various places where version might be stored
  if (analysisObj.version && typeof analysisObj.version === 'string') {
    return analysisObj.version;
  }

  if (analysisObj.worldInfo && typeof analysisObj.worldInfo === 'object' && analysisObj.worldInfo !== null) {
    const worldInfo = analysisObj.worldInfo as Record<string, unknown>;
    if (worldInfo.version && typeof worldInfo.version === 'string') {
      return worldInfo.version;
    }
  }

  if (analysisObj.metadata && typeof analysisObj.metadata === 'object' && analysisObj.metadata !== null) {
    const metadata = analysisObj.metadata as Record<string, unknown>;
    if (metadata.version && typeof metadata.version === 'string') {
      return metadata.version;
    }
  }

  if (analysisObj.levelData && typeof analysisObj.levelData === 'object' && analysisObj.levelData !== null) {
    const levelData = analysisObj.levelData as Record<string, unknown>;
    if (levelData.Version && typeof levelData.Version === 'object' && levelData.Version !== null) {
      const version = levelData.Version as Record<string, unknown>;
      if (version.Name && typeof version.Name === 'string') {
        return version.Name;
      }
    }
    
    // Try to extract from version ID if available
    if (levelData.DataVersion && typeof levelData.DataVersion === 'number') {
      return mapDataVersionToMinecraft(levelData.DataVersion);
    }
  }

  if (analysisObj.properties && typeof analysisObj.properties === 'object' && analysisObj.properties !== null) {
    const properties = analysisObj.properties as Record<string, unknown>;
    if (properties.version && typeof properties.version === 'string') {
      return properties.version;
    }
  }

  return null;
}

/**
 * Map data version numbers to Minecraft versions
 * This is a partial mapping for common versions
 */
function mapDataVersionToMinecraft(dataVersion: number): string {
  const versionMap: Record<number, string> = {
    3837: '1.21.3',
    3832: '1.21.2', 
    3827: '1.21.1',
    3825: '1.21',
    3802: '1.20.6',
    3789: '1.20.5',
    3700: '1.20.4',
    3698: '1.20.3',
    3695: '1.20.2',
    3691: '1.20.1',
    3465: '1.20',
    3337: '1.19.4',
    3326: '1.19.3',
    3307: '1.19.2',
    3218: '1.19.1',
    3120: '1.19',
    2975: '1.18.2',
    2865: '1.18.1',
    2862: '1.18'
  };

  // Find the closest version
  const versions = Object.keys(versionMap).map(Number).sort((a, b) => a - b);
  
  for (let i = versions.length - 1; i >= 0; i--) {
    if (dataVersion >= versions[i]) {
      return versionMap[versions[i]];
    }
  }

  // If no match found, try to estimate
  if (dataVersion >= 3800) return '1.21+';
  if (dataVersion >= 3400) return '1.20+';
  if (dataVersion >= 3000) return '1.19+';
  if (dataVersion >= 2800) return '1.18+';
  
  return 'Unknown';
}

/**
 * Get user-friendly version change description
 */
export function getVersionChangeDescription(fromVersion: string, toVersion: string): string {
  const comparison = compareVersions(toVersion, fromVersion);
  
  if (comparison.isSame) {
    return 'No version change';
  }
  
  if (comparison.isOlder) {
    if (Math.abs(comparison.majorDifference) > 0) {
      return `Downgrading from ${fromVersion} to ${toVersion} (Major downgrade)`;
    }
    return `Downgrading from ${fromVersion} to ${toVersion} (Minor downgrade)`;
  }
  
  if (comparison.isNewer) {
    if (comparison.majorDifference > 0) {
      return `Upgrading from ${fromVersion} to ${toVersion} (Major upgrade)`;
    }
    return `Upgrading from ${fromVersion} to ${toVersion} (Minor upgrade)`;
  }
  
  return `Version change from ${fromVersion} to ${toVersion}`;
}
