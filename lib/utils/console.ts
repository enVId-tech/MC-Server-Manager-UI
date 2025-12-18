/**
 * Global console override utility
 * Adds timestamps, colors, file logging, and allows enabling/disabling console logs
 */

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// File logging configuration
const FILE_LOG_CONFIG = {
    enabled: process.env.LOG_TO_FILE === 'true',
    directory: path.join(process.cwd(), 'logs'),
    maxSize: 10 * 1024 * 1024, // 10 MB
    maxFiles: 5,
};

// Configuration
const CONSOLE_CONFIG = {
    // Enable/disable console logging globally
    enabled: process.env.NODE_ENV !== 'production' || process.env.ENABLE_CONSOLE_LOGS === 'true',
    
    // Show timestamps
    showTimestamp: true,
    
    // Enable colors (disable if terminal doesn't support ANSI colors)
    useColors: process.env.DISABLE_CONSOLE_COLORS !== 'true',
    
    // File-specific logging control
    fileControl: {
        mode: 'blacklist' as 'whitelist' | 'blacklist', // 'whitelist' = only allowed files log, 'blacklist' = all files except blocked ones log
        allowedFiles: [] as string[], // Files that are allowed to log (whitelist mode)
        blockedFiles: [] as string[], // Files that are blocked from logging (blacklist mode)
    },
    
    // Timestamp format options
    timestampFormat: {
        timeZone: 'UTC',
        hour12: false,
        year: 'numeric' as const,
        month: '2-digit' as const,
        day: '2-digit' as const,
        hour: '2-digit' as const,
        minute: '2-digit' as const,
        second: '2-digit' as const,
        fractionalSecondDigits: 3 as const
    }
};

// Store original console methods and initialization state
const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
    trace: console.trace
};

// Track if console has been initialized to prevent multiple overrides
// Use globalThis to ensure the flag persists across module reloads in development
declare global {
    var __CONSOLE_INITIALIZED__: boolean | undefined;
}

let isConsoleInitialized = globalThis.__CONSOLE_INITIALIZED__ || false;

// ANSI color codes
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    
    // Bright foreground colors
    brightBlack: '\x1b[90m',
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m',
    
    // Background colors
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',
};

// Color scheme for different log levels
const LOG_COLORS = {
    LOG: {
        timestamp: COLORS.brightBlack,
        level: COLORS.brightBlue,
        message: COLORS.white
    },
    ERROR: {
        timestamp: COLORS.brightBlack,
        level: COLORS.brightRed,
        message: COLORS.brightRed
    },
    WARN: {
        timestamp: COLORS.brightBlack,
        level: COLORS.brightYellow,
        message: COLORS.yellow
    },
    INFO: {
        timestamp: COLORS.brightBlack,
        level: COLORS.brightCyan,
        message: COLORS.cyan
    },
    DEBUG: {
        timestamp: COLORS.brightBlack,
        level: COLORS.brightMagenta,
        message: COLORS.magenta
    },
    TRACE: {
        timestamp: COLORS.brightBlack,
        level: COLORS.brightGreen,
        message: COLORS.green
    }
};

// ==========================================
// File Logging Functions
// ==========================================

/**
 * Ensure log directory exists
 */
function ensureLogDirectory(): void {
    if (!FILE_LOG_CONFIG.enabled) return;
    
    try {
        if (!fs.existsSync(FILE_LOG_CONFIG.directory)) {
            fs.mkdirSync(FILE_LOG_CONFIG.directory, { recursive: true });
        }
    } catch {
        // Ignore errors
    }
}

/**
 * Get current log file name based on date
 */
function getLogFileName(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(FILE_LOG_CONFIG.directory, `app-${dateStr}.log`);
}

/**
 * Rotate logs if needed
 */
