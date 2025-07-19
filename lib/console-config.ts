/**
 * Console logging configuration for specific files
 * Import this file to apply file-specific logging rules
 */

// REST API Request Logging Configuration
export const REST_API_LOGGING = {
    enabled: process.env.LOG_API_REQUESTS === 'true' || process.env.NODE_ENV !== 'production',
    logRequestHeaders: false,
    logRequestBody: false,
    logResponseHeaders: false,
    logResponseBody: false,
    logTiming: true,
    logOnlyErrors: false, // When true, only log failed requests (4xx, 5xx)
};

// Files that should NEVER log (blacklist mode)
export const SILENT_FILES = [
    'middleware.ts',
    'lib/db/*',           // All files in db folder
    'app/_components/*',  // All component files
    '*/globals.scss',     // Any globals.scss file
];

// Files that are ALLOWED to log (whitelist mode)
export const VERBOSE_FILES = [
    'app/*',                    // All files in app folder
    'lib/server/*',            // All server utilities
    'app/api/server/manage/*', // All server management APIs
    '*/minecraft.ts',          // Any minecraft.ts file
    'app/api/*/route.ts',      // All API route files
];

// Configuration objects for different logging modes
export const LOGGING_MODES = {
    BLACKLIST: {
        mode: 'blacklist' as const,
        blockedFiles: SILENT_FILES
    },
    WHITELIST: {
        mode: 'whitelist' as const,
        allowedFiles: VERBOSE_FILES
    },
    DEVELOPMENT: {
        mode: 'blacklist' as const,
        blockedFiles: SILENT_FILES
    },
    PRODUCTION_DEBUG: {
        mode: 'whitelist' as const,
        allowedFiles: [
            'app/api/server/manage/',
            'lib/server/portainer.ts',
            'app/api/auth/',
        ]
    },
    SILENT: {
        mode: 'blacklist' as const,
        blockedFiles: [
            ...SILENT_FILES,
        ]
    }
};

/**
 * Apply logging configuration using dynamic imports to avoid circular dependency
 */

/**
 * Blacklist mode: All files log EXCEPT the ones in SILENT_FILES
 */
export async function applyBlacklistMode() {
    const { importFileArrays } = await import('./utils/console');
    importFileArrays(LOGGING_MODES.BLACKLIST);
}

/**
 * Whitelist mode: ONLY files in VERBOSE_FILES can log
 */
export async function applyWhitelistMode() {
    const { importFileArrays } = await import('./utils/console');
    importFileArrays(LOGGING_MODES.WHITELIST);
}

/**
 * Development mode: Allow all files except silent ones
 */
export async function applyDevelopmentMode() {
    const { importFileArrays } = await import('./utils/console');
    importFileArrays(LOGGING_MODES.DEVELOPMENT);
}

/**
 * Production debug mode: Only allow critical files
 */
export async function applyProductionDebugMode() {
    const { importFileArrays } = await import('./utils/console');
    importFileArrays(LOGGING_MODES.PRODUCTION_DEBUG);
}

/**
 * Silent mode: Block common noisy files
 */
export async function applySilentMode() {
    const { importFileArrays } = await import('./utils/console');
    importFileArrays(LOGGING_MODES.SILENT);
}

/**
 * Toggle REST API request logging
 */
export function enableApiRequestLogging(enabled: boolean = true) {
    REST_API_LOGGING.enabled = enabled;
    console.log(`[CONSOLE CONFIG] REST API request logging ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Configure detailed API logging options
 */
export function configureApiLogging(options: Partial<typeof REST_API_LOGGING>) {
    Object.assign(REST_API_LOGGING, options);
    console.log('[CONSOLE CONFIG] API logging configuration updated:', REST_API_LOGGING);
}

/**
 * Utility function to check if API logging is enabled
 */
export function isApiLoggingEnabled(): boolean {
    return REST_API_LOGGING.enabled;
}

/**
 * Initialize console configuration based on environment
 * This runs asynchronously to avoid blocking initialization
 */
async function initializeConsoleConfig() {
    const AUTO_APPLY_MODE = process.env.CONSOLE_FILE_MODE || 'development';

    try {
        switch (AUTO_APPLY_MODE) {
            case 'whitelist':
                await applyWhitelistMode();
                break;
            case 'production-debug':
                await applyProductionDebugMode();
                break;
            case 'silent':
                await applySilentMode();
                break;
            case 'development':
            default:
                await applyDevelopmentMode();
                break;
        }
    } catch (error) {
        // Silently fail during initialization to avoid breaking imports
        console.error('Failed to initialize console configuration:', error);
    }
}

// Initialize console configuration after a short delay to ensure all modules are loaded
if (typeof window === 'undefined') { // Server-side only
    setTimeout(() => {
        initializeConsoleConfig();
    }, 100);
}
