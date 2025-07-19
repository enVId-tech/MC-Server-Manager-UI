#!/usr/bin/env npx tsx

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Test script to demonstrate the world locator function
 * This script creates a test directory structure and tests the world locator
 */

interface WorldCandidate {
  path: string;
  relativePath: string;
  depth: number;
  matchType: 'level.dat' | 'region' | 'playerdata';
  parentFolderName: string;
}

/**
 * Locate the closest world directory within a directory structure
 */
async function locateWorldDirectory(extractDir: string): Promise<{
  worldPath: string | null;
  matchType: 'level.dat' | 'region' | 'playerdata' | 'none';
  relativePath: string | null;
}> {
  const candidates: WorldCandidate[] = [];

  // Recursive function to search through directory structure
  async function searchDirectory(currentPath: string, relativePath: string, depth: number): Promise<void> {
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });
      
      // Check for level.dat in current directory
      const hasLevelDat = items.some(item => item.isFile() && item.name === 'level.dat');
      if (hasLevelDat) {
        const parentFolderName = path.basename(currentPath);
        candidates.push({
          path: currentPath,
          relativePath,
          depth,
          matchType: 'level.dat',
          parentFolderName
        });
        return; // level.dat found, no need to search deeper in this branch
      }

      // Check for fallback indicators (region or playerdata folders)
      const hasRegion = items.some(item => item.isDirectory() && item.name === 'region');
      const hasPlayerdata = items.some(item => item.isDirectory() && item.name === 'playerdata');

      if (hasRegion) {
        const parentFolderName = path.basename(currentPath);
        candidates.push({
          path: currentPath,
          relativePath,
          depth,
          matchType: 'region',
          parentFolderName
        });
      }

      if (hasPlayerdata) {
        const parentFolderName = path.basename(currentPath);
        candidates.push({
          path: currentPath,
          relativePath,
          depth,
          matchType: 'playerdata',
          parentFolderName
        });
      }

      // Continue searching subdirectories
      for (const item of items) {
        if (item.isDirectory()) {
          const subPath = path.join(currentPath, item.name);
          const subRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
          await searchDirectory(subPath, subRelativePath, depth + 1);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
      console.warn(`Could not read directory ${currentPath}:`, error);
    }
  }

  // Start the search from the root
  await searchDirectory(extractDir, '', 0);

  if (candidates.length === 0) {
    return { worldPath: null, matchType: 'none', relativePath: null };
  }

  // Sort candidates by priority:
  // 1. level.dat matches first (highest priority)
  // 2. Lower depth (closer to root)
  // 3. ASCII comparison of parent folder names (earlier in ASCII = higher priority)
  candidates.sort((a, b) => {
    // Priority 1: level.dat always wins
    if (a.matchType === 'level.dat' && b.matchType !== 'level.dat') return -1;
    if (b.matchType === 'level.dat' && a.matchType !== 'level.dat') return 1;

    // Priority 2: Hierarchy depth (closer to root wins)
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }

    // Priority 3: ASCII comparison of parent folder names
    // Find first differentiating character and choose the one closer to 0 in ASCII
    const aName = a.parentFolderName.toLowerCase();
    const bName = b.parentFolderName.toLowerCase();
    
    const maxLength = Math.max(aName.length, bName.length);
    for (let i = 0; i < maxLength; i++) {
      const aChar = aName.charCodeAt(i) || Number.MAX_SAFE_INTEGER; // Treat missing chars as high value
      const bChar = bName.charCodeAt(i) || Number.MAX_SAFE_INTEGER;
      
      if (aChar !== bChar) {
        return aChar - bChar; // Lower ASCII value wins
      }
    }

    // If all characters are the same, shorter name wins
    return aName.length - bName.length;
  });

  const winner = candidates[0];
  
  console.log(`World directory located: ${winner.relativePath || '(root)'} (${winner.matchType} match)`);
  if (candidates.length > 1) {
    console.log(`Other candidates found: ${candidates.slice(1).map(c => `${c.relativePath || '(root)'} (${c.matchType})`).join(', ')}`);
  }

  return {
    worldPath: winner.path,
    matchType: winner.matchType,
    relativePath: winner.relativePath || null
  };
}

