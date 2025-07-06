import fetch from 'node-fetch';

async function testStartServer() {
    try {
        console.log('🔍 Testing server start...');
        
        const response = await fetch('http://localhost:3001/api/server/manage/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': 'sessionToken=your-session-token-here' // You'll need to get this from your browser
            },
            body: JSON.stringify({
                serverSlug: 'main1.etran.dev'
            })
        });
        
        const result = await response.json();
        console.log('📋 Response:', result);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testStartServer();
