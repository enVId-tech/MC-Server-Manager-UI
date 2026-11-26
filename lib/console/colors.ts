export interface TextSegment {
    text: string;
    color?: string;
    backgroundColor?: string;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
}

const MC_COLORS: Record<string, string> = {
    '0': '#64748b',
    '1': '#3b82f6',
    '2': '#22c55e',
    '3': '#06b6d4',
    '4': '#ef4444',
    '5': '#a855f7',
    '6': '#f59e0b',
    '7': '#cbd5e1',
    '8': '#64748b',
    '9': '#60a5fa',
    a: '#4ade80',
    b: '#22d3ee',
    c: '#f87171',
    d: '#e879f9',
    e: '#facc15',
    f: '#f8fafc',
};

const ANSI_NORMAL: Record<number, string> = {
    30: '#64748b',
    31: '#f87171',
    32: '#4ade80',
    33: '#facc15',
    34: '#60a5fa',
    35: '#e879f9',
    36: '#22d3ee',
    37: '#e2e8f0',
};

const ANSI_BRIGHT: Record<number, string> = {
    90: '#94a3b8',
    91: '#fca5a5',
    92: '#86efac',
    93: '#fde047',
    94: '#93c5fd',
    95: '#f0abfc',
    96: '#67e8f9',
    97: '#ffffff',
};

const ANSI_BG_NORMAL: Record<number, string> = {
    40: 'rgba(15, 23, 42, 0.9)',
    41: 'rgba(239, 68, 68, 0.25)',
    42: 'rgba(34, 197, 94, 0.25)',
    43: 'rgba(245, 158, 11, 0.25)',
    44: 'rgba(59, 130, 246, 0.25)',
    45: 'rgba(168, 85, 247, 0.25)',
    46: 'rgba(6, 182, 212, 0.25)',
    47: 'rgba(226, 232, 240, 0.2)',
};

const ANSI_BG_BRIGHT: Record<number, string> = {
    100: 'rgba(100, 116, 139, 0.35)',
    101: 'rgba(248, 113, 113, 0.3)',
    102: 'rgba(74, 222, 128, 0.3)',
    103: 'rgba(250, 204, 21, 0.3)',
    104: 'rgba(96, 165, 250, 0.3)',
    105: 'rgba(232, 121, 249, 0.3)',
    106: 'rgba(34, 211, 238, 0.3)',
    107: 'rgba(248, 250, 252, 0.25)',
};

/** rcon-cli converts `§x§r§r§g§g§b§b` by leaving `§x` and mapping each hex nibble to `ESC[3?m` */
const RCON_HEX_DIGIT: Record<string, string> = {
    '30': '8',
    '31': 'c',
    '32': 'a',
    '33': 'e',
    '34': '9',
    '35': 'd',
    '36': 'b',
    '37': 'f',
    '90': '8',
    '91': 'c',
    '92': 'a',
    '93': 'e',
    '94': '9',
    '95': 'd',
    '96': 'b',
    '97': 'f',
};

