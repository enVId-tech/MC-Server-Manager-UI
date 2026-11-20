import { parseDocument, isMap, isSeq, type Document } from 'yaml';

/** Config file formats that get a form instead of a plain text editor. */
export type ConfigFormat = 'properties' | 'yaml' | 'json';

export type ConfigPath = (string | number)[];

/** Detects the form editor a file gets. Everything else (logs, toml, cfg, scripts, ...) stays a text file. */
export function detectConfigFormat(fileName: string): ConfigFormat | null {
    const name = fileName.toLowerCase();
    if (name.endsWith('.properties')) return 'properties';
    if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml';
    if (name.endsWith('.json')) {
        // Large data dumps are not configuration
        return name === 'usercache.json' || name.startsWith('whitelist') ? null : 'json';
    }
    return null;
}

/* ---------- .properties ---------- */

export interface PropertyLine {
    key: string;
    value: string;
}

function splitPropertyLine(line: string): PropertyLine | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return null;
    const match = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(trimmed);
    return match ? { key: match[1], value: match[2] } : null;
}

export function parseProperties(text: string): PropertyLine[] {
    return text.split(/\r?\n/).map(splitPropertyLine).filter((entry): entry is PropertyLine => entry !== null);
}

/** Changes one value and keeps comments, order and every other line as they were. Adds the key when it is new. */
export function setPropertyValue(text: string, key: string, value: string): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    let found = false;

    const updated = lines.map(line => {
        const entry = splitPropertyLine(line);
        if (entry && entry.key === key) {
            found = true;
            return `${key}=${value}`;
        }
        return line;
    });

    if (!found) {
        if (updated.length && updated[updated.length - 1] === '') updated.splice(updated.length - 1, 0, `${key}=${value}`);
        else updated.push(`${key}=${value}`);
    }
    return updated.join(eol);
}

/* ---------- yaml and json trees ---------- */

export type ConfigScalar = string | number | boolean | null;

export interface ParsedConfig {
    data: unknown;
    error?: string;
}

export function parseStructured(text: string, format: 'yaml' | 'json'): ParsedConfig {
    try {
        if (format === 'json') {
            return { data: text.trim() === '' ? {} : JSON.parse(text) };
        }
        const doc = parseDocument(text);
        if (doc.errors.length > 0) return { data: null, error: doc.errors[0].message };
        return { data: doc.toJS() ?? {} };
    } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : 'Could not read the file.' };
    }
}

function setIn(target: unknown, path: ConfigPath, value: unknown): unknown {
    if (path.length === 0) return value;
    const [head, ...rest] = path;
    const clone: Record<string | number, unknown> | unknown[] = Array.isArray(target) ? [...target] : { ...(target as object) };
    (clone as Record<string | number, unknown>)[head] = setIn((clone as Record<string | number, unknown>)[head], rest, value);
    return clone;
}

/**
 * Sets a value anywhere in a yaml or json document and returns the new text.
 * Yaml is edited in place, so comments, key order and quoting survive.
 */
export function setStructuredValue(text: string, format: 'yaml' | 'json', path: ConfigPath, value: unknown): string {
    if (format === 'json') {
        const data = text.trim() === '' ? {} : JSON.parse(text);
        return JSON.stringify(setIn(data, path, value), null, 2) + '\n';
    }

    const doc: Document = parseDocument(text);
    if (doc.errors.length > 0) throw new Error(doc.errors[0].message);
    if (isSeq(doc.getIn(path, true)) || isMap(doc.getIn(path, true))) {
        doc.setIn(path, doc.createNode(value));
    } else {
        doc.setIn(path, value);
    }
    return doc.toString();
}
