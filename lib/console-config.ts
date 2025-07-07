/**
 * Console logging configuration for specific files
 * Import this file to apply file-specific logging rules
 */

import { importFileArrays } from '@/lib/utils/console';

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

/**
 * Blacklist mode: All files log EXCEPT the ones in SILENT_FILES
 */
export function applyBlacklistMode() {
    importFileArrays({
        mode: 'blacklist',
        blockedFiles: SILENT_FILES
    });
}

/**
 * Whitelist mode: ONLY files in VERBOSE_FILES can log
 */
export function applyWhitelistMode() {
    importFileArrays({
        mode: 'whitelist',
        allowedFiles: VERBOSE_FILES
    });
}

/**
 * Development mode: Allow all files except silent ones
 */
export function applyDevelopmentMode() {
    applyBlacklistMode();
}

/**
 * Production debug mode: Only allow critical files
 */
export function applyProductionDebugMode() {
    importFileArrays({
        mode: 'whitelist',
        allowedFiles: [
            'app/api/server/manage/',
            'lib/server/portainer.ts',
            'app/api/auth/',
        ]
    });
}

/**
 * Silent mode: Block common noisy files
 */
export function applySilentMode() {
    importFileArrays({
        mode: 'blacklist',
        blockedFiles: [
            ...SILENT_FILES,
        ]
    });
}

// Auto-apply based on environment
const AUTO_APPLY_MODE = process.env.CONSOLE_FILE_MODE || 'development';

switch (AUTO_APPLY_MODE) {
    case 'whitelist':
        applyWhitelistMode();
        break;
    case 'production-debug':
        applyProductionDebugMode();
        break;
    case 'silent':
        applySilentMode();
        break;
    case 'development':
    default:
        applyDevelopmentMode();
        break;
}
