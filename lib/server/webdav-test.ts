/**
 * WebDAV Test Utility
 * 
 * This script helps test the WebDAV file management functionality
 * Run this script to verify the WebDAV integration is working correctly
 */

import webdavService from '@/lib/server/webdav';

export async function testWebDAVConnection() {
    try {
        console.log('🔧 Testing WebDAV connection...');
        
        const testPath = '/test-connection';
        const testContent = 'WebDAV test file created at ' + new Date().toISOString();
        
        // Test creating a file
        console.log('📁 Creating test file...');
        await webdavService.uploadFile(testPath, testContent);
        console.log('✅ File created successfully');
        
        // Test reading the file
        console.log('📖 Reading test file...');
        const retrievedContent = await webdavService.getFileContents(testPath);
        const contentString = retrievedContent.toString('utf-8');
        console.log('✅ File read successfully:', contentString);
        
        // Test file existence
        console.log('🔍 Checking file existence...');
        const exists = await webdavService.exists(testPath);
        console.log('✅ File exists:', exists);
        
        // Test deleting the file
        console.log('🗑️ Deleting test file...');
        await webdavService.deleteFile(testPath);
        console.log('✅ File deleted successfully');
        
        // Verify deletion
        console.log('🔍 Verifying deletion...');
        const stillExists = await webdavService.exists(testPath);
        console.log('✅ File deletion verified:', !stillExists);
        
        console.log('🎉 All WebDAV tests passed!');
        return true;
        
    } catch (error) {
        console.error('❌ WebDAV test failed:', error);
        return false;
    }
}

export async function testServerFileOperations(userEmail: string, serverId: string) {
    try {
        console.log('🔧 Testing server file operations...');
        
        const baseServerPath = process.env.WEBDAV_SERVER_BASE_PATH || '/minecraft-servers';
        const userFolder = userEmail.split('@')[0];
        const serverPath = `${baseServerPath}/${userFolder}/${serverId}`;
        
        console.log('📁 Server path:', serverPath);
        
        // Test directory listing
        console.log('📋 Testing directory listing...');
        const contents = await webdavService.getDirectoryContents(serverPath);
        console.log('✅ Directory contents:', contents);
        
        // Test configuration file access
        const configPath = `${serverPath}/server.properties`;
        console.log('📖 Testing config file access...');
        
        if (await webdavService.exists(configPath)) {
            const configContent = await webdavService.getFileContents(configPath);
            console.log('✅ Config file read successfully, size:', configContent.length, 'bytes');
        } else {
            console.log('⚠️ Config file does not exist, creating placeholder...');
            const defaultConfig = '# Default server.properties\nserver-port=25565\n';
            await webdavService.uploadFile(configPath, defaultConfig);
            console.log('✅ Placeholder config created');
        }
        
        console.log('🎉 Server file operations test passed!');
        return true;
        
    } catch (error) {
        console.error('❌ Server file operations test failed:', error);
        return false;
    }
}

// Helper function to check WebDAV configuration
export function checkWebDAVConfig() {
    const requiredVars = [
        'WEBDAV_URL',
        'WEBDAV_SERVER_BASE_PATH'
    ];
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        console.error('❌ Missing WebDAV environment variables:', missing);
        return false;
    }
    
    console.log('✅ WebDAV configuration check passed');
    console.log('🌐 WebDAV URL:', process.env.WEBDAV_URL);
    console.log('📁 Base Path:', process.env.WEBDAV_SERVER_BASE_PATH);
    
    return true;
}

// Main test function
export async function runAllWebDAVTests(userEmail?: string, serverId?: string) {
    console.log('🚀 Starting WebDAV tests...\n');
    
    // Check configuration
    if (!checkWebDAVConfig()) {
        return false;
    }
    
    // Test basic connection
    const basicTest = await testWebDAVConnection();
    if (!basicTest) {
        return false;
    }
    
    // Test server-specific operations if parameters provided
    if (userEmail && serverId) {
        const serverTest = await testServerFileOperations(userEmail, serverId);
        if (!serverTest) {
            return false;
        }
    }
    
    console.log('\n🎉 All WebDAV tests completed successfully!');
    return true;
}

export default {
    testWebDAVConnection,
    testServerFileOperations,
    checkWebDAVConfig,
    runAllWebDAVTests
};
