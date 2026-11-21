/**
 * The commands a console can take and how their arguments go.
 *
 * A syntax is written like the usage text of the game: words are literal (`a|b` for a choice), `<name>` is a
 * value, `<name:one|two>` a value with typical entries, and `<text...>` takes the rest of the line. Only the longest
 * form of a command is written; its shorter forms are covered because completion looks at the words typed so far.
 */
import {
    DIFFICULTIES, GAMEMODES, WEATHER,
} from './data';

export type ServerFlavor = 'vanilla' | 'bukkit' | 'paper' | 'purpur' | 'forge' | 'fabric' | 'bedrock' | 'velocity' | 'bungee' | 'other';

export interface CommandDef {
    name: string;
    /** the forms of the command, longest first when one extends another */
    syntax: string[];
    since?: string;
    until?: string;
    /** only on these kinds of servers */
    only?: ServerFlavor[];
    /** other names of the same command */
    aliases?: string[];
    summary?: string;
}

const T = '<targets>';
const POS = '<x> <y> <z>';

function def(name: string, syntax: string[], extra: Partial<CommandDef> = {}): CommandDef {
    return { name, syntax, ...extra };
}

const VANILLA: CommandDef[] = [
    def('advancement', [`advancement grant|revoke ${T} everything`, `advancement grant|revoke ${T} only|from|until|through <advancement>`], { since: '1.12', summary: 'Give or take advancements' }),
    def('attribute', [`attribute ${T} <attribute> get|base|modifier`], { since: '1.16', summary: 'Read or change attributes' }),
    def('ban', ['ban <player> <reason...>'], { summary: 'Ban a player' }),
    def('ban-ip', ['ban-ip <player> <reason...>'], { summary: 'Ban an address' }),
    def('banlist', ['banlist ips|players'], { summary: 'Show the bans' }),
    def('bossbar', ['bossbar add|get|list|remove|set <id>'], { since: '1.13', summary: 'Manage boss bars' }),
    def('clear', [`clear ${T} <item> <count>`], { summary: 'Clear items from inventories' }),
    def('clone', [`clone ${POS} ${POS} ${POS} replace|masked|filtered normal|force|move`], { summary: 'Copy blocks' }),
    def('damage', [`damage ${T} <amount> <damageType>`], { since: '1.19.4', summary: 'Damage entities' }),
    def('data', ['data get|merge|modify|remove block|entity|storage <target>'], { since: '1.13', summary: 'Read and edit data' }),
    def('datapack', ['datapack enable|disable|list|list <pack>'], { since: '1.13', summary: 'Manage data packs' }),
    def('debug', ['debug start|stop|report'], { summary: 'Profile the server' }),
    def('defaultgamemode', [`defaultgamemode ${GAMEMODES.join('|')}`], { summary: 'The default game mode' }),
    def('deop', ['deop <player>'], { summary: 'Remove an operator' }),
    def('difficulty', [`difficulty ${DIFFICULTIES.join('|')}`], { summary: 'The difficulty' }),
    def('effect', [`effect give ${T} <effect> <seconds:30|60|600|1000000> <amplifier:0|1|2|4> <hide:true|false>`, `effect clear ${T} <effect>`], { since: '1.13', summary: 'Give or clear effects' }),
    def('effect', [`effect ${T} <effect> <seconds> <amplifier> <hide:true|false>`], { until: '1.12.2', summary: 'Give effects' }),
    def('enchant', [`enchant ${T} <enchantment> <level:1|2|3|4|5>`], { summary: 'Enchant the held item' }),
    def('execute', ['execute <subcommand>'], { summary: 'Run a command as or at something' }),
    def('experience', [`experience add|set ${T} <amount> points|levels`, `experience query ${T} points|levels`], { since: '1.13', aliases: ['xp'], summary: 'Add or take experience' }),
    def('fill', [`fill ${POS} ${POS} <block> replace|destroy|hollow|keep|outline <filter>`], { summary: 'Fill an area with a block' }),
    def('fillbiome', [`fillbiome ${POS} ${POS} <biome>`], { since: '1.19.3', summary: 'Change the biome of an area' }),
    def('forceload', ['forceload add|remove|query <x> <z> <x2> <z2>', 'forceload remove all'], { since: '1.13', summary: 'Keep chunks loaded' }),
    def('function', ['function <function>'], { since: '1.12', summary: 'Run a function' }),
    def('gamemode', [`gamemode ${GAMEMODES.join('|')} ${T}`], { summary: 'Change the game mode' }),
    def('gamerule', ['gamerule <boolrule> true|false', 'gamerule <introle> <value>'], { summary: 'Change a rule of the world' }),
    def('give', [`give ${T} <item> <count:1|16|32|64>`], { summary: 'Give items' }),
    def('help', ['help <command>'], { summary: 'List the commands' }),
    def('item', [`item replace|modify block|entity <target>`], { since: '1.17', summary: 'Change items in a slot' }),
    def('jfr', ['jfr start|stop'], { since: '1.18', summary: 'Record a Java Flight Recorder profile' }),
    def('kick', ['kick <player> <reason...>'], { summary: 'Remove a player' }),
    def('kill', [`kill ${T}`], { summary: 'Kill entities' }),
    def('list', ['list uuids'], { summary: 'Who is online' }),
    def('locate', ['locate structure|biome|poi <value>'], { since: '1.19', summary: 'Find a structure or biome' }),
    def('locate', ['locate <structure>'], { until: '1.18.2', summary: 'Find a structure' }),
    def('locatebiome', ['locatebiome <biome>'], { since: '1.16.2', until: '1.18.2', summary: 'Find a biome' }),
    def('loot', ['loot give|insert|replace|spawn <target>'], { since: '1.14', summary: 'Drop loot' }),
    def('me', ['me <action...>'], { summary: 'Say an action' }),
    def('msg', [`msg ${T} <message...>`], { aliases: ['tell', 'w'], summary: 'Message a player' }),
    def('op', ['op <player>'], { summary: 'Make an operator' }),
    def('pardon', ['pardon <player>'], { summary: 'Unban a player' }),
    def('pardon-ip', ['pardon-ip <address>'], { summary: 'Unban an address' }),
    def('particle', [`particle <particle> ${POS}`], { summary: 'Show a particle' }),
    def('perf', ['perf start|stop'], { since: '1.18.2', summary: 'Record server performance' }),
    def('place', ['place feature|jigsaw|structure|template <name> <x> <y> <z>'], { since: '1.19', summary: 'Place a feature or structure' }),
    def('playsound', [`playsound <sound> master|music|record|weather|block|hostile|neutral|player|ambient|voice ${T}`], { summary: 'Play a sound' }),
    def('publish', ['publish <port>'], { summary: 'Open to the network' }),
    def('random', ['random value|roll|reset <range>'], { since: '1.20.2', summary: 'Draw random numbers' }),
    def('recipe', [`recipe give|take ${T} <recipe>`], { since: '1.12', summary: 'Give or take recipes' }),
    def('reload', ['reload'], { since: '1.12', summary: 'Reload data packs' }),
    def('return', ['return <value>', 'return run <command>'], { since: '1.20', summary: 'Stop a function' }),
    def('ride', [`ride ${T} mount|dismount <vehicle>`], { since: '1.19.4', summary: 'Mount or dismount' }),
    def('rotate', [`rotate ${T} <yaw> <pitch>`], { since: '1.21.2', summary: 'Rotate an entity' }),
    def('save-all', ['save-all flush'], { summary: 'Save the world' }),
    def('save-off', ['save-off'], { summary: 'Stop saving' }),
    def('save-on', ['save-on'], { summary: 'Start saving' }),
    def('say', ['say <message...>'], { summary: 'Message everyone' }),
    def('schedule', ['schedule function <function> <time> append|replace', 'schedule clear <function>'], { since: '1.14', summary: 'Run a function later' }),
    def('scoreboard', ['scoreboard objectives|players add|list|remove|setdisplay|modify <name>'], { since: '1.13', summary: 'Scores and objectives' }),
    def('seed', ['seed'], { summary: 'Show the world seed' }),
    def('setblock', [`setblock ${POS} <block> replace|destroy|keep`], { summary: 'Set a block' }),
    def('setidletimeout', ['setidletimeout <minutes>'], { summary: 'Kick idle players after' }),
    def('setworldspawn', [`setworldspawn ${POS} <angle>`], { summary: 'Set the world spawn' }),
    def('spawnpoint', [`spawnpoint ${T} ${POS} <angle>`], { summary: 'Set the spawn point of a player' }),
    def('spectate', [`spectate <target> ${T}`], { since: '1.15', summary: 'Spectate an entity' }),
    def('spreadplayers', [`spreadplayers <x> <z> <spreadDistance> <maxRange> <respectTeams:true|false> ${T}`], { summary: 'Spread entities around' }),
    def('stop', ['stop'], { summary: 'Stop the server' }),
    def('stopsound', [`stopsound ${T} * <sound>`], { since: '1.13', summary: 'Stop a sound' }),
    def('summon', [`summon <entity> ${POS} <nbt>`], { summary: 'Summon an entity' }),
    def('tag', [`tag ${T} add|remove <name>`, `tag ${T} list`], { summary: 'Tag entities' }),
    def('team', ['team add|empty|join|leave|list|modify|remove <team>'], { since: '1.13', summary: 'Manage teams' }),
    def('teammsg', ['teammsg <message...>'], { since: '1.13', aliases: ['tm'], summary: 'Message your team' }),
    def('teleport', [`teleport ${T} ${POS} <yaw> <pitch>`, `teleport ${T} ${T}`], { since: '1.13', aliases: ['tp'], summary: 'Teleport entities' }),
    def('tp', [`tp ${T} ${POS} <yaw> <pitch>`, `tp ${T} ${T}`], { until: '1.12.2', summary: 'Teleport entities' }),
    def('tellraw', [`tellraw ${T} <json...>`], { summary: 'Send a JSON message' }),
    def('tick', ['tick query|rate|freeze|unfreeze|step|sprint <value>'], { since: '1.20.3', summary: 'Control the tick rate' }),
    def('time', [`time set day|night|noon|midnight`, 'time set <ticks:0|1000|6000|13000|18000>', 'time add <ticks:1000|6000|12000>', 'time query daytime|gametime|day'], { summary: 'Change or read the time' }),
    def('title', [`title ${T} title|subtitle|actionbar <json...>`, `title ${T} clear|reset`, `title ${T} times <fadeIn> <stay> <fadeOut>`], { summary: 'Show a title' }),
    def('transfer', [`transfer <host> <port> ${T}`], { since: '1.20.5', summary: 'Send a player to another server' }),
    def('trigger', ['trigger <objective> add|set <value>'], { since: '1.13', summary: 'Set a trigger' }),
    def('weather', [`weather ${WEATHER.join('|')} <seconds:300|1200|6000>`], { summary: 'Change the weather' }),
    def('whitelist', ['whitelist add|remove <player>', 'whitelist on|off|list|reload'], { summary: 'The whitelist' }),
    def('worldborder', ['worldborder add|set <distance> <time>', 'worldborder center <x> <z>', 'worldborder damage amount|buffer <value>', 'worldborder get|warning distance|time <value>'], { summary: 'The world border' }),
];