function xterm256ToHex(n: number): string | undefined {
    if (n < 0 || n > 255) return undefined;
    if (n < 8) return ANSI_NORMAL[30 + n];
    if (n < 16) return ANSI_BRIGHT[90 + (n - 8)];
    if (n >= 232) {
        const gray = 8 + (n - 232) * 10;
        const hex = gray.toString(16).padStart(2, '0');
        return `#${hex}${hex}${hex}`;
    }
    const idx = n - 16;
    const levels = [0, 95, 135, 175, 215, 255];
    const r = levels[Math.floor(idx / 36)];
    const g = levels[Math.floor((idx % 36) / 6)];
    const b = levels[idx % 6];
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Strips Docker multiplexed exec/log 8-byte headers, resolves terminal `\r` / `ESC[K` line redraws (such as
 * JLine `>....\rESC[K` prompts), strips non-SGR CSI control bytes, and preserves ANSI/Minecraft colors.
 */
export function cleanConsoleText(raw: string): string {
    const normalized = raw
        .replace(/[\u0001\u0002]\u0000{3}[\s\S]{4}/g, '')
        .replace(/^\ufffd+/, '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f]/g, '')
        .replace(/\r\n/g, '\n');

    const lines: string[] = [];
    for (const rawLine of normalized.split('\n')) {
        const parts = rawLine.replace(/\r+$/, '').split('\r');
        let resolved = parts[0];
        for (let i = 1; i < parts.length; i++) {
            const next = parts[i];
            const withoutErase = next.replace(/^(?:\u001b\[[012]?K)+/, '');
            if (withoutErase.length > 0 || /^\u001b\[[012]?K/.test(next)) {
                resolved = withoutErase;
            }
        }

        // Remove non-SGR CSI sequences (erase-in-line, cursor visibility/movement, etc.) so `[K` never prints raw
        resolved = resolved.replace(/\u001b\[[0-9;?]*[A-Za-ln-z]/g, '');

        const visible = stripConsoleColors(resolved).trim();
        if (visible === '>' || /^>\.{2,}$/.test(visible)) continue;

        lines.push(resolved);
    }

    return lines.join('\n').trimEnd();
}

/**
 * Cleans container log output for display: removes Docker's redundant leading RFC3339Nano timestamp, resolves
 * JLine `\rESC[K` redraw prompts, removes RCON connection churn, and collapses consecutive duplicate log lines.
 */
export function cleanContainerLogs(raw: string): string {
    const withoutDockerTimestamps = raw
        .replace(/[\u0001\u0002]\u0000{3}[\s\S]{4}/g, '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/, ''))
        .join('\n');

    const cleaned = cleanConsoleText(withoutDockerTimestamps);
    if (!cleaned) return '';

    const deduplicated: Array<{ line: string; key: string; count: number }> = [];
    for (const line of cleaned.split('\n')) {
        const plain = stripConsoleColors(line).trim();
        // Strip leading Minecraft/Velocity `[HH:mm:ss ...]: ` prefix when checking consecutive duplicate lines
        const bodyKey = plain
            .replace(/^\[\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s+[A-Za-z]+)?(?:\/[^\]]+)?\]:?\s*/i, '')
            .trim();

        const prev = deduplicated[deduplicated.length - 1];
        if (bodyKey && prev && prev.key === bodyKey) {
            prev.line = line;
            prev.count += 1;
            continue;
        }
        deduplicated.push({ line, key: bodyKey, count: 1 });
    }

    return deduplicated
        .map(entry => (entry.count > 1 ? `${entry.line}\u001b[0m \u001b[90m(x${entry.count})\u001b[0m` : entry.line))
        .join('\n');
}

export function stripConsoleColors(text: string): string {
    return text
        .replace(/§x(?:\u001b\[[0-9;]*m){6}/gi, '')
        .replace(/§x(?:§[0-9a-f]){6}/gi, '')
        .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
        .replace(/§[0-9a-fk-orx]/gi, '');
}

type StyleState = Omit<TextSegment, 'text'>;

function applySgr(codes: number[], style: StyleState): StyleState {
    const next: StyleState = { ...style };
    for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (code === 0) {
            return {};
        }
        if (code === 1) next.bold = true;
        else if (code === 2) next.dim = true;
        else if (code === 3) next.italic = true;
        else if (code === 4) next.underline = true;
        else if (code === 9) next.strikethrough = true;
        else if (code === 22) { delete next.bold; delete next.dim; }
        else if (code === 23) delete next.italic;
        else if (code === 24) delete next.underline;
        else if (code === 29) delete next.strikethrough;
        else if (code === 39) delete next.color;
        else if (code === 49) delete next.backgroundColor;
        else if (ANSI_NORMAL[code]) next.color = ANSI_NORMAL[code];
        else if (ANSI_BRIGHT[code]) next.color = ANSI_BRIGHT[code];
        else if (ANSI_BG_NORMAL[code]) next.backgroundColor = ANSI_BG_NORMAL[code];
        else if (ANSI_BG_BRIGHT[code]) next.backgroundColor = ANSI_BG_BRIGHT[code];
        else if ((code === 38 || code === 48) && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            const hex = xterm256ToHex(codes[i + 2]);
            if (hex) {
                if (code === 38) next.color = hex;
                else next.backgroundColor = hex;
            }
            i += 2;
        } else if ((code === 38 || code === 48) && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
            const rgb = `rgb(${clamp(codes[i + 2])}, ${clamp(codes[i + 3])}, ${clamp(codes[i + 4])})`;
            if (code === 38) next.color = rgb;
            else next.backgroundColor = rgb;
            i += 4;
        }
    }
    return next;
}

const TOKEN_REGEX = /(§x(?:\u001b\[[0-9;]*m){6}|§x(?:§[0-9a-f]){6}|\u001b\[([0-9;]*)([A-Za-z])|§([0-9a-fk-or]))/gi;

/** Parses ANSI SGR sequences and Minecraft `§` color/formatting codes into styled text spans. */
export function parseColoredSegments(input: string): TextSegment[] {
    if (!input) return [];

    const segments: TextSegment[] = [];
    let style: StyleState = {};
    let cursor = 0;

    const pushText = (chunk: string) => {
        if (!chunk) return;
        const prev = segments[segments.length - 1];
        if (
            prev &&
            prev.color === style.color &&
            prev.backgroundColor === style.backgroundColor &&
            prev.bold === style.bold &&
            prev.dim === style.dim &&
            prev.italic === style.italic &&
            prev.underline === style.underline &&
            prev.strikethrough === style.strikethrough
        ) {
            prev.text += chunk;
            return;
        }
        segments.push({ text: chunk, ...style });
    };

    TOKEN_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_REGEX.exec(input)) !== null) {
        if (match.index > cursor) {
            pushText(input.slice(cursor, match.index));
        }
        cursor = TOKEN_REGEX.lastIndex;
        const token = match[0];

        if (token.startsWith('§x\u001b') || token.startsWith('§X\u001b')) {
            const nibbles = [...token.matchAll(/\u001b\[(\d+)m/g)]
                .map(m => RCON_HEX_DIGIT[m[1]] ?? 'f')
                .join('');
            style = { ...style, color: nibbles.length === 6 ? `#${nibbles}` : '#e2e8f0' };
            continue;
        }

        if (token.startsWith('§x') || token.startsWith('§X')) {
            const hex = token.slice(2).replace(/§/g, '').toLowerCase();
            if (/^[0-9a-f]{6}$/.test(hex)) {
                style = { ...style, color: `#${hex}` };
            }
            continue;
        }

        if (match[3]) {
            if (match[3] === 'm') {
                const rawCodes = match[2] ? match[2].split(';').map(n => (n === '' ? 0 : Number(n))) : [0];
                style = applySgr(rawCodes, style);
            }
            continue;
        }

        const code = (match[4] ?? '').toLowerCase();
        if (MC_COLORS[code]) {
            style = { color: MC_COLORS[code] };
        } else if (code === 'l') {
            style = { ...style, bold: true };
        } else if (code === 'o') {
            style = { ...style, italic: true };
        } else if (code === 'n') {
            style = { ...style, underline: true };
        } else if (code === 'm') {
            style = { ...style, strikethrough: true };
        } else if (code === 'r') {
            style = {};
        }
    }

    if (cursor < input.length) {
        pushText(input.slice(cursor));
    }
    return segments;
}
