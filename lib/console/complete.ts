/**
 * Suggestions for the console command line, the way the game gives them: the commands that fit what was typed, then
 * the arguments of the command, for the version and kind of server. Nothing here sends anything.
 */
import { BIOMES, BLOCKS, COLORS, DIMENSIONS, EFFECTS, ENCHANTMENTS, ENTITIES, GAMEMODES, GAMERULES_BOOLEAN, GAMERULES_NUMBER, ITEM_ONLY, SELECTOR_LIST, parseEntry } from './data';
import { commandsFor, existsIn, parseVersion, type CommandDef, type ServerFlavor } from './commands';

export interface Suggestion {
    /** what replaces the word that is being typed */
    text: string;
    detail?: string;
}

export interface Completion {
    /** where the word that is being typed starts in the input */
    start: number;
    suggestions: Suggestion[];
    /** the argument that is expected when it cannot be listed, such as "<count>" */
    hint?: string;
    /** the argument takes players, so the caller may want to load them */
    needs?: 'players';
    /** the form of the command that is being followed */
    usage?: string;
}

export interface Context {
    version?: string;
    flavor: ServerFlavor;
    /** players that are known: online first */
    players: string[];
    /** additional commands fetched dynamically from the server and its enabled plugins/mods */
    extraCommands?: CommandDef[];
}

type Kind = 'literal' | 'targets' | 'player' | 'item' | 'block' | 'entity' | 'effect' | 'enchantment' | 'boolrule' | 'introle' | 'biome' | 'dimension' | 'coord' | 'color' | 'any';

interface Arg {
    kind: Kind;
    /** literal choices, or typical values of an open argument */
    values: string[];
    name: string;
    /** takes the rest of the line */
    rest: boolean;
}

const KINDS: Record<string, Kind> = {
    targets: 'targets', target: 'targets', player: 'player', item: 'item', block: 'block', entity: 'entity', vehicle: 'entity',
    effect: 'effect', enchantment: 'enchantment', boolrule: 'boolrule', introle: 'introle', biome: 'biome', dimension: 'dimension',
    x: 'coord', y: 'coord', z: 'coord', x2: 'coord', z2: 'coord', color: 'color',
};

const parsed = new Map<string, Arg[]>();

/** The arguments of a syntax line, without the name of the command */
export function parseSyntax(line: string): Arg[] {
    const cached = parsed.get(line);
    if (cached) return cached;
    const args = line.split(' ').slice(1).map(parseArg);
    parsed.set(line, args);
    return args;
}

export function parseArg(token: string): Arg {
    if (token.startsWith('<') && token.endsWith('>')) {
        let inner = token.slice(1, -1);
        const rest = inner.endsWith('...');
        inner = inner.replace(/\.\.\.$/, '');
        const [name, list] = inner.split(':');
        return { kind: KINDS[name] ?? 'any', values: list ? list.split('|') : [], name, rest };
    }
    return { kind: 'literal', values: token.split('|'), name: token, rest: false };
}