function rotateLogsIfNeeded(logFile: string): void {
    try {
        if (!fs.existsSync(logFile)) return;
        
        const stats = fs.statSync(logFile);
        if (stats.size < FILE_LOG_CONFIG.maxSize) return;
        
        // Rotate the log file
        const timestamp = Date.now();
        const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
        fs.renameSync(logFile, rotatedFile);
        
        // Clean up old log files
        const logFiles = fs.readdirSync(FILE_LOG_CONFIG.directory)
            .filter(f => f.endsWith('.log'))
            .map(f => ({
                name: f,
                path: path.join(FILE_LOG_CONFIG.directory, f),
                mtime: fs.statSync(path.join(FILE_LOG_CONFIG.directory, f)).mtime.getTime()
            }))
            .sort((a, b) => b.mtime - a.mtime);
        
        // Keep only the most recent files
        if (logFiles.length > FILE_LOG_CONFIG.maxFiles) {
            logFiles.slice(FILE_LOG_CONFIG.maxFiles).forEach(f => {
                fs.unlinkSync(f.path);
            });
        }
    } catch {
        // Ignore rotation errors
    }
}

/**
 * Format log message for file (no colors)
 */
function formatFileLogMessage(level: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return util.inspect(arg, { depth: 4, colors: false });
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
    
    return `[${timestamp}] [${level}] ${message}\n`;
}

/**
 * Write to log file
 */
function writeToLogFile(level: string, args: unknown[]): void {
    if (!FILE_LOG_CONFIG.enabled) return;
    
    ensureLogDirectory();
    
    const logFile = getLogFileName();
    rotateLogsIfNeeded(logFile);
    
    const message = formatFileLogMessage(level, args);
    
    try {
        fs.appendFileSync(logFile, message);
    } catch {
        // Ignore write errors
    }
}

/**
 * Enable file logging
 */
export function enableFileLogging(options?: { directory?: string; maxSize?: number; maxFiles?: number }) {
    FILE_LOG_CONFIG.enabled = true;
    if (options?.directory) FILE_LOG_CONFIG.directory = options.directory;
    if (options?.maxSize) FILE_LOG_CONFIG.maxSize = options.maxSize;
    if (options?.maxFiles) FILE_LOG_CONFIG.maxFiles = options.maxFiles;
    ensureLogDirectory();
}

/**
 * Disable file logging
 */
export function disableFileLogging() {
    FILE_LOG_CONFIG.enabled = false;
}

/**
 * Get current log file path
 */
export function getLogFilePath(): string {
    return getLogFileName();
}

/**
 * Clear all log files
 */
export function clearLogFiles(): void {
    try {
        if (!fs.existsSync(FILE_LOG_CONFIG.directory)) return;
        
        const files = fs.readdirSync(FILE_LOG_CONFIG.directory);
        files.forEach(file => {
            if (file.endsWith('.log')) {
                fs.unlinkSync(path.join(FILE_LOG_CONFIG.directory, file));
            }
        });
    } catch {
        // Ignore errors
    }
}

// ==========================================
// Console Override Functions
// ==========================================

/**
 * Apply color to text if colors are enabled
 */
function colorize(text: string, color: string): string {
    if (!CONSOLE_CONFIG.useColors) return text;
    return `${color}${text}${COLORS.reset}`;
}

/**
 * Get formatted timestamp
 */
function getTimestamp(): string {
    if (!CONSOLE_CONFIG.showTimestamp) return '';
    
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', CONSOLE_CONFIG.timestampFormat);
    return `[${timestamp}]`;
}

/**
 * Get the calling file path from stack trace
 */
function getCallingFile(): string {
    const originalPrepareStackTrace = Error.prepareStackTrace;
    
    try {
        Error.prepareStackTrace = (_, stack) => stack;
        const err = new Error();
        const stack = err.stack as unknown as NodeJS.CallSite[];
        
        // Find the first stack frame that's not this file
        for (let i = 0; i < stack.length; i++) {
            const fileName = stack[i].getFileName();
            if (fileName && !fileName.includes('console.ts') && !fileName.includes('global-console.ts')) {
                return fileName;
            }
        }
        return '';
    } catch {
        return '';
    } finally {
        Error.prepareStackTrace = originalPrepareStackTrace;
    }
}