// Bukkit and its relatives bring their own
const BUKKIT: CommandDef[] = [
    def('plugins', ['plugins'], { aliases: ['pl'], only: ['bukkit', 'paper', 'purpur'], summary: 'List the plugins' }),
    def('version', ['version <plugin>'], { aliases: ['ver', 'about'], only: ['bukkit', 'paper', 'purpur'], summary: 'The version of the server' }),
    def('reload', ['reload confirm'], { only: ['bukkit', 'paper', 'purpur'], summary: 'Reload the plugins' }),
    def('timings', ['timings on|off|paste|reset|report|merged'], { only: ['bukkit', 'paper', 'purpur'], summary: 'Timings of the server' }),
    def('tps', ['tps'], { only: ['paper', 'purpur', 'forge'], summary: 'Ticks per second' }),
    def('mspt', ['mspt'], { only: ['paper', 'purpur'], summary: 'Milliseconds per tick' }),
    def('paper', ['paper version|reload|dumpitem|mobcaps|fixlight|entity|chunkinfo|syncloadinfo|dumplisteners'], { only: ['paper', 'purpur'], summary: 'Paper tools' }),
    def('spigot', ['spigot reload|tps'], { only: ['bukkit', 'paper', 'purpur'], summary: 'Spigot tools' }),
    def('purpur', ['purpur reload|version|ram|uptime|credits'], { only: ['purpur'], summary: 'Purpur tools' }),
    def('restart', ['restart'], { only: ['bukkit', 'paper', 'purpur'], summary: 'Restart the server' }),
    def('minecraft:help', ['minecraft:help'], { only: ['bukkit', 'paper', 'purpur'], summary: 'Vanilla help' }),
    def('op', ['op <player>'], { only: ['bukkit', 'paper', 'purpur'], summary: 'Make an operator' }),
    def('ban', ['ban <player> <reason...>'], { only: ['bukkit', 'paper', 'purpur'], summary: 'Ban a player' }),
    def('tell', [`tell ${T} <message...>`], { only: ['bukkit', 'paper', 'purpur'], summary: 'Message a player' }),
    def('spark', ['spark profiler|tps|healthreport|gc|heapsummary|sampler'], { only: ['paper', 'purpur', 'forge', 'fabric'], summary: 'The spark profiler, when it is installed' }),
];