async function createTestStructure(): Promise<string> {
  const testDir = path.join(process.cwd(), 'test-world-structure');
  
  // Clean up any existing test directory
  try {
    await fs.rm(testDir, { recursive: true });
  } catch {
    // Directory doesn't exist, that's fine
  }

  // Create test directory structure
  await fs.mkdir(testDir, { recursive: true });

  // Test Case 1: level.dat in root
  const case1 = path.join(testDir, 'case1-level-in-root');
  await fs.mkdir(case1, { recursive: true });
  await fs.writeFile(path.join(case1, 'level.dat'), 'fake level.dat content');
  await fs.mkdir(path.join(case1, 'region'), { recursive: true });

  // Test Case 2: level.dat in subdirectory
  const case2 = path.join(testDir, 'case2-level-in-subdir');
  await fs.mkdir(path.join(case2, 'MyWorld'), { recursive: true });
  await fs.writeFile(path.join(case2, 'MyWorld', 'level.dat'), 'fake level.dat content');
  await fs.mkdir(path.join(case2, 'MyWorld', 'region'), { recursive: true });

  // Test Case 3: Multiple worlds, priority by folder name
  const case3 = path.join(testDir, 'case3-multiple-worlds');
  await fs.mkdir(path.join(case3, 'ZebraWorld'), { recursive: true });
  await fs.writeFile(path.join(case3, 'ZebraWorld', 'level.dat'), 'fake level.dat content');
  await fs.mkdir(path.join(case3, 'AppleWorld'), { recursive: true });
  await fs.writeFile(path.join(case3, 'AppleWorld', 'level.dat'), 'fake level.dat content');

  // Test Case 4: No level.dat, but has region folder
  const case4 = path.join(testDir, 'case4-region-only');
  await fs.mkdir(path.join(case4, 'region'), { recursive: true });
  await fs.writeFile(path.join(case4, 'region', 'r.0.0.mca'), 'fake region file');

  // Test Case 5: No level.dat, but has playerdata folder
  const case5 = path.join(testDir, 'case5-playerdata-only');
  await fs.mkdir(path.join(case5, 'playerdata'), { recursive: true });
  await fs.writeFile(path.join(case5, 'playerdata', 'player.dat'), 'fake player data');

  // Test Case 6: Complex nested structure
  const case6 = path.join(testDir, 'case6-nested');
  await fs.mkdir(path.join(case6, 'saves', 'world1'), { recursive: true });
  await fs.writeFile(path.join(case6, 'saves', 'world1', 'level.dat'), 'fake level.dat content');
  await fs.mkdir(path.join(case6, 'saves', 'world2'), { recursive: true });
  await fs.mkdir(path.join(case6, 'saves', 'world2', 'region'), { recursive: true });

  return testDir;
}

async function runTests(): Promise<void> {
  console.log('🧪 Testing World Locator Function');
  console.log('=' .repeat(50));

  const testDir = await createTestStructure();
  
  const testCases = [
    'case1-level-in-root',
    'case2-level-in-subdir', 
    'case3-multiple-worlds',
    'case4-region-only',
    'case5-playerdata-only',
    'case6-nested'
  ];

  for (const testCase of testCases) {
    console.log(`\n📁 Testing: ${testCase}`);
    console.log('-'.repeat(30));
    
    const casePath = path.join(testDir, testCase);
    const result = await locateWorldDirectory(casePath);
    
    console.log(`✅ Result: ${result.matchType}`);
    if (result.worldPath) {
      console.log(`📍 Path: ${result.relativePath || '(root)'}`);
      console.log(`🏠 Full path: ${result.worldPath}`);
    } else {
      console.log(`❌ No world directory found`);
    }
  }

  // Clean up
  await fs.rm(testDir, { recursive: true });
  console.log(`\n🧹 Test directory cleaned up`);
}

// Run the tests only when executed directly
// runTests().catch(console.error);

export { locateWorldDirectory };
