#!/usr/bin/env npx tsx

import dotenv from 'dotenv';

// Suppress dotenv verbose output
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
console.log = () => {}; // Temporarily suppress console.log
console.info = () => {}; // Temporarily suppress console.info

dotenv.config({ debug: false });

// Restore console methods
console.log = originalConsoleLog;
console.info = originalConsoleInfo;

// Import WebDAV service AFTER environment variables are loaded
import webdavService from '../lib/server/webdav';

async function testFolderArchiving() {
    console.log('🧪 Testing Folder Archiving with Correct Path Structure');
    console.log('='.repeat(60));

    // Test data
    const emailUsername = 'thelittlebotengineer';
    const serverUniqueId = '00000000-0000-0000-0000-000000000000'; // Example UUID
    const webdavServerBasePath = process.env.WEBDAV_SERVER_BASE_PATH || '/servers/Games/Velocity-Network';
    
    // Construct the paths using the correct structure
    const originalPath = `${webdavServerBasePath}/${emailUsername}/${serverUniqueId}`;
    
    // Create detailed timestamp: YYYY-MM-DD_HH-MM-SS format
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const archivedPath = `${originalPath}-deleted-${timestamp}`;

    console.log('📋 Test Configuration:');
    console.log(`   Email Username: ${emailUsername}`);
    console.log(`   Server UUID: ${serverUniqueId}`);
    console.log(`   WebDAV Base Path: ${webdavServerBasePath}`);
    console.log(`   Original Path: ${originalPath}`);
    console.log(`   Archive Path: ${archivedPath}`);
    console.log(`   Timestamp: ${timestamp}`);
    console.log('');

    // Test WebDAV connection
    try {
        console.log('🔌 Testing WebDAV connection...');
        const webdavUrl = process.env.WEBDAV_URL;
        const webdavUsername = process.env.WEBDAV_USERNAME;
        const webdavPassword = process.env.WEBDAV_PASSWORD;
        
        console.log(`📡 WebDAV URL: ${webdavUrl}`);
        console.log(`👤 WebDAV Username: ${webdavUsername || '(empty)'}`);
        console.log(`🔑 WebDAV Password: ${webdavPassword ? '(set)' : '(empty)'}`);

        // Check for common configuration issues before attempting connection
        if (!webdavUrl || webdavUrl === 'https://example.com/') {
            throw new Error('WEBDAV_URL is not properly configured. Please set it to your WebDAV server URL in .env');
        }

        console.log('ℹ️  Note: This WebDAV server does not require authentication.');

        // Test basic connection
        const baseContents = await webdavService.getDirectoryContents('/');
        console.log(`✅ WebDAV connection successful, found ${Array.isArray(baseContents) ? baseContents.length : 0} items in root`);

        // Check if the test path exists
        console.log(`🔍 Checking if test path exists: ${originalPath}`);
        try {
            const exists = await webdavService.exists(originalPath);
            console.log(`📁 Path exists: ${exists}`);
            
            if (exists) {
                console.log(`📂 Attempting to list contents of: ${originalPath}`);
                const contents = await webdavService.getDirectoryContents(originalPath);
                console.log(`📋 Found ${Array.isArray(contents) ? contents.length : 0} items in the directory`);
                
                // If contents exist, log some details
                if (Array.isArray(contents) && contents.length > 0) {
                    console.log(`📄 First few items:`);
                    contents.slice(0, 5).forEach((item: any, index: number) => {
                        const name = item.basename || item.name || 'Unknown';
                        const type = item.type || 'unknown';
                        console.log(`   ${index + 1}. ${name} (${type})`);
                    });
                    if (contents.length > 5) {
                        console.log(`   ... and ${contents.length - 5} more items`);
                    }
                }
                
                console.log('');
                console.log('🚨 Note: This is a READ-ONLY test. No actual archiving will be performed.');
                console.log('   To test actual archiving, you would call:');
                console.log(`   await webdavService.moveFile('${originalPath}', '${archivedPath}');`);
                
            } else {
                console.log('⚠️  The test path does not exist on the WebDAV server.');
                console.log('   This is expected if the server doesn\'t have this specific folder.');
                console.log('');
                console.log('💡 To create a test folder for archiving:');
                console.log(`   1. Create folder: ${originalPath}`);
                console.log(`   2. Add some test files`);
                console.log(`   3. Run the delete server API to test archiving`);
            }
            
        } catch (pathError) {
            console.error('❌ Error checking path:', pathError);
        }

    } catch (error) {
        console.error('❌ WebDAV connection test failed:', error);
        console.log('🔧 Troubleshooting Tips:');
        console.log('1. Check if WebDAV server is running and accessible');
        console.log('2. Verify WEBDAV_URL is correct and accessible');
        console.log('3. Check if WEBDAV_USERNAME and WEBDAV_PASSWORD are set (if required)');
        console.log('4. Ensure the WebDAV server supports the operations (move, create, delete)');
        console.log('5. Check network connectivity and firewall settings');
    }

    console.log('');
    console.log('✅ Path structure test completed!');
    console.log('');
    console.log('🎯 Expected behavior when server is deleted:');
    console.log(`   1. Server with UUID: ${serverUniqueId}`);
    console.log(`   2. Owned by user: ${emailUsername}@example.com`);
    console.log(`   3. Original folder: ${originalPath}`);
    console.log(`   4. Should be renamed to: ${originalPath}-deleted-${timestamp}`);
    console.log(`   5. Timestamp format: YYYY-MM-DD_HH-MM-SS (UTC)`);
}

// Run the test
testFolderArchiving().catch(console.error);
