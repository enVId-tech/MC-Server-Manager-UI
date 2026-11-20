import dotenv from 'dotenv';
import path from 'path';

// Load .env and .env.local when running outside Next.js (scripts, tests). Importing this module
// is enough; it only runs once and never overrides variables that are already set.
if (typeof window === 'undefined') {
    const envPaths = [
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), '.env.local')
    ];

    // dotenv can be noisy, so silence the console while it loads
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    console.log = () => {};
    console.info = () => {};

    envPaths.forEach(envPath => {
        try {
            dotenv.config({ path: envPath, override: false, debug: false });
        } catch {
            // Silently continue if file doesn't exist
        }
    });

    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
}

export {};