/**
 * Check if a file path matches a pattern (supports wildcards)
 */
function matchesPattern(filePath: string, pattern: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase();
    
    // Handle different wildcard patterns
    if (normalizedPattern.includes('*')) {
        // Convert wildcard pattern to regex
        const regexPattern = normalizedPattern
            .replace(/\./g, '\\.')  // Escape dots
            .replace(/\*/g, '.*');  // Convert * to .*
        
        const regex = new RegExp(regexPattern);
        return regex.test(normalizedPath);
    }
    
    // Exact match or contains match
    return normalizedPath.includes(normalizedPattern) || normalizedPath.endsWith(normalizedPattern);
}

/**
 * Check if logging is allowed for the current file
 */
function isLoggingAllowedForFile(): boolean {
    if (!CONSOLE_CONFIG.enabled) return false;
    
    const callingFile = getCallingFile();
    if (!callingFile) return CONSOLE_CONFIG.enabled; // If we can't determine the file, use global setting
    
    if (CONSOLE_CONFIG.fileControl.mode === 'whitelist') {
        // Whitelist mode: only allowed files can log
        if (CONSOLE_CONFIG.fileControl.allowedFiles.length === 0) {
            return CONSOLE_CONFIG.enabled; // If no whitelist, use global setting
        }
        
        return CONSOLE_CONFIG.fileControl.allowedFiles.some(allowedFile => 
            matchesPattern(callingFile, allowedFile)
        );
    } else {
        // Blacklist mode: all files except blocked ones can log
        const isBlocked = CONSOLE_CONFIG.fileControl.blockedFiles.some(blockedFile => 
            matchesPattern(callingFile, blockedFile)
        );
        
        return !isBlocked;
    }
}

/**
 * Create enhanced console method with timestamp and conditional logging
 */
function createConsoleMethod(originalMethod: (...args: unknown[]) => void, level: string) {
    return (...args: unknown[]) => {
        // Always write to file if file logging is enabled (before checking console logging filter)
        writeToLogFile(level.toUpperCase(), args);
        
        if (!isLoggingAllowedForFile()) return;
        
        const timestamp = getTimestamp();
        const levelTag = level.toUpperCase();
        const colors = LOG_COLORS[levelTag as keyof typeof LOG_COLORS];
        
        if (timestamp && colors) {
            // Apply colors to timestamp and level tag
            const coloredTimestamp = colorize(timestamp, colors.timestamp);
            const coloredLevel = colorize(`[${levelTag}]`, colors.level);
            
            // Apply color to the first argument (main message) if it's a string
            const coloredArgs = args.map((arg, index) => {
                if (index === 0 && typeof arg === 'string') {
                    return colorize(arg, colors.message);
                }
                return arg;
            });
            
            originalMethod(coloredTimestamp, coloredLevel, ...coloredArgs);
        } else if (timestamp) {
            // Fallback without colors
            originalMethod(`${timestamp} [${levelTag}]`, ...args);
        } else {
            // No timestamp, just level tag
            const coloredLevel = colors ? colorize(`[${levelTag}]`, colors.level) : `[${levelTag}]`;
            
            const coloredArgs = args.map((arg, index) => {
                if (index === 0 && typeof arg === 'string' && colors) {
                    return colorize(arg, colors.message);
                }
                return arg;
            });
            
            originalMethod(coloredLevel, ...coloredArgs);
        }
    };
}

/**
 * Override console methods
 */