const FORGE: CommandDef[] = [
    def('forge', ['forge tps|entity|tracking|dimensions|mods|generate'], { only: ['forge'], summary: 'Forge tools' }),
    def('neoforge', ['neoforge tps|entity|tracking|dimensions|mods|generate'], { only: ['forge'], summary: 'NeoForge tools' }),
];

const VELOCITY: CommandDef[] = [
    def('server', ['server <server>'], { only: ['velocity', 'bungee'], summary: 'Switch to a server' }),
    def('send', ['send <player> <server>'], { only: ['velocity', 'bungee'], summary: 'Send a player to a server' }),
    def('glist', ['glist all'], { only: ['velocity', 'bungee'], summary: 'List the players of the network' }),
    def('velocity', ['velocity info|plugins|reload|dump|heap|version'], { only: ['velocity'], summary: 'Velocity tools' }),
    def('shutdown', ['shutdown <reason...>'], { only: ['velocity'], aliases: ['end'], summary: 'Stop the proxy' }),
    def('end', ['end'], { only: ['bungee'], summary: 'Stop the proxy' }),
    def('alert', ['alert <message...>'], { only: ['bungee'], summary: 'Message everyone on the network' }),
    def('alertraw', ['alertraw <json...>'], { only: ['bungee'], summary: 'Send a JSON message to everyone' }),
    def('bungee', ['bungee'], { only: ['bungee'], summary: 'Version of the proxy' }),
    def('find', ['find <player>'], { only: ['bungee'], summary: 'Find a player' }),
    def('ip', ['ip <player>'], { only: ['bungee'], summary: 'The address of a player' }),
    def('perms', ['perms'], { only: ['bungee'], summary: 'Your permissions' }),
    def('list', ['list'], { only: ['bungee'], summary: 'Who is online' }),
    def('say', ['say <message...>'], { only: ['bungee'], summary: 'Message everyone' }),
];

