#!/usr/bin/env tsx
/**
 * Porkbun API Setup Helper
 * Helps you set up Porkbun API credentials for DNS management
 */

import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

function checkPorkbunCredentials() {
    console.log('🔧 Porkbun API Setup Helper');
    console.log('='.repeat(50));

    const apiKey = process.env.PORKBUN_API_KEY;
    const secretKey = process.env.PORKBUN_SECRET_KEY;

    console.log('\n📋 Current Environment Variables:');
    console.log(`PORKBUN_API_KEY: ${apiKey || '❌ NOT SET'}`);
    console.log(`PORKBUN_SECRET_KEY: ${secretKey || '❌ NOT SET'}`);

    const hasValidCredentials =
        apiKey &&
        secretKey &&
        apiKey.startsWith('pk1_') &&
        secretKey.startsWith('sk1_') &&
        apiKey !== 'pk1_your_actual_porkbun_api_key_here' &&
        secretKey !== 'sk1_your_actual_porkbun_secret_key_here';

    if (hasValidCredentials) {
        console.log('\n✅ Porkbun API credentials are properly configured!');
        console.log('🚀 You can now run the DNS tests:');
        console.log('   npm run validate:porkbun');
        console.log('   npm run test:dns-quick');
        console.log('   npm run test:porkbun-dns');
        return;
    }

    console.log('\n❌ Porkbun API credentials need to be configured');
    console.log('\n📖 How to get your Porkbun API credentials:');
    console.log('');
    console.log('1. 🌐 Go to https://porkbun.com/account/api');
    console.log('2. 🔐 Log in to your Porkbun account');
    console.log('3. 📝 Create new API keys if you don\'t have them:');
    console.log('   - Click "Create API Key"');
    console.log('   - Give it a name like "Minecraft Server DNS"');
    console.log('   - Copy both the API Key and Secret Key');
    console.log('');
    console.log('4. 🔧 Update your .env file:');
    console.log('   - Open: .env');
    console.log('   - Replace: PORKBUN_API_KEY=pk1_your_actual_porkbun_api_key_here');
    console.log('   - With: PORKBUN_API_KEY=pk1_your_actual_key_from_porkbun');
    console.log('   - Replace: PORKBUN_SECRET_KEY=sk1_your_actual_porkbun_secret_key_here');
    console.log('   - With: PORKBUN_SECRET_KEY=sk1_your_actual_secret_from_porkbun');
    console.log('');
    console.log('5. 🎯 Make sure your domain is managed by Porkbun:');
    console.log('   - Your domain (etran.dev) must be registered with Porkbun');
    console.log('   - Or have its nameservers pointing to Porkbun');
    console.log('');
    console.log('📋 Example .env configuration:');
    console.log('```');
    console.log('PORKBUN_API_KEY=pk1_0545712619cf4f146cfa5f0fbac2f76e14815975fc2251de8445704e8789c8e8');
    console.log('PORKBUN_SECRET_KEY=sk1_13b458a1ec143aabae5c2aa646b0fa737308f28cf66f5a00c905a6a016ed2889');
    console.log('```');
    console.log('');
    console.log('⚠️  Important Notes:');
    console.log('   - Keep your API keys secure and private');
    console.log('   - Don\'t commit them to version control');
    console.log('   - The .env file is already in .gitignore');
    console.log('');
    console.log('🔄 After updating your .env file, run this script again to verify:');
    console.log('   npm run setup:porkbun');
}

function updateEnvFile() {
    const envPath = join(process.cwd(), '.env');

    console.log('\n🛠️  Interactive .env Setup (Optional)');
    console.log('-'.repeat(40));
    console.log('You can manually edit the .env file or use this interactive setup.');
    console.log('For security, we recommend manually editing the .env file.');
    console.log('');
    console.log(`📁 .env file location: ${envPath}`);
    console.log('');
    console.log('To manually edit:');
    console.log('1. Open the .env file in your text editor');
    console.log('2. Replace the placeholder values with your actual Porkbun credentials');
    console.log('3. Save the file');
    console.log('4. Run: npm run setup:porkbun (this script) to verify');
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🔧 Porkbun API Setup Helper

This script helps you configure Porkbun API credentials for DNS management.

Usage:
  npm run setup:porkbun
  npx tsx scripts/setup-porkbun.ts

What it does:
  ✅ Checks if Porkbun API credentials are configured
  📖 Provides step-by-step setup instructions
  🔍 Validates credential format
  📁 Shows you where to edit the .env file

Next steps after setup:
  npm run validate:porkbun  - Test your credentials
  npm run test:dns-quick    - Quick DNS test
  npm run test:porkbun-dns  - Full DNS test suite
`);
    process.exit(0);
}

// Run the credential check
checkPorkbunCredentials();
updateEnvFile();