export function initializeConsole() {
    // Prevent multiple initializations
    if (isConsoleInitialized) {
        return;
    }
    
    // Additional check: verify console methods aren't already wrapped
    if (typeof globalThis !== 'undefined' && globalThis.console) {
        // Check if console.log is already wrapped by looking for our signature
        const consoleLogStr = globalThis.console.log.toString();
        if (consoleLogStr.includes('createConsoleMethod') || consoleLogStr.includes('Enhanced console')) {
            // Console is already wrapped, mark as initialized and return
            isConsoleInitialized = true;
            globalThis.__CONSOLE_INITIALIZED__ = true;
            return;
        }
        
        globalThis.console.log = createConsoleMethod(originalConsole.log, 'LOG');
        globalThis.console.error = createConsoleMethod(originalConsole.error, 'ERROR');
        globalThis.console.warn = createConsoleMethod(originalConsole.warn, 'WARN');
        globalThis.console.info = createConsoleMethod(originalConsole.info, 'INFO');
        globalThis.console.debug = createConsoleMethod(originalConsole.debug, 'DEBUG');
        globalThis.console.trace = createConsoleMethod(originalConsole.trace, 'TRACE');
        
        isConsoleInitialized = true;
        globalThis.__CONSOLE_INITIALIZED__ = true;
    }
}

/**
 * Restore original console methods
 */
export function restoreConsole() {
    if (typeof globalThis !== 'undefined' && globalThis.console) {
        globalThis.console.log = originalConsole.log;
        globalThis.console.error = originalConsole.error;
        globalThis.console.warn = originalConsole.warn;
        globalThis.console.info = originalConsole.info;
        globalThis.console.debug = originalConsole.debug;
        globalThis.console.trace = originalConsole.trace;
        
        isConsoleInitialized = false;
        globalThis.__CONSOLE_INITIALIZED__ = false;
    }
}

/**
 * Check if console has been initialized
 */
export function isConsoleOverrideActive(): boolean {
    return isConsoleInitialized;
}

/**
 * Force re-initialization (use with caution)
 */
export function forceReinitializeConsole() {
    isConsoleInitialized = false;
    globalThis.__CONSOLE_INITIALIZED__ = false;
    initializeConsole();
}

/**
 * Enable console logging
 */
export function enableConsole() {
    CONSOLE_CONFIG.enabled = true;
}

/**
 * Disable console logging
 */
export function disableConsole() {
    CONSOLE_CONFIG.enabled = false;
}

/**
 * Toggle console logging
 */
export function toggleConsole() {
    CONSOLE_CONFIG.enabled = !CONSOLE_CONFIG.enabled;
    return CONSOLE_CONFIG.enabled;
}

/**
 * Enable colors
 */
export function enableColors() {
    CONSOLE_CONFIG.useColors = true;
}

/**
 * Disable colors
 */
export function disableColors() {
    CONSOLE_CONFIG.useColors = false;
}

/**
 * Toggle colors
 */
export function toggleColors() {
    CONSOLE_CONFIG.useColors = !CONSOLE_CONFIG.useColors;
    return CONSOLE_CONFIG.useColors;
}

/**
 * Get current console configuration
 */
export function getConsoleConfig() {
    return { ...CONSOLE_CONFIG };
}

/**
 * Update console configuration
 */
export function updateConsoleConfig(config: Partial<typeof CONSOLE_CONFIG>) {
    Object.assign(CONSOLE_CONFIG, config);
}

/**
 * Set file control mode
 */
export function setFileControlMode(mode: 'whitelist' | 'blacklist') {
    CONSOLE_CONFIG.fileControl.mode = mode;
}

/**
 * Add files to whitelist (files that ARE allowed to log)
 */
export function addToWhitelist(files: string | string[]) {
    const filesToAdd = Array.isArray(files) ? files : [files];
    CONSOLE_CONFIG.fileControl.allowedFiles.push(...filesToAdd);
    // Remove duplicates
    CONSOLE_CONFIG.fileControl.allowedFiles = [...new Set(CONSOLE_CONFIG.fileControl.allowedFiles)];
}

/**
 * Add files to blacklist (files that are NOT allowed to log)
 */
