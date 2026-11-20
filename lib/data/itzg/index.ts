import { LOCKED_OPTIONS, OPTIONS } from './options';
import { getServerType, matchesSelector } from './serverTypes';
import { isVersionInRange } from './versions';
import type { OptionDefinition, OptionTab, OptionValue, OptionValues } from './types';

export * from './types';
export * from './versions';
export * from './serverTypes';
export { OPTIONS, LOCKED_OPTIONS } from './options';

const OPTION_BY_ENV = new Map(OPTIONS.map(option => [option.env, option]));
const LOCKED_ENV = new Map(LOCKED_OPTIONS.map(option => [option.env, option]));

/** Longest value a single option may hold. Keeps a pasted file from ending up in a compose file. */
const MAX_VALUE_LENGTH = 8192;

export function getOption(env: string): OptionDefinition | undefined {
    return OPTION_BY_ENV.get(env);
}

export function isLockedEnv(env: string): boolean {
    return LOCKED_ENV.has(env);
}

/**
 * Whether an option makes sense for a server type and Minecraft version.
 */
export function isOptionApplicable(option: OptionDefinition, type: string | undefined | null, version: string | undefined | null): boolean {
    if (!matchesSelector(option.types, type)) return false;
    if (option.excludeTypes && option.excludeTypes.length > 0 && matchesSelector(option.excludeTypes, type)) return false;

    // Modpacks decide the Minecraft version themselves, so version limits do not say anything about them
    const definition = getServerType(type);
    if (definition?.versionFromPack) return true;

    return isVersionInRange(version, option.minVersion, option.maxVersion);
}

export interface OptionQuery {
    type: string | undefined | null;
    version: string | undefined | null;
    tab?: OptionTab;
    /** Include options marked as expert */
    expert?: boolean;
    /** Leave out options the wizard already has its own control for */
    omitFormManaged?: boolean;
}

export function getApplicableOptions(query: OptionQuery): OptionDefinition[] {
    return OPTIONS.filter(option => {
        if (query.tab && option.tab !== query.tab) return false;
        if (!query.expert && option.expert) return false;
        if (query.omitFormManaged && option.formField) return false;
        return isOptionApplicable(option, query.type, query.version);
    });
}

export interface OptionGroup {
    name: string;
    options: OptionDefinition[];
}

/**
 * Split options into their groups, keeping the order of the catalog.
 */
export function groupOptions(options: OptionDefinition[]): OptionGroup[] {
    const groups = new Map<string, OptionDefinition[]>();
    for (const option of options) {
        const existing = groups.get(option.group);
        if (existing) existing.push(option);
        else groups.set(option.group, [option]);
    }
    return [...groups.entries()].map(([name, grouped]) => ({ name, options: grouped }));
}

// -------------------------------------------------------------------------------------------------
// Values
// -------------------------------------------------------------------------------------------------

/**
 * Turn a typed option value into the text the container expects.
 */
export function stringifyValue(value: OptionValue): string {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

export interface SanitizeResult {
    values: OptionValues;
    /** Environment variables that were dropped, with the reason */
    rejected: Record<string, string>;
}

/**
 * Check a user supplied set of overrides against the catalog.
 * Unknown, locked and inapplicable variables are dropped and values are coerced to the option type,
 * so only valid, well formed settings ever reach a container.
 */
export function sanitizeOverrides(raw: unknown, type: string | undefined | null, version: string | undefined | null): SanitizeResult {
    const values: OptionValues = {};
    const rejected: Record<string, string> = {};

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { values, rejected };
    }

    for (const [env, rawValue] of Object.entries(raw as Record<string, unknown>)) {
        const locked = LOCKED_ENV.get(env);
        if (locked) {
            rejected[env] = locked.locked ?? 'Managed by the platform.';
            continue;
        }

        const option = OPTION_BY_ENV.get(env);
        if (!option) {
            rejected[env] = 'Unknown setting.';
            continue;
        }

        if (!isOptionApplicable(option, type, version)) {
            rejected[env] = 'Not available for this server type or version.';
            continue;
        }

        // null and empty strings mean "use the container default" and are not stored
        if (rawValue === null || rawValue === undefined || rawValue === '') {
            continue;
        }

        const coerced = coerceValue(option, rawValue);
        if (coerced.error) {
            rejected[env] = coerced.error;
            continue;
        }
        values[env] = coerced.value as OptionValue;
    }

    return { values, rejected };
}

function coerceValue(option: OptionDefinition, raw: unknown): { value?: OptionValue; error?: string } {
    switch (option.kind) {
        case 'boolean': {
            if (typeof raw === 'boolean') return { value: raw };
            if (raw === 'true' || raw === 'TRUE') return { value: true };
            if (raw === 'false' || raw === 'FALSE') return { value: false };
            return { error: 'Must be true or false.' };
        }
        case 'number': {
            const number = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
            if (!Number.isFinite(number)) return { error: 'Must be a number.' };
            if (option.min !== undefined && number < option.min) return { error: `Must be at least ${option.min}.` };
            if (option.max !== undefined && number > option.max) return { error: `Must be at most ${option.max}.` };
            return { value: number };
        }
        case 'select': {
            const text = typeof raw === 'string' ? raw : String(raw);
            if (option.choices && !option.choices.some(choice => choice.value === text)) {
                return { error: 'Not one of the allowed values.' };
            }
            return { value: text };
        }
        default: {
            if (typeof raw !== 'string' && typeof raw !== 'number') return { error: 'Must be text.' };
            const text = String(raw);
            if (text.length > MAX_VALUE_LENGTH) return { error: `Must be at most ${MAX_VALUE_LENGTH} characters.` };
            if (text.includes('\0')) return { error: 'Must not contain null characters.' };
            return { value: text };
        }
    }
}