const lower = (text: string) => text.toLowerCase();
const bare = (text: string) => lower(text).replace(/^(#?)minecraft:/, '$1');

function versionList(list: string[], version: string | undefined): string[] {
    return list.map(parseEntry).filter(entry => existsIn(version, entry.since, entry.until)).map(entry => entry.name);
}

/** The values an argument can have for this context, as they would be written */
function valuesOf(arg: Arg, ctx: Context): string[] {
    const named = (list: string[]) => versionList(list, ctx.version).sort().map(name => (ctx.flavor === 'bedrock' || name.includes(':') || name.startsWith('#') ? name : `minecraft:${name}`));
    switch (arg.kind) {
        case 'literal': return arg.values;
        case 'player': return ctx.players;
        case 'targets': return [...ctx.players, ...versionList(SELECTOR_LIST, ctx.version)];
        case 'item': return named([...BLOCKS, ...ITEM_ONLY]);
        case 'block': return named(BLOCKS);
        case 'entity': return named(ENTITIES);
        case 'effect': return named(EFFECTS);
        case 'enchantment': return named(ENCHANTMENTS);
        case 'biome': return named(BIOMES);
        case 'dimension': return DIMENSIONS;
        case 'color': return COLORS;
        case 'boolrule': return versionList(GAMERULES_BOOLEAN, ctx.version);
        case 'introle': return versionList(GAMERULES_NUMBER, ctx.version);
        case 'coord': return ['~', '^'];
        default: return arg.values;
    }
}

/** Whether a word that was already typed fits the argument (only choices and rules are strict) */
function accepts(arg: Arg, word: string, ctx: Context): boolean {
    if (arg.kind === 'literal') return arg.values.some(value => lower(value) === lower(word));
    if (arg.kind === 'boolrule' || arg.kind === 'introle') return valuesOf(arg, ctx).some(value => lower(value) === lower(word));
    return true;
}

/** Values that fit what is typed: those that start with it first, then those that contain it */
function matching(values: string[], typed: string, loose = true): string[] {
    const wanted = bare(typed);
    if (!wanted) return values;
    const starts: string[] = [];
    const contains: string[] = [];
    for (const value of values) {
        const plain = bare(value);
        if (lower(value).startsWith(lower(typed)) || plain.startsWith(wanted)) starts.push(value);
        else if (loose && plain.includes(wanted)) contains.push(value);
    }
    return [...starts, ...contains];
}

const SELECTOR_KEYS = ['type=', 'name=', 'distance=', 'limit=', 'sort=', 'gamemode=', 'team=', 'tag=', 'level=', 'scores=', 'x=', 'y=', 'z=', 'dx=', 'dy=', 'dz=', 'nbt=', 'advancements=', 'predicate='];
const SORTS = ['nearest', 'furthest', 'random', 'arbitrary'];

/** `@a[type=pi` completes inside the brackets: the key, or the value of a key that has a short list */
function selectorArguments(word: string, ctx: Context): Suggestion[] | null {
    const match = /^(@[aeprsn])\[(.*)$/.exec(word);
    if (!match) return null;
    const head = `${match[1]}[`;
    const pieces = match[2].split(',');
    const current = pieces[pieces.length - 1];
    const before = head + pieces.slice(0, -1).map(piece => `${piece},`).join('');
    const equals = current.indexOf('=');
    if (equals === -1) return matching(SELECTOR_KEYS, current, false).map(key => ({ text: before + key }));
    const key = current.slice(0, equals);
    const typed = current.slice(equals + 1);
    const negated = typed.startsWith('!') ? '!' : '';
    const value = typed.slice(negated.length);
    let list: string[] = [];
    if (key === 'type') list = valuesOf({ kind: 'entity', values: [], name: 'entity', rest: false }, ctx);
    else if (key === 'gamemode') list = GAMEMODES;
    else if (key === 'sort') list = SORTS;
    return matching(list, value, key === 'type').map(item => ({ text: `${before}${key}=${negated}${item}` }));
}

const EXEC_SUBS = ['as', 'at', 'align', 'anchored', 'facing', 'in', 'positioned', 'rotated', 'if', 'unless', 'store', 'run'];
const EXEC_ARGS: Record<string, string[]> = {
    as: ['<targets>'], at: ['<targets>'], align: ['<axes:x|y|z|xy|xz|yz|xyz>'], anchored: ['eyes|feet'], in: ['<dimension>'],
    positioned: ['<x>', '<y>', '<z>'], rotated: ['<yaw>', '<pitch>'], facing: ['<x>', '<y>', '<z>'], on: ['attacker|controller|leasher|origin|owner|passengers|target|vehicle'], summon: ['<entity>'],
};
const EXEC_CONDITIONS: Record<string, string[]> = {
    block: ['<x>', '<y>', '<z>', '<block>'], biome: ['<x>', '<y>', '<z>', '<biome>'], blocks: ['<x>', '<y>', '<z>', '<x2>', '<y>', '<z2>', '<x>', '<y>', '<z>', 'all|masked'],
    data: ['block|entity|storage', '<target>', '<path>'], dimension: ['<dimension>'], entity: ['<targets>'], loaded: ['<x>', '<y>', '<z>'], predicate: ['<predicate>'],
    score: ['<targets>', '<objective>', '<|<=|=|>=|>|matches', '<value>'],
};
const EXEC_STORE: Record<string, string[]> = {
    score: ['<targets>', '<objective>'], bossbar: ['<id>', 'value|max'], block: ['<x>', '<y>', '<z>', '<path>', '<type:int|float|double|byte|short|long>', '<scale>'],
    entity: ['<targets>', '<path>', '<type:int|float|double|byte|short|long>', '<scale>'], storage: ['<id>', '<path>', '<type:int|float|double|byte|short|long>', '<scale>'],
};

/** Where `execute` stands after the words typed: an argument to fill in, or the command that follows `run` */
function executeNext(done: string[], version: string | undefined): { spec?: string; run?: string[] } {
    const old = (parseVersion(version) ?? [1, 99, 0]);
    if (old[0] === 1 && old[1] < 13) {
        // before 1.13: execute <entity> <x> <y> <z> <command...>
        if (done.length >= 4) return { run: done.slice(4) };
        return { spec: ['<targets>', '<x>', '<y>', '<z>'][done.length] };
    }
    let index = 0;
    const take = (spec: string): string | null => (index >= done.length ? spec : (index++, null));
    const sequence = (specs: string[]): string | null => {
        for (const spec of specs) { const pending = take(spec); if (pending) return pending; }
        return null;
    };
    const subs = [...EXEC_SUBS, ...(existsIn(version, '1.19.4') ? ['on'] : []), ...(existsIn(version, '1.20.2') ? ['summon'] : [])].join('|');
    for (;;) {
        const pending = take(subs);
        if (pending) return { spec: pending };
        const sub = lower(done[index - 1]);
        if (sub === 'run') return { run: done.slice(index) };
        if (sub === 'if' || sub === 'unless') {
            const choice = take(Object.keys(EXEC_CONDITIONS).join('|'));
            if (choice) return { spec: choice };
            const missing = sequence(EXEC_CONDITIONS[lower(done[index - 1])] ?? []);
            if (missing) return { spec: missing };
        } else if (sub === 'store') {
            const how = take('result|success');
            if (how) return { spec: how };
            const where = take(Object.keys(EXEC_STORE).join('|'));
            if (where) return { spec: where };
            const missing = sequence(EXEC_STORE[lower(done[index - 1])] ?? []);
            if (missing) return { spec: missing };
        } else {
            const specs = EXEC_ARGS[sub];
            if (!specs) return { spec: '' };
            const missing = sequence(specs);
            if (missing) return { spec: missing };
        }
    }
}

interface Words { suggestions: Suggestion[]; hint?: string; needs?: 'players'; usage?: string }

function fromArg(arg: Arg, typed: string, ctx: Context): Words {
    const selector = arg.kind === 'targets' ? selectorArguments(typed, ctx) : null;
    if (selector) return { suggestions: selector, needs: 'players' };
    // choices and typical numbers are offered by their start; names of things are also found by a part of them
    const values = matching(valuesOf(arg, ctx), typed, !['any', 'literal', 'coord', 'boolrule', 'introle', 'color', 'dimension'].includes(arg.kind));
    const needs = arg.kind === 'targets' || arg.kind === 'player' ? 'players' as const : undefined;
    return {
        suggestions: values.map(text => ({ text })),
        needs,
        hint: values.length === 0 && arg.kind !== 'literal' ? `<${arg.name}>` : undefined,
    };
}

function commandWords(definitions: Map<string, CommandDef>, done: string[], typed: string, ctx: Context): Words {
    const name = bare(done[0]);
    const command = definitions.get(name);
    if (!command) return { suggestions: [] };

    if (command.name === 'execute') {
        const next = executeNext(done.slice(1), ctx.version);
        if (next.run) return runWords(definitions, next.run, typed, ctx);
        return next.spec ? fromArg(parseArg(next.spec), typed, ctx) : { suggestions: [] };
    }

    const typedArgs = done.slice(1);
    const candidates: Array<{ arg: Arg; line: string }> = [];
    for (const line of command.syntax) {
        const args = parseSyntax(line);
        let fits = true;
        for (let index = 0; index < typedArgs.length && fits; index++) {
            const arg = args[Math.min(index, args.length - 1)];
            if (!arg) { fits = false; break; }
            if (index >= args.length && !arg.rest) fits = false;
            else if (!accepts(arg, typedArgs[index], ctx)) fits = false;
        }
        if (!fits) continue;
        const next = args[typedArgs.length] ?? (args.length > 0 && args[args.length - 1].rest ? args[args.length - 1] : undefined);
        if (next) candidates.push({ arg: next, line });
    }
    if (candidates.length === 0) return { suggestions: [], usage: command.syntax[0] };

    const seen = new Map<string, Suggestion>();
    let hint: string | undefined;
    let needs: 'players' | undefined;
    for (const { arg } of candidates) {
        const words = fromArg(arg, typed, ctx);
        for (const suggestion of words.suggestions) if (!seen.has(suggestion.text)) seen.set(suggestion.text, suggestion);
        hint ??= words.hint;
        needs ??= words.needs;
    }
    return { suggestions: [...seen.values()], hint: seen.size === 0 ? hint : undefined, needs, usage: candidates[0].line };
}

/** The command after `run` is a whole command again */
function runWords(definitions: Map<string, CommandDef>, done: string[], typed: string, ctx: Context): Words {
    if (done.length === 0) return nameWords(definitions, typed);
    return commandWords(definitions, done, typed, ctx);
}

function nameWords(definitions: Map<string, CommandDef>, typed: string): Words {
    const names = [...definitions.keys()].sort((a, b) => {
        const aNs = a.includes(':') && !a.startsWith('/') ? 1 : 0;
        const bNs = b.includes(':') && !b.startsWith('/') ? 1 : 0;
        return aNs !== bNs ? aNs - bNs : a.localeCompare(b);
    });
    const found = matching(names, typed);
    return { suggestions: found.map(text => ({ text, detail: definitions.get(text)?.summary })) };
}

/** Name and alias to definition for a server (built-in grammar merged with live server/plugin commands) */
export function definitionTable(ctx: Context): Map<string, CommandDef> {
    const table = new Map<string, CommandDef>();
    const builtins = commandsFor(ctx.flavor, ctx.version);
    const builtinNames = new Set(builtins.map(command => command.name));

    for (const command of builtins) {
        table.set(command.name, command);
        for (const alias of command.aliases ?? []) if (!table.has(alias)) table.set(alias, { ...command, name: command.name });
    }

    for (const extra of ctx.extraCommands ?? []) {
        const key = extra.name.toLowerCase();
        const existing = table.get(key);
        if (!existing) {
            table.set(key, extra);
        } else if (!builtinNames.has(key) && existing.syntax.length <= 1 && extra.syntax.length > 0 && extra.syntax[0].includes(' ')) {
            table.set(key, { ...extra, summary: existing.summary ?? extra.summary });
        } else if (existing && !existing.summary && extra.summary) {
            table.set(key, { ...existing, summary: extra.summary });
        }
        for (const alias of extra.aliases ?? []) {
            const aliasKey = alias.toLowerCase();
            if (!table.has(aliasKey)) table.set(aliasKey, { ...extra, name: key });
        }
    }
    return table;
}

export function complete(input: string, ctx: Context): Completion {
    const leading = input.length - input.trimStart().length;
    const slash = input.slice(leading).startsWith('/') ? 1 : 0;
    const body = input.slice(leading + slash);
    const words = body.split(' ');
    const typed = words[words.length - 1];
    const start = leading + slash + body.length - typed.length;
    const done = words.slice(0, -1);
    const table = definitionTable(ctx);

    // Nothing typed and no slash: there is nothing to complete yet
    if (done.length === 0 && typed === '' && slash === 0) return { start, suggestions: [] };
    const result = done.length === 0 ? nameWords(table, typed) : commandWords(table, done, typed, ctx);
    return { start, suggestions: result.suggestions.slice(0, 200), hint: result.hint, needs: result.needs, usage: result.usage };
}

/** Names of players that appear in a log: those who joined, left or said something */
export function namesInLog(log: string): string[] {
    const names = new Set<string>();
    for (const line of log.split('\n')) {
        const action = /(?:\]: |\s)([.*A-Za-z0-9_]{3,17}) (?:joined|left) the game/.exec(line) ?? /([.*A-Za-z0-9_]{3,17}) \(\/[^)]*\) has (?:connected|disconnected)/.exec(line);
        if (action) names.add(action[1]);
        const said = /\]: <([.*A-Za-z0-9_]{3,17})>/.exec(line);
        if (said) names.add(said[1]);
    }
    return [...names];
}