const BEDROCK: CommandDef[] = ['list', 'say <message...>', 'kick <player> <reason...>', 'op <player>', 'deop <player>', 'whitelist add|remove|list|on|off|reload', 'gamemode survival|creative|adventure <player>', 'tp <player> <x> <y> <z>', 'give <player> <item> <count:1|16|32|64>', 'time set day|night|noon|midnight', 'weather clear|rain|thunder', 'difficulty peaceful|easy|normal|hard', 'stop', 'save hold|query|resume', 'kill <player>']
    .map(syntax => def(syntax.split(' ')[0], [syntax], { only: ['bedrock'] }));

/** Version numbers as [major, minor, patch], with the leading "1." kept. Unknown versions count as the newest. */
export function parseVersion(version: string | undefined): number[] | null {
    const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec((version ?? '').trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}

function compare(a: number[], b: number[]): number {
    for (let index = 0; index < 3; index++) {
        const difference = (a[index] ?? 0) - (b[index] ?? 0);
        if (difference !== 0) return difference;
    }
    return 0;
}

/** Whether something that came in `since` and left after `until` exists in the version (unknown = the newest) */
export function existsIn(version: string | undefined, since?: string, until?: string): boolean {
    const current = parseVersion(version);
    if (!current) return !until; // the newest version has nothing that was removed
    if (since) { const from = parseVersion(since); if (from && compare(current, from) < 0) return false; }
    if (until) { const to = parseVersion(until); if (to && compare(current, to) > 0) return false; }
    return true;
}

export function flavorOf(type: string | undefined, kind: 'server' | 'proxy' = 'server'): ServerFlavor {
    const name = (type ?? '').toLowerCase();
    if (kind === 'proxy') return name.includes('velocity') ? 'velocity' : name ? 'bungee' : 'velocity';
    if (/bedrock/.test(name)) return 'bedrock';
    if (/purpur/.test(name)) return 'purpur';
    if (/paper|folia|pufferfish|leaf|canvas/.test(name)) return 'paper';
    if (/spigot|bukkit|craftbukkit/.test(name)) return 'bukkit';
    if (/forge|neoforge/.test(name)) return 'forge';
    if (/fabric|quilt/.test(name)) return 'fabric';
    if (/vanilla|^$/.test(name)) return 'vanilla';
    return 'other';
}

/** Every command that a server of this kind and version knows. The last definition of a name wins for the same version. */
export function commandsFor(flavor: ServerFlavor, version: string | undefined): CommandDef[] {
    const proxy = flavor === 'velocity' || flavor === 'bungee';
    const pool = proxy ? VELOCITY : flavor === 'bedrock' ? BEDROCK : [...VANILLA, ...BUKKIT, ...FORGE];
    const versioned = !proxy && flavor !== 'bedrock';
    const all = pool.filter(command => (!command.only || command.only.includes(flavor)) && (!versioned || existsIn(version, command.since, command.until)));
    // Later definitions (those of a flavor) replace earlier ones of the same name
    const byName = new Map<string, CommandDef>();
    for (const command of all) byName.set(command.name, command);
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