// -------------------------------------------------------------------------------------------------
// server.properties
// -------------------------------------------------------------------------------------------------

/** Properties the manager owns. They are never written from the settings a user supplies. */
const LOCKED_PROPERTIES = new Set(['server-port', 'server-ip', 'enable-rcon', 'rcon.port', 'rcon.password', 'query.port']);

/** server.properties keys whose environment variable is not simply the upper case key. */
const PROPERTY_ENV_OVERRIDES: Record<string, string> = {
    gamemode: 'MODE',
    'level-name': 'LEVEL',
    'level-seed': 'SEED',
    'white-list': 'ENABLE_WHITELIST',
};

const PROPERTY_TO_ENV = new Map<string, string>(
    OPTIONS.filter(option => option.property).map(option => [option.property as string, option.env])
);
for (const [property, env] of Object.entries(PROPERTY_ENV_OVERRIDES)) {
    PROPERTY_TO_ENV.set(property, env);
}

export function isLockedProperty(key: string): boolean {
    return LOCKED_PROPERTIES.has(key);
}

/**
 * Environment variable that sets a server.properties key, when the container has one.
 */
export function getEnvForProperty(key: string): string | undefined {
    return PROPERTY_TO_ENV.get(key);
}

// -------------------------------------------------------------------------------------------------
// Container environment
// -------------------------------------------------------------------------------------------------

export interface UserEnvironmentInput {
    type: string | undefined | null;
    version: string | undefined | null;
    /** Overrides chosen with the option panels */
    overrides?: OptionValues | null;
    /** Entries of the advanced server.properties editor */
    serverProperties?: Record<string, OptionValue> | null;
}

/**
 * Environment variables for everything a user may configure.
 *
 * Order of precedence, lowest first: server.properties entries, then explicit overrides. Locked
 * variables never appear in the result, so they stay under the control of the platform.
 */
export function resolveUserEnvironment(input: UserEnvironmentInput): Record<string, string> {
    const environment: Record<string, string> = {};
    const custom: string[] = [];

    for (const [key, value] of Object.entries(input.serverProperties ?? {})) {
        if (isLockedProperty(key) || value === '' || value === null || value === undefined) continue;

        const env = getEnvForProperty(key);
        if (env && !isLockedEnv(env)) {
            environment[env] = stringifyValue(value);
        } else if (!env && /^[A-Za-z0-9._-]+$/.test(key) && !String(value).includes('\n')) {
            // Properties the container has no variable for are written through CUSTOM_SERVER_PROPERTIES
            custom.push(`${key}=${stringifyValue(value)}`);
        }
    }

    if (custom.length > 0) {
        environment.CUSTOM_SERVER_PROPERTIES = custom.join('\n');
    }

    const { values } = sanitizeOverrides(input.overrides, input.type, input.version);
    for (const [env, value] of Object.entries(values)) {
        const text = stringifyValue(value);
        if (env === 'CUSTOM_SERVER_PROPERTIES' && environment.CUSTOM_SERVER_PROPERTIES) {
            environment.CUSTOM_SERVER_PROPERTIES = `${environment.CUSTOM_SERVER_PROPERTIES}\n${text}`;
        } else {
            environment[env] = text;
        }
    }

    return environment;
}

// -------------------------------------------------------------------------------------------------
// Dedicated form fields
// -------------------------------------------------------------------------------------------------

type FormSource = Record<string, unknown>;

/**
 * Current value of an option: its dedicated field when it has one and that field is filled in,
 * otherwise the override, otherwise nothing (the container default applies).
 */
export function readOptionValue(option: OptionDefinition, form: FormSource | null | undefined, overrides: OptionValues | null | undefined): OptionValue | undefined {
    if (overrides && overrides[option.env] !== undefined) return overrides[option.env];

    if (option.formField && form) {
        const stored = form[option.formField];
        if (typeof stored === 'string' && stored !== '') {
            return option.formLowercase ? stored.toUpperCase() : stored;
        }
        if (typeof stored === 'number' || typeof stored === 'boolean') return stored;
    }

    return undefined;
}

/**
 * Split a set of edited values into updates for dedicated fields and overrides.
 */
export function splitOptionValues(values: OptionValues): { form: Record<string, OptionValue>; overrides: OptionValues } {
    const form: Record<string, OptionValue> = {};
    const overrides: OptionValues = {};

    for (const [env, value] of Object.entries(values)) {
        const option = OPTION_BY_ENV.get(env);
        if (option?.formField) {
            form[option.formField] = typeof value === 'string' && option.formLowercase ? value.toLowerCase() : value;
        } else {
            overrides[env] = value;
        }
    }

    return { form, overrides };
}
