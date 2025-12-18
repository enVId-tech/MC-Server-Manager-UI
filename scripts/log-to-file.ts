/**
 * Log-to-File Script
 * 
 * This script sets up file-based logging for the application.
 * It captures console output and writes it to log files with timestamps.
 * 
 * Usage:
 *   Import this at the top of your entry point (e.g., in next.config.ts or a custom server)
 *   Or run: npx ts-node scripts/log-to-file.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// Configuration
const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_FILES = 5;

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Get current log file name based on date
function getLogFileName(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(LOG_DIR, `app-${dateStr}.log`);
}

// Rotate logs if needed
function rotateLogsIfNeeded(logFile: string): void {
    try {
        if (!fs.existsSync(logFile)) return;
        
        const stats = fs.statSync(logFile);
        if (stats.size < MAX_LOG_SIZE) return;
        
        // Rotate the log file
        const timestamp = Date.now();
        const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
        fs.renameSync(logFile, rotatedFile);
        
        // Clean up old log files
        const logFiles = fs.readdirSync(LOG_DIR)
            .filter(f => f.endsWith('.log'))
            .map(f => ({
                name: f,
                path: path.join(LOG_DIR, f),
                mtime: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime()
            }))
            .sort((a, b) => b.mtime - a.mtime);
        
        // Keep only the most recent files
        if (logFiles.length > MAX_LOG_FILES) {
            logFiles.slice(MAX_LOG_FILES).forEach(f => {
                fs.unlinkSync(f.path);
            });
        }
    } catch {
        // Ignore rotation errors
    }
}

// Format log message with timestamp
function formatLogMessage(level: string, args: unknown[]): string {
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

// Write to log file
function writeToLog(level: string, args: unknown[]): void {
    const logFile = getLogFileName();
    rotateLogsIfNeeded(logFile);
    
    const message = formatLogMessage(level, args);
    
    try {
        fs.appendFileSync(logFile, message);
    } catch {
        // Ignore write errors
    }
}

// Store original console methods
const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
};

// Override console methods
console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    writeToLog('LOG', args);
};

console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    writeToLog('ERROR', args);
};

console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    writeToLog('WARN', args);
};

console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    writeToLog('INFO', args);
};

console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args);
    writeToLog('DEBUG', args);
};

// Export utilities for manual logging
export function logToFile(level: string, ...args: unknown[]): void {
    writeToLog(level, args);
}

export function getLogFilePath(): string {
    return getLogFileName();
}

export function clearLogs(): void {
    try {
        const files = fs.readdirSync(LOG_DIR);
        files.forEach(file => {
            if (file.endsWith('.log')) {
                fs.unlinkSync(path.join(LOG_DIR, file));
            }
        });
    } catch {
        // Ignore errors
    }
}

// Log startup message
console.log('='.repeat(80));
console.log('Application logging initialized');
console.log(`Log file: ${getLogFileName()}`);
console.log('='.repeat(80));

export default {
    logToFile,
    getLogFilePath,
    clearLogs,
};
