/**
 * Small TOML editor for velocity.toml.
 *
 * Velocity's file is full of comments and settings this manager knows nothing about, and the file is often one
 * that somebody else wrote. So nothing is regenerated: a value is read or changed in place, everything else stays
 * exactly as it was. Only what Velocity's own file uses is understood: tables, `key = value` lines and arrays that
 * may span several lines.
 */

interface Entry {
    section: string;
    key: string;
    /** First and last line of the entry (an array can span lines) */
    start: number;
    end: number;
    raw: string;
}

interface Layout {
    lines: string[];
    entries: Entry[];
    /** Line of each table header, by section name */
    sections: Map<string, number>;
}

function unquote(key: string): string {
    const trimmed = key.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

/** Splits `key = value` at the first equals sign that is not inside quotes */
function splitKeyValue(line: string): { key: string; value: string } | null {
    let quote: string | null = null;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (quote) {
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '=') {
            return { key: unquote(line.slice(0, index)), value: line.slice(index + 1).trim() };
        }
    }
    return null;
}

/** Removes a trailing comment that is not inside quotes */
function stripComment(value: string): string {
    let quote: string | null = null;
    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        if (quote) {
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '#') {
            return value.slice(0, index).trim();
        }
    }
    return value.trim();
}

function bracketDepth(text: string): number {
    let depth = 0;
    let quote: string | null = null;
    for (const char of text) {
        if (quote) {
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '#') {
            break;
        } else if (char === '[') {
            depth++;
        } else if (char === ']') {
            depth--;
        }
    }
    return depth;
}

function layout(content: string): Layout {
    const lines = content.split(/\r?\n/);
    const entries: Entry[] = [];
    const sections = new Map<string, number>();
    let section = '';

    for (let index = 0; index < lines.length; index++) {
        const trimmed = lines[index].trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const header = trimmed.match(/^\[([^\[\]]+)\]\s*(#.*)?$/);
        if (header) {
            section = header[1].split('.').map(unquote).join('.');
            if (!sections.has(section)) sections.set(section, index);
            continue;
        }

        const pair = splitKeyValue(lines[index]);
        if (!pair) continue;

        let end = index;
        let depth = pair.value.startsWith('[') ? bracketDepth(pair.value) : 0;
        let raw = stripComment(pair.value);
        while (depth > 0 && end + 1 < lines.length) {
            end++;
            depth += bracketDepth(lines[end]);
            raw += ` ${stripComment(lines[end])}`;
        }
        entries.push({ section, key: pair.key, start: index, end, raw: raw.trim() });
        index = end;
    }

    return { lines, entries, sections };
}

export function tomlString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function tomlArray(values: string[]): string {
    return `[${values.map(tomlString).join(', ')}]`;
}

/** Reads a TOML value that is a string, boolean, number or array of strings */
export function parseTomlValue(raw: string): string | number | boolean | string[] {
    const text = raw.trim();
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    if (text.startsWith('[')) {
        const inner = text.slice(1, text.lastIndexOf(']')).trim();
        if (!inner) return [];
        const items: string[] = [];
        const pattern = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(inner)) !== null) {
            items.push(match[1] !== undefined ? match[1].replace(/\\(["\\])/g, '$1') : match[2]);
        }
        return items;
    }
    if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1).replace(/\\(["\\])/g, '$1');
    if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1);
    return text;
}

export function getTomlValue(content: string, section: string, key: string): string | number | boolean | string[] | undefined {
    const entry = layout(content).entries.find(candidate => candidate.section === section && candidate.key === key);
    return entry ? parseTomlValue(entry.raw) : undefined;
}

/** Every key of a table with its value, in file order */
export function getTomlTable(content: string, section: string): Record<string, string | number | boolean | string[]> {
    const table: Record<string, string | number | boolean | string[]> = {};
    for (const entry of layout(content).entries) {
        if (entry.section === section) table[entry.key] = parseTomlValue(entry.raw);
    }
    return table;
}

function formatKey(key: string): string {
    return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

/**
 * Sets `key = value` in a table. `value` is TOML as written (use tomlString / tomlArray). The line is replaced
 * where it is, or added at the end of the table; a missing table is added at the end of the file. A root key
 * (empty section) that does not exist yet goes in front of the first table.
 */
export function setTomlValue(content: string, section: string, key: string, value: string): string {
    const parsed = layout(content);
    const existing = parsed.entries.find(entry => entry.section === section && entry.key === key);
    const line = `${formatKey(key)} = ${value}`;

    if (existing) {
        const lines = [...parsed.lines];
        lines.splice(existing.start, existing.end - existing.start + 1, line);
        return lines.join('\n');
    }

    const lines = [...parsed.lines];
    if (section === '') {
        const firstTable = Math.min(...[...parsed.sections.values(), lines.length]);
        // Keep a blank line between the root keys and the first table
        const lastRoot = parsed.entries.filter(entry => entry.section === '').map(entry => entry.end).pop();
        const at = lastRoot !== undefined ? lastRoot + 1 : Math.min(firstTable, lines.length);
        lines.splice(at, 0, line);
        return lines.join('\n');
    }

    const header = parsed.sections.get(section);
    if (header === undefined) {
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
        lines.push('', `[${section.split('.').map(formatKey).join('.')}]`, line, '');
        return lines.join('\n');
    }

    const last = parsed.entries.filter(entry => entry.section === section).map(entry => entry.end).pop();
    lines.splice(last !== undefined ? last + 1 : header + 1, 0, line);
    return lines.join('\n');
}

export function removeTomlKey(content: string, section: string, key: string): string {
    const parsed = layout(content);
    const existing = parsed.entries.find(entry => entry.section === section && entry.key === key);
    if (!existing) return content;
    const lines = [...parsed.lines];
    lines.splice(existing.start, existing.end - existing.start + 1);
    return lines.join('\n');
}
