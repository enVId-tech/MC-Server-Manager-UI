import debug from 'debug';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

export interface Logger {
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
}

// Initialize debug logger
const info = debug('portainer-api:info');
const warn = debug('portainer-api:warn');
const error = debug('portainer-api:error')

const DefaultLogger: Logger = {
    info: (message: string, ...args: any[]) => {
        info(message, ...args);
        info.color = '0';
    },
    warn: (message: string, ...args: any[]) => {
        warn(message, ...args);
        warn.color = '3';
    },
    error: (message: string, ...args: any[]) => {
        error(message, ...args);
        error.color = '1';
    }
};

debug.enable(process.env.DEBUG_LOGGER || 'portainer-api:*');

export const logInfo = DefaultLogger.info;
export const logWarn = DefaultLogger.warn;
export const logError = DefaultLogger.error;

export let ActiveLogger: Logger = DefaultLogger;

/**
 * Sets a custom logger to be used by the library.
 * @param logger - An object implementing the Logger interface.
 */
export function setLogger(logger: Logger) {
    ActiveLogger = logger;
}