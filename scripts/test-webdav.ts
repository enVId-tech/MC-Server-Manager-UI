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

import webdavService from '../lib/server/webdav';

async function testWebDAVConnection() {
    console.log('🔌 Testing WebDAV Connection and Folder Renaming');
    console.log('='.repeat(60));

    // Show WebDAV configuration
    const webdavUrl = process.env.WEBDAV_URL;
    const webdavUsername = process.env.WEBDAV_USERNAME;
    const webdavPassword = process.env.WEBDAV_PASSWORD;
    const webdavBasePath = process.env.WEBDAV_SERVER_BASE_PATH;

    console.log('📡 WebDAV Configuration:');
    console.log(`   URL: ${webdavUrl}`);
    console.log(`   Username: ${webdavUsername || '(empty)'}`);
    console.log(`   Password: ${webdavPassword ? '(set)' : '(empty)'}`);
    console.log(`   Base Path: ${webdavBasePath}`);
    console.log('');

    try {
        // Test basic connection
        console.log('🔍 Testing basic WebDAV connection...');
        const rootContents = await webdavService.getDirectoryContents('/');
        console.log(`✅ WebDAV connection successful!`);
        console.log(`📁 Found ${Array.isArray(rootContents) ? rootContents.length : 0} items in root directory`);
        
        if (Array.isArray(rootContents)) {
            rootContents.slice(0, 5).forEach((item: any, index) => {
                console.log(`   ${index + 1}. ${item.name || item.basename} (${item.type})`);
            });
            if (rootContents.length > 5) {
                console.log(`   ... and ${rootContents.length - 5} more items`);
            }
        }

        // Test access to servers directory
        console.log('\n📂 Testing access to servers directory...');
        try {
            const serversPath = webdavBasePath || '/servers';
            const exists = await webdavService.exists(serversPath);
            console.log(`📁 Servers directory (${serversPath}) exists: ${exists}`);
            
            if (exists) {
                const serversContents = await webdavService.getDirectoryContents(serversPath);
                console.log(`📋 Found ${Array.isArray(serversContents) ? serversContents.length : 0} items in servers directory`);
                
                if (Array.isArray(serversContents)) {
                    serversContents.slice(0, 3).forEach((item: any, index) => {
                        console.log(`   ${index + 1}. ${item.name || item.basename} (${item.type})`);
                    });
                }
            }
        } catch (serversError) {
            console.error(`❌ Error accessing servers directory:`, serversError);
        }

        // Test creating and renaming a test directory
        console.log('\n🧪 Testing folder creation and renaming...');
        const testFolderName = `test-folder-${Date.now()}`;
        const testPath = `/tmp/${testFolderName}`;
        
        try {
            console.log(`📁 Creating test folder: ${testPath}`);
            await webdavService.createDirectory(testPath);
            console.log(`✅ Test folder created successfully`);

            // Test renaming the folder
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
            const renamedPath = `${testPath}-deleted-${timestamp}`;
            
            console.log(`🔄 Attempting to rename folder to: ${renamedPath}`);
            await webdavService.moveFile(testPath, renamedPath);
            console.log(`✅ Folder renamed successfully!`);

            // Verify the rename worked
            const originalExists = await webdavService.exists(testPath);
            const renamedExists = await webdavService.exists(renamedPath);
            
            console.log(`📂 Original folder exists: ${originalExists}`);
            console.log(`📦 Renamed folder exists: ${renamedExists}`);

            // Clean up
            if (renamedExists) {
                console.log(`🗑️  Cleaning up test folder...`);
                await webdavService.deleteDirectory(renamedPath);
                console.log(`✅ Test folder cleaned up`);
            }

        } catch (testError) {
            console.error(`❌ Test folder operation failed:`, testError);
        }

        console.log('\n🎉 WebDAV connection and folder renaming test completed!');

    } catch (error) {
        console.error('❌ WebDAV connection test failed:', error);
        
        // Provide troubleshooting tips
        console.log('\n🔧 Troubleshooting Tips:');
        console.log('1. Check if WebDAV server is running and accessible');
        console.log('2. Verify WebDAV_URL is correct and accessible');
        console.log('3. Check if WebDAV_USERNAME and WebDAV_PASSWORD are set (if required)');
        console.log('4. Ensure the WebDAV server supports the operations (move, create, delete)');
        console.log('5. Check network connectivity and firewall settings');
    }
}

testWebDAVConnection().catch(console.error);
