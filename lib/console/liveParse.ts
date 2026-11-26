import YAML from 'yaml';
import type { CommandDef } from './commands';

/**
 * Converts a live Brigadier usage line (for example `/bluemap [unfreeze|reload|...]`) into our CommandDef syntax tokens
 * so Tab/dropdown completion can offer subcommands and parameter hints cleanly.
 */
function normalizeBrigadierSyntax(name: string, rest: string): string {
    if (!rest) return name;
    // Strip wrapping `[...]` around pure literal choice groups such as `[help|reload|blocks]`
    const cleaned = rest
        .replace(/\[\s*([a-zA-Z0-9_.:-]+(?:\|[a-zA-Z0-9_.:-]+)+)\s*\]/g, '$1')
        .replace(/\(\s*([a-zA-Z0-9_.:-]+(?:\|[a-zA-Z0-9_.:-]+)+)\s*\)/g, '$1')
        .replace(/\[(<[^>]+>)\]/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

    // Very large choice enumerations (like Paper 26's 50+ gamerules) stay cleaner in usage while keeping sub-options reasonable
    return cleaned ? `${name} ${cleaned}` : name;
}

/**
 * Parses the concatenated or line-separated output of `minecraft:help` on 1.13+ servers (Vanilla, Paper, Purpur,
 * Spigot, Fabric, Forge), including plugin commands, namespaced `plugin:cmd` commands, and WorldEdit `//cmd` aliases.
 */
export function parseBrigadierHelp(rawOutput: string): CommandDef[] {
    const cleaned = rawOutput
        .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
        .replace(/§[0-9a-fk-orx]/gi, '')
        .replace(/[\u0000-\u0009\u000b-\u001f\ufffd]/g, '')
        .replace(/^\^+/, '')
        .trim();

    if (!cleaned || /^Unknown or incomplete command|^Unknown command/i.test(cleaned)) {
        return [];
    }

    // Split top-level `/command ...` entries while ignoring `/` inside `(...)`, `[...]`, `<...>`, `:`, or `//`
    const entries: string[] = [];
    let start = -1;
    let depth = 0;

    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '[' || ch === '(' || ch === '<') { depth++; continue; }
        if (ch === ']' || ch === ')' || ch === '>') { if (depth > 0) depth--; continue; }
        if (ch === '/' && depth === 0) {
            const prev = i > 0 ? cleaned[i - 1] : '';
            const isNamespacedSlash = prev === ':';
            const isDoubleSlash = start !== -1 && start === i - 1;
            const isArrowTarget = start !== -1 && /->\s*\/*$/.test(cleaned.slice(start, i));
            if (!isNamespacedSlash && !isDoubleSlash && !isArrowTarget) {
                if (start !== -1) entries.push(cleaned.slice(start, i).trim());
                start = i;
            }
        }
    }
    if (start !== -1) entries.push(cleaned.slice(start).trim());

    const byName = new Map<string, CommandDef>();
    const aliases: Array<{ alias: string; target: string }> = [];

    for (const entry of entries) {
        const withoutLeadingSlash = entry.slice(1).trim();
        if (!withoutLeadingSlash) continue;

        const arrow = /^([^\s]+)\s*->\s*([^\s]+)$/.exec(withoutLeadingSlash);
        if (arrow) {
            const alias = arrow[1].toLowerCase();
            const target = arrow[2].replace(/^\//, '').toLowerCase();
            aliases.push({ alias, target });
            if (!byName.has(alias)) {
                byName.set(alias, {
                    name: alias,
                    syntax: [alias],
                    summary: `Alias for /${target}`,
                });
            }
            continue;
        }

        const spaceIdx = withoutLeadingSlash.search(/\s/);
        const name = (spaceIdx === -1 ? withoutLeadingSlash : withoutLeadingSlash.slice(0, spaceIdx)).toLowerCase();
        const rest = spaceIdx === -1 ? '' : withoutLeadingSlash.slice(spaceIdx + 1).trim();
        if (!name) continue;

        const syntaxLine = normalizeBrigadierSyntax(name, rest);
        const existing = byName.get(name);
        if (existing) {
            if (!existing.syntax.includes(syntaxLine)) existing.syntax.push(syntaxLine);
        } else {
            const namespace = name.includes(':') && !name.startsWith('/') ? name.split(':')[0] : undefined;
            byName.set(name, {
                name,
                syntax: [syntaxLine],
                ...(namespace ? { summary: `${namespace} plugin command` } : {}),
            });
        }
    }

    for (const { alias, target } of aliases) {
        const targetDef = byName.get(target);
        const aliasDef = byName.get(alias);
        if (targetDef && aliasDef) {
            aliasDef.syntax = targetDef.syntax.map(line => {
                const rest = line.includes(' ') ? line.slice(line.indexOf(' ') + 1) : '';
                return rest ? `${alias} ${rest}` : alias;
            });
            aliasDef.summary = targetDef.summary ?? `Alias for /${target}`;
        }
    }

    return [...byName.values()];
}

/**
 * Parses Bukkit/Spigot/Paper paginated `/help` output (`--- Help: Index (1/45) ---` or `/cmd: Description`).
 */
export function parseBukkitHelpOutput(rawOutput: string): { commands: CommandDef[]; totalPages: number; topics: string[] } {
    const cleaned = rawOutput
        .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
        .replace(/§[0-9a-fk-orx]/gi, '')
        .replace(/[\u0000-\u0008\u000b-\u001f\ufffd]/g, '');

    let totalPages = 1;
    const pageMatch = /\((\d+)\/(\d+)\)/.exec(cleaned) ?? /page \d+ of (\d+)/i.exec(cleaned);
    if (pageMatch) {
        totalPages = Number(pageMatch[2] ?? pageMatch[1]) || 1;
    }

    const commands: CommandDef[] = [];
    const topics: string[] = [];

    for (const rawLine of cleaned.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || /^-+\s*Help:|Below is a list|Use \/help/i.test(line)) continue;

        const cmdMatch = /^(\/[^\s:]+):\s*(.*)$/.exec(line);
        if (cmdMatch) {
            const name = cmdMatch[1].slice(1).toLowerCase();
            if (!name) continue;
            const summary = cmdMatch[2].trim() || undefined;
            commands.push({ name, syntax: [name], summary });
            continue;
        }

        const topicMatch = /^([A-Za-z0-9_.-]+):\s+All commands for\s+/i.exec(line);
        if (topicMatch) {
            topics.push(topicMatch[1]);
        }
    }

    return { commands, totalPages, topics };
}

/** Reads `commands:` from a plugin's `plugin.yml` / `paper-plugin.yml` / `bungee.yml` descriptor. */
export function parsePluginDescriptorCommands(yamlText: string, fallbackPluginName?: string): CommandDef[] {
    let parsed: Record<string, unknown> | null = null;
    try {
        parsed = YAML.parse(yamlText) as Record<string, unknown>;
    } catch {
        return [];
    }
    if (!parsed || typeof parsed !== 'object') return [];
    const pluginName = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : fallbackPluginName;
    const rawCommands = parsed.commands;
    if (!rawCommands || typeof rawCommands !== 'object' || Array.isArray(rawCommands)) return [];

    const out: CommandDef[] = [];
    for (const [rawName, rawMeta] of Object.entries(rawCommands as Record<string, unknown>)) {
        const name = rawName.trim().toLowerCase();
        if (!name) continue;
        const meta = (rawMeta && typeof rawMeta === 'object' ? rawMeta : {}) as {
            description?: unknown;
            usage?: unknown;
            aliases?: unknown;
        };
        const description = typeof meta.description === 'string' ? meta.description.trim() : undefined;
        const summary = description || (pluginName ? `${pluginName} command` : undefined);
        const aliases = Array.isArray(meta.aliases)
            ? meta.aliases.map(a => String(a).trim().toLowerCase()).filter(Boolean)
            : typeof meta.aliases === 'string' && meta.aliases.trim()
                ? [meta.aliases.trim().toLowerCase()]
                : undefined;

        const usage = typeof meta.usage === 'string'
            ? meta.usage.replace(/<command>/gi, name).replace(/^\//, '').split(/\r?\n/)[0].trim()
            : name;

        out.push({
            name,
            syntax: [usage || name],
            aliases,
            summary,
        });
    }
    return out;
}
