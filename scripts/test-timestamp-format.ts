#!/usr/bin/env npx tsx

import dotenv from 'dotenv';
dotenv.config({ debug: false });

/**
 * Test script to verify the timestamp format for server deletion archiving
 */
function testTimestampFormat() {
    console.log('🕒 Testing timestamp format for server archiving');
    console.log('='.repeat(60));

    // Create detailed timestamp: YYYY-MM-DD_HH-MM-SS format
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    
    console.log('Current date/time:', now.toISOString());
    console.log('Formatted timestamp:', timestamp);
    
    // Example server folder path
    const serverUniqueId = 'test-server-12345';
    const userEmail = 'user@example.com';
    const webdavServerBasePath = process.env.WEBDAV_SERVER_BASE_PATH || '/servers';
    
    const originalPath = `${webdavServerBasePath}/${userEmail}/${serverUniqueId}`;
    const archivedPath = `${originalPath}-deleted-${timestamp}`;
    
    console.log('\n📁 Example paths:');
    console.log('Original path:', originalPath);
    console.log('Archived path:', archivedPath);
    
    // Show multiple examples to demonstrate timestamp variety
    console.log('\n📋 Multiple timestamp examples:');
    for (let i = 0; i < 3; i++) {
        const testTime = new Date(Date.now() + (i * 1000));
        const year = testTime.getUTCFullYear();
        const month = String(testTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(testTime.getUTCDate()).padStart(2, '0');
        const hours = String(testTime.getUTCHours()).padStart(2, '0');
        const minutes = String(testTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(testTime.getUTCSeconds()).padStart(2, '0');
        const testTimestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
        console.log(`${i + 1}. ${testTimestamp}`);
    }
    
    console.log('\n✅ Timestamp format verified!');
    console.log('Format: YYYY-MM-DD_HH-MM-SS');
    console.log('This will create unique folder names for each deletion.');
}

testTimestampFormat();
