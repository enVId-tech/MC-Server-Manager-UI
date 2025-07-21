import resourceMonitor from '@/lib/server/resourceMonitor';

/**
 * Background service script for automatic resource monitoring and scaling
 * This can be run as a cron job or scheduled task to periodically monitor
 * all servers and apply resource scaling where needed
 * 
 * Usage:
 * - As a cron job: Call the API endpoint /api/server/monitor with internal auth
 * - Direct execution: node scripts/resource-monitor.js (if compiled from TypeScript)
 */

async function runResourceMonitoring(): Promise<void> {
    console.log(`🔍 [${new Date().toISOString()}] Starting automated resource monitoring...`);
    
    try {
        const startTime = Date.now();
        
        // Run the resource monitoring for all servers
        const results = await resourceMonitor.monitorAllServers();
        
        const duration = Date.now() - startTime;
        
        console.log(`✅ [${new Date().toISOString()}] Resource monitoring completed in ${duration}ms`);
        console.log(`📊 Results: ${results.serversChecked} servers checked, ${results.serversScaled} servers scaled`);
        
        // Log individual server results for debugging
        if (results.results.length > 0) {
            console.log('📋 Detailed results:');
            results.results.forEach(result => {
                if (result.result.scaled) {
                    console.log(`  ✅ ${result.serverId}: Scaled (${result.result.reason})`);
                } else if (result.result.error) {
                    console.log(`  ❌ ${result.serverId}: Error - ${result.result.error}`);
                } else {
                    console.log(`  ℹ️ ${result.serverId}: No scaling needed (${result.result.reason || 'optimal'})`);
                }
            });
        }
        
    } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] Resource monitoring failed:`, error);
        process.exit(1);
    }
}

// Run immediately if this script is executed directly
if (require.main === module) {
    runResourceMonitoring()
        .then(() => {
            console.log('🎉 Resource monitoring completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Resource monitoring failed:', error);
            process.exit(1);
        });
}

export { runResourceMonitoring };