export function addToBlacklist(files: string | string[]) {
    const filesToAdd = Array.isArray(files) ? files : [files];
    CONSOLE_CONFIG.fileControl.blockedFiles.push(...filesToAdd);
    // Remove duplicates
    CONSOLE_CONFIG.fileControl.blockedFiles = [...new Set(CONSOLE_CONFIG.fileControl.blockedFiles)];
}

/**
 * Remove files from whitelist
 */
export function removeFromWhitelist(files: string | string[]) {
    const filesToRemove = Array.isArray(files) ? files : [files];
    CONSOLE_CONFIG.fileControl.allowedFiles = CONSOLE_CONFIG.fileControl.allowedFiles.filter(
        file => !filesToRemove.includes(file)
    );
}

/**
 * Remove files from blacklist
 */
export function removeFromBlacklist(files: string | string[]) {
    const filesToRemove = Array.isArray(files) ? files : [files];
    CONSOLE_CONFIG.fileControl.blockedFiles = CONSOLE_CONFIG.fileControl.blockedFiles.filter(
        file => !filesToRemove.includes(file)
    );
}

/**
 * Clear whitelist
 */
export function clearWhitelist() {
    CONSOLE_CONFIG.fileControl.allowedFiles = [];
}

/**
 * Clear blacklist
 */
export function clearBlacklist() {
    CONSOLE_CONFIG.fileControl.blockedFiles = [];
}

/**
 * Get current whitelist
 */
export function getWhitelist(): string[] {
    return [...CONSOLE_CONFIG.fileControl.allowedFiles];
}

/**
 * Get current blacklist
 */
export function getBlacklist(): string[] {
    return [...CONSOLE_CONFIG.fileControl.blockedFiles];
}

/**
 * Import file arrays for whitelist/blacklist
 */
export function importFileArrays(config: {
    mode?: 'whitelist' | 'blacklist';
    allowedFiles?: string[];
    blockedFiles?: string[];
}) {
    if (config.mode) {
        setFileControlMode(config.mode);
    }
    
    if (config.allowedFiles) {
        clearWhitelist();
        addToWhitelist(config.allowedFiles);
    }
    
    if (config.blockedFiles) {
        clearBlacklist();
        addToBlacklist(config.blockedFiles);
    }
}

/**
 * Force log (bypasses enabled/disabled state)
 */
export const forceLog = {
    log: originalConsole.log,
    error: originalConsole.error,
    warn: originalConsole.warn,
    info: originalConsole.info,
    debug: originalConsole.debug,
    trace: originalConsole.trace
};

/**
 * Debug function to test console functionality
 */
export function debugConsole() {
    const divider = colorize('=== Console Debug Info ===', COLORS.brightCyan);
    const endDivider = colorize('=== End Debug Info ===', COLORS.brightCyan);
    
    forceLog.log(divider);
    forceLog.log('Console initialized:', colorize(String(isConsoleInitialized), COLORS.brightGreen));
    forceLog.log('Console enabled:', colorize(String(CONSOLE_CONFIG.enabled), COLORS.brightGreen));
    forceLog.log('Colors enabled:', colorize(String(CONSOLE_CONFIG.useColors), COLORS.brightGreen));
    forceLog.log('File control mode:', colorize(CONSOLE_CONFIG.fileControl.mode, COLORS.brightYellow));
    forceLog.log('Whitelist:', CONSOLE_CONFIG.fileControl.allowedFiles);
    forceLog.log('Blacklist:', CONSOLE_CONFIG.fileControl.blockedFiles);
    forceLog.log('Current file:', colorize(getCallingFile(), COLORS.brightMagenta));
    forceLog.log(endDivider);
    
    // Test all log levels with colors
    forceLog.log(colorize('\nTesting all log levels:', COLORS.brightWhite));
    console.log('This is a LOG message');
    console.error('This is an ERROR message');
    console.warn('This is a WARN message');
    console.info('This is an INFO message');
    console.debug('This is a DEBUG message');
    console.trace('This is a TRACE message');
}

// Export the configuration for external access
export { CONSOLE_CONFIG };
