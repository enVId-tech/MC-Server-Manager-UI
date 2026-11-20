import type { OptionChoice, OptionDefinition, OptionTab } from './types';

/**
 * Catalog of the environment variables of itzg/minecraft-server, grouped the way the wizard and the
 * dashboard show them. Source: https://docker-minecraft-server.readthedocs.io
 *
 * `types` limits an option to some server types (ids or "family:<name>", "plugins", "mods") and
 * `minVersion` / `maxVersion` limit it to a range of Minecraft versions, so the interface only offers
 * what the chosen server can really use.
 */

type Base = Pick<OptionDefinition, 'env' | 'label' | 'description' | 'tab' | 'group'>;
type Extra = Partial<Omit<OptionDefinition, keyof Base | 'kind'>>;

function make(kind: OptionDefinition['kind'], tab: OptionTab, group: string) {
    return (env: string, label: string, description: string, extra: Extra = {}): OptionDefinition => ({
        env, label, description, tab, group, kind, ...extra,
    });
}

const choices = (...values: Array<string | [string, string]>): OptionChoice[] =>
    values.map(entry => (Array.isArray(entry) ? { value: entry[0], label: entry[1] } : { value: entry, label: entry }));

const PLUGIN_TYPES = ['plugins'];
const MOD_TYPES = ['mods'];
const BUKKIT_LIKE = ['family:bukkit', 'family:hybrid'];

const RCON_LOCK = 'Managed by the platform: the manager uses RCON for the console and sets it up itself.';
const PORT_LOCK = 'Managed by the platform: ports are allocated for you and mapped to the container.';

// -------------------------------------------------------------------------------------------------
// General tab
// -------------------------------------------------------------------------------------------------

const generalServer = (() => {
    const text = make('text', 'general', 'Server');
    const num = make('number', 'general', 'Server');
    const bool = make('boolean', 'general', 'Server');
    const select = make('select', 'general', 'Server');
    return [
        text('MOTD', 'Message of the day', 'Shown in the multiplayer server list. Colour codes and \\n line breaks are supported.', { formField: 'motd', property: 'motd' }),
        select('DIFFICULTY', 'Difficulty', 'How hard the game is.', {
            defaultValue: 'easy', formField: 'difficulty', property: 'difficulty',
            choices: choices('peaceful', 'easy', 'normal', 'hard'),
        }),
        select('MODE', 'Default game mode', 'Game mode new players start in. Spectator needs 1.8 or newer.', {
            defaultValue: 'survival', formField: 'gameMode', property: 'gamemode',
            choices: choices('survival', 'creative', 'adventure', 'spectator'),
        }),
        bool('FORCE_GAMEMODE', 'Force game mode', 'Put players back into the default game mode every time they join.', { defaultValue: false, property: 'force-gamemode' }),
        bool('HARDCORE', 'Hardcore', 'Players are put into spectator mode when they die. Locks the difficulty to hard.', { defaultValue: false, property: 'hardcore' }),
        text('SERVER_NAME', 'Internal server name', 'Name the server reports about itself (server-name).', { property: 'server-name' }),
        text('ICON', 'Server icon', 'URL or container path of an image. It is downloaded, scaled to 64x64 and converted to PNG.', { placeholder: 'https://example.com/icon.png' }),
        bool('OVERRIDE_ICON', 'Replace existing icon', 'Replace server-icon.png even when one already exists.', { defaultValue: false }),
        text('BUG_REPORT_LINK', 'Bug report link', 'Link shown on the crash screen of clients.', { property: 'bug-report-link', minVersion: '1.21' }),
        bool('ACCEPTS_TRANSFERS', 'Accept transfers', 'Allow players to be transferred here from other servers.', { defaultValue: false, property: 'accepts-transfers', minVersion: '1.20.5' }),
        num('STOP_DURATION', 'Graceful stop time', 'Seconds the container waits for the server to save and stop before it is killed.', { defaultValue: 60, min: 0 }),
        num('STOP_SERVER_ANNOUNCE_DELAY', 'Shutdown announcement delay', 'Seconds players get to finish up after the shutdown is announced.', { min: 0 }),
        text('STOP_SERVER_DELAY_COMMAND', 'Shutdown delay command', 'Command that runs at the start of the delay instead of the default announcement.', { expert: true }),
    ];
})();

const generalPlayers = (() => {
    const text = make('text', 'general', 'Players and access');
    const num = make('number', 'general', 'Players and access');
    const bool = make('boolean', 'general', 'Players and access');
    const select = make('select', 'general', 'Players and access');
    const list = make('list', 'general', 'Players and access');
    return [
        num('MAX_PLAYERS', 'Maximum players', 'How many players can be online at once.', { defaultValue: 20, min: 1, max: 10000, formField: 'maxPlayers', property: 'max-players' }),
        bool('ONLINE_MODE', 'Online mode', 'Check player accounts with Mojang. Turn this off only behind a proxy or for offline play.', { defaultValue: true, formField: 'onlineMode', property: 'online-mode' }),
        bool('ENABLE_WHITELIST', 'Enable whitelist', 'Only players on the whitelist may join.', { defaultValue: false, formField: 'whitelistEnabled', property: 'white-list' }),
        bool('ENFORCE_WHITELIST', 'Enforce whitelist', 'Kick players who are removed from the whitelist right away.', { defaultValue: false, formField: 'enforceWhitelist', property: 'enforce-whitelist', minVersion: '1.9' }),
        list('WHITELIST', 'Whitelisted players', 'Usernames or UUIDs, one per line or separated by commas. Setting it also turns the whitelist on.'),
        text('WHITELIST_FILE', 'Whitelist file', 'URL or container path of a whitelist.json to use.', { expert: true }),
        select('EXISTING_WHITELIST_FILE', 'When a whitelist exists', 'What happens when the whitelist file already exists on startup.', {
            defaultValue: 'SYNC_FILE_MERGE_LIST', expert: true,
            choices: choices('SKIP', 'SYNCHRONIZE', 'MERGE', 'SYNC_FILE_MERGE_LIST'),
        }),
        bool('OVERRIDE_WHITELIST', 'Regenerate whitelist on start', 'Legacy switch: true rebuilds the whitelist on every start, false leaves an existing file alone.', { expert: true }),
        list('OPS', 'Operators', 'Usernames or UUIDs that get operator status, one per line or separated by commas.'),
        text('OPS_FILE', 'Operators file', 'URL or container path of an ops.json to use.', { expert: true }),
        select('EXISTING_OPS_FILE', 'When an ops file exists', 'What happens when the ops file already exists on startup.', {
            defaultValue: 'SYNC_FILE_MERGE_LIST', expert: true,
            choices: choices('SKIP', 'SYNCHRONIZE', 'MERGE', 'SYNC_FILE_MERGE_LIST'),
        }),
        bool('OVERRIDE_OPS', 'Regenerate ops on start', 'Legacy switch: true rebuilds the ops list on every start, false leaves an existing file alone.', { expert: true }),
        select('USER_API_PROVIDER', 'Username lookup service', 'Service used to turn usernames into UUIDs.', { choices: choices(['playerdb', 'PlayerDB'], ['mojang', 'Mojang']), defaultValue: 'playerdb', expert: true }),
        num('OP_PERMISSION_LEVEL', 'Operator permission level', 'Permission level operators get, from 1 to 4.', { defaultValue: 4, min: 0, max: 4, property: 'op-permission-level' }),
        num('FUNCTION_PERMISSION_LEVEL', 'Function permission level', 'Permission level data pack functions run with.', { defaultValue: 2, min: 1, max: 4, property: 'function-permission-level', minVersion: '1.14' }),
        num('PLAYER_IDLE_TIMEOUT', 'Idle kick time', 'Minutes of inactivity before a player is kicked. 0 never kicks.', { defaultValue: 0, min: 0, property: 'player-idle-timeout' }),
        bool('PREVENT_PROXY_CONNECTIONS', 'Prevent proxy connections', 'Reject players who connect through a proxy or VPN that Mojang flags.', { defaultValue: false, formField: 'preventProxyConnections', property: 'prevent-proxy-connections', minVersion: '1.9' }),
        bool('HIDE_ONLINE_PLAYERS', 'Hide online players', 'Do not show the player list in the server list.', { defaultValue: false, formField: 'hideOnlinePlayers', property: 'hide-online-players', minVersion: '1.18' }),
        bool('ENFORCE_SECURE_PROFILE', 'Enforce secure profiles', 'Only accept chat messages that are signed by the player.', { defaultValue: true, property: 'enforce-secure-profile', minVersion: '1.19' }),
        bool('BROADCAST_CONSOLE_TO_OPS', 'Show console output to operators', 'Operators see the commands that run in the console.', { defaultValue: true, formField: 'broadcastConsoleToOps', property: 'broadcast-console-to-ops' }),
        bool('BROADCAST_RCON_TO_OPS', 'Show RCON output to operators', 'Operators see the commands that run through RCON.', { defaultValue: true, formField: 'broadcastRconToOps', property: 'broadcast-rcon-to-ops' }),
        bool('LOG_IPS', 'Log player IP addresses', 'Write player IP addresses to the server log.', { defaultValue: true, property: 'log-ips' }),
    ];
})();

const generalResourcePack = (() => {
    const text = make('text', 'general', 'Resource pack');
    const bool = make('boolean', 'general', 'Resource pack');
    return [
        text('RESOURCE_PACK', 'Resource pack URL', 'Link to a resource pack that clients download when they join.', { formField: 'resourcePackUrl', property: 'resource-pack' }),
        text('RESOURCE_PACK_SHA1', 'Resource pack SHA-1', 'Checksum clients use to verify the download.', { formField: 'resourcePackSha1', property: 'resource-pack-sha1' }),
        text('RESOURCE_PACK_ID', 'Resource pack ID', 'UUID that identifies the pack so clients can replace it later.', { property: 'resource-pack-id', minVersion: '1.20.3' }),
        text('RESOURCE_PACK_PROMPT', 'Resource pack prompt', 'Message shown when a client is asked to accept the pack.', { formField: 'resourcePackPrompt', property: 'resource-pack-prompt', minVersion: '1.17' }),
        bool('RESOURCE_PACK_ENFORCE', 'Require resource pack', 'Kick players who decline the pack.', { defaultValue: false, formField: 'forceResourcePack', property: 'require-resource-pack', minVersion: '1.17' }),
    ];
})();

// -------------------------------------------------------------------------------------------------
// World tab
// -------------------------------------------------------------------------------------------------

const worldGeneration = (() => {
    const text = make('text', 'world', 'World generation');
    const num = make('number', 'world', 'World generation');
    const bool = make('boolean', 'world', 'World generation');
    const select = make('select', 'world', 'World generation');
    const list = make('list', 'world', 'World generation');
    const multiline = make('multiline', 'world', 'World generation');
    return [
        text('SEED', 'World seed', 'Seed used when the world is created. Leave empty for a random world.', { formField: 'seed', property: 'level-seed' }),
        select('LEVEL_TYPE', 'World type', 'Kind of world that is generated. Names changed in 1.16, the server accepts both.', {
            defaultValue: 'DEFAULT', formField: 'worldType', formLowercase: true, property: 'level-type',
            choices: choices(['DEFAULT', 'Default'], ['FLAT', 'Superflat'], ['LARGEBIOMES', 'Large biomes'], ['AMPLIFIED', 'Amplified'], ['SINGLE_BIOME_SURFACE', 'Single biome'], ['CUSTOMIZED', 'Customized']),
        }),
        multiline('GENERATOR_SETTINGS', 'Generator settings', 'Settings for flat or custom worlds. A JSON object from 1.16 on, a preset string before that.', { property: 'generator-settings' }),
        bool('GENERATE_STRUCTURES', 'Generate structures', 'Villages, strongholds and other structures appear in new chunks.', { defaultValue: true, formField: 'generateStructuresEnabled', property: 'generate-structures' }),
        bool('ALLOW_NETHER', 'Allow the Nether', 'Players can travel to the Nether.', { defaultValue: true, property: 'allow-nether' }),
        text('LEVEL', 'World folder name', 'Name of the folder the world is saved in.', { defaultValue: 'world', property: 'level-name' }),
        num('MAX_WORLD_SIZE', 'Maximum world size', 'Radius of the world border limit, in blocks.', { defaultValue: 29999984, min: 1, max: 29999984, property: 'max-world-size' }),
        num('MAX_BUILD_HEIGHT', 'Maximum build height', 'Highest block players can build at.', { defaultValue: 256, min: 64, max: 256, property: 'max-build-height', maxVersion: '1.17' }),
        list('INITIAL_ENABLED_PACKS', 'Data packs enabled at creation', 'Data packs that are on when the world is first created, for example update_1_20.', { minVersion: '1.19' }),
        list('INITIAL_DISABLED_PACKS', 'Data packs disabled at creation', 'Data packs that are turned off when the world is first created.', { minVersion: '1.19' }),
        text('WORLD', 'World to import', 'URL or container path of a world archive (zip or tar) to extract into the world folder.', { expert: true }),
        bool('FORCE_WORLD_COPY', 'Replace world on start', 'Overwrite the world with the imported archive every time the server starts.', { defaultValue: false, expert: true }),
        select('REGION_FILE_COMPRESSION', 'Region file compression', 'Compression for chunk data saved to disk.', {
            defaultValue: 'deflate', property: 'region-file-compression', minVersion: '1.20.5',
            choices: choices('deflate', 'lz4', 'none'),
        }),
    ];
})();

const worldGameplay = (() => {
    const num = make('number', 'world', 'Gameplay');
    const bool = make('boolean', 'world', 'Gameplay');
    return [
        bool('PVP', 'Player versus player', 'Players can damage each other.', { defaultValue: true, formField: 'pvpEnabled', property: 'pvp' }),
        bool('ALLOW_FLIGHT', 'Allow flight', 'Do not kick players for flying, which mods or plugins can allow.', { defaultValue: false, formField: 'flightEnabled', property: 'allow-flight' }),
        bool('ENABLE_COMMAND_BLOCK', 'Command blocks', 'Command blocks run their commands.', { defaultValue: false, formField: 'commandBlocksEnabled', property: 'enable-command-block' }),
        bool('SPAWN_ANIMALS', 'Spawn animals', 'Animals appear naturally.', { defaultValue: true, formField: 'spawnAnimalsEnabled', property: 'spawn-animals' }),
        bool('SPAWN_MONSTERS', 'Spawn monsters', 'Hostile mobs appear naturally.', { defaultValue: true, formField: 'spawnMonstersEnabled', property: 'spawn-monsters' }),
        bool('SPAWN_NPCS', 'Spawn villagers', 'Villagers and other NPCs appear.', { defaultValue: true, formField: 'spawnNpcsEnabled', property: 'spawn-npcs' }),
        num('SPAWN_PROTECTION', 'Spawn protection radius', 'Blocks around the world spawn that only operators can change. 0 turns it off.', { defaultValue: 16, min: 0, max: 1000, formField: 'spawnProtection', property: 'spawn-protection' }),
        num('MAX_ENTITY_CRAMMING', 'Entity cramming limit', 'Number of entities in one block before they take damage.', { defaultValue: 24, min: 0, property: 'max-entity-cramming', expert: true }),
        num('MAX_ENTITY_COLLISION_RADIUS', 'Entity collision radius', 'Radius used for entity collision checks.', { property: 'max-entity-collision-radius', expert: true }),
        num('ENTITY_BROADCAST_RANGE_PERCENTAGE', 'Entity broadcast range', 'How far away entities are sent to players, as a percentage.', { defaultValue: 100, min: 10, max: 1000, property: 'entity-broadcast-range-percentage', expert: true }),
        num('MAX_COMMAND_CHAIN_LENGTH', 'Command chain limit', 'Most commands a single command chain may run.', { defaultValue: 65536, min: 0, property: 'max-command-chain-length', minVersion: '1.19', expert: true }),
        num('MAX_FUNCTION_CHAIN_DEPTH', 'Function chain depth', 'Deepest nesting of data pack functions.', { defaultValue: 10, min: 0, property: 'max-function-chain-depth', expert: true }),
        num('MAX_NEIGHBORS', 'Neighbor update limit', 'Number of block neighbours updated by one change.', { property: 'max-neighbors', expert: true }),
        num('MAX_CHAINED_NEIGHBOR_UPDATES', 'Chained neighbor updates', 'Most chained block updates before the rest are skipped.', { defaultValue: 1000000, property: 'max-chained-neighbor-updates', minVersion: '1.19.4', expert: true }),
        bool('ANNOUNCE_PLAYER_ACHIEVEMENTS', 'Announce achievements', 'Tell everyone when a player earns an achievement.', { defaultValue: true, property: 'announce-player-achievements', maxVersion: '1.12' }),
    ];
})();

const worldPerformance = (() => {
    const num = make('number', 'world', 'Performance');
    const bool = make('boolean', 'world', 'Performance');
    return [
        num('VIEW_DISTANCE', 'View distance', 'Chunks sent to each player in every direction.', { defaultValue: 10, min: 2, max: 32, formField: 'viewDistance', property: 'view-distance' }),
        num('SIMULATION_DISTANCE', 'Simulation distance', 'Chunks around a player where mobs and crops are ticked.', { defaultValue: 10, min: 3, max: 32, formField: 'simulationDistance', property: 'simulation-distance', minVersion: '1.18' }),
        num('MAX_TICK_TIME', 'Watchdog tick time', 'Milliseconds a single tick may take before the watchdog stops the server. -1 turns it off.', { defaultValue: 60000, min: -1, property: 'max-tick-time' }),
        num('NETWORK_COMPRESSION_THRESHOLD', 'Network compression threshold', 'Packets larger than this many bytes are compressed. -1 turns compression off.', { defaultValue: 256, min: -1, property: 'network-compression-threshold' }),
        bool('SYNC_CHUNK_WRITES', 'Synchronous chunk writes', 'Write chunks to disk on the main thread, which is safer when the process is killed.', { defaultValue: true, property: 'sync-chunk-writes', minVersion: '1.16' }),
        num('RATE_LIMIT', 'Packet rate limit', 'Packets per second a client may send before it is kicked. 0 turns it off.', { defaultValue: 0, min: 0, property: 'rate-limit', minVersion: '1.18' }),
        bool('USE_NATIVE_TRANSPORT', 'Native transport', 'Use the faster Linux network stack.', { defaultValue: true, property: 'use-native-transport' }),
        num('PAUSE_WHEN_EMPTY_SECONDS', 'Pause when empty', 'Seconds after the last player leaves before the server pauses ticking. -1 never pauses.', { defaultValue: 60, min: -1, property: 'pause-when-empty-seconds', minVersion: '1.21.2' }),
        num('STATUS_HEARTBEAT_INTERVAL', 'Status heartbeat interval', 'Seconds between status heartbeats. 0 turns it off.', { min: 0, property: 'status-heartbeat-interval', expert: true }),
        bool('ENABLE_STATUS', 'Respond to status requests', 'Answer server list pings. Turn off to appear offline in the server list.', { defaultValue: true, property: 'enable-status' }),
        bool('SNOOPER_ENABLED', 'Send snooper data', 'Send anonymous usage data to Mojang.', { defaultValue: true, property: 'snooper-enabled', maxVersion: '1.18' }),
    ];
})();

// -------------------------------------------------------------------------------------------------
// Plugins and mods tab
// -------------------------------------------------------------------------------------------------

const modsIndividual = (() => {
    const text = make('text', 'mods', 'Mods and plugins to download');
    const bool = make('boolean', 'mods', 'Mods and plugins to download');
    const num = make('number', 'mods', 'Mods and plugins to download');
    const list = make('list', 'mods', 'Mods and plugins to download');
    return [
        list('PLUGINS', 'Plugin downloads', 'Jar URLs, container paths or folders, one per line. Entries you remove are deleted again.', { types: PLUGIN_TYPES }),
        text('PLUGINS_FILE', 'Plugin list file', 'URL or container path of a text file with one plugin URL per line.', { types: PLUGIN_TYPES, expert: true }),
        list('MODS', 'Mod downloads', 'Jar URLs, container paths or folders, one per line. Entries you remove are deleted again.', { types: MOD_TYPES }),
        text('MODS_FILE', 'Mod list file', 'URL or container path of a text file with one mod URL per line.', { types: MOD_TYPES, expert: true }),
        list('SPIGET_RESOURCES', 'Spigot resource IDs', 'IDs of plugins on spigotmc.org that are downloaded automatically.', { types: BUKKIT_LIKE }),
        bool('USES_PLUGINS', 'Also load plugins', 'Let a mod loader read the plugins folder too, for hybrids such as Cardboard.', { types: ['family:modded'], expert: true }),
        bool('REMOVE_OLD_MODS', 'Remove old mods first', 'Delete existing mods and plugins before new ones are added.', { defaultValue: false, types: ['plugins', 'mods'] }),
        text('REMOVE_OLD_MODS_INCLUDE', 'Remove: include patterns', 'Glob patterns of files that are removed.', { defaultValue: '*.jar,*-version.json', types: ['plugins', 'mods'], expert: true }),
        text('REMOVE_OLD_MODS_EXCLUDE', 'Remove: exclude patterns', 'Glob patterns of files that are always kept.', { types: ['plugins', 'mods'], expert: true }),
        num('REMOVE_OLD_MODS_DEPTH', 'Remove: folder depth', 'How many folder levels the removal reaches.', { defaultValue: 1, min: 1, types: ['plugins', 'mods'], expert: true }),
    ];
})();

const modsFiles = (() => {
    const text = make('text', 'mods', 'Files and packs');
    const bool = make('boolean', 'mods', 'Files and packs');
    const num = make('number', 'mods', 'Files and packs');
    const list = make('list', 'mods', 'Files and packs');
    const multiline = make('multiline', 'mods', 'Files and packs');
    return [
        multiline('APPLY_EXTRA_FILES', 'Extra files', 'Files to copy or download before start, one per line as destination<source. The destination is relative to /data.', { placeholder: 'config/motd.txt<https://example.com/motd.txt', expert: true }),
        text('MODPACK', 'Modpack zip', 'URL or container path of a zip with mod jars at its top level.', { types: ['plugins', 'mods'], expert: true }),
        text('GENERIC_PACK', 'Server pack', 'URL or container path of a zip or tgz with a complete server content layout.', { expert: true }),
        list('GENERIC_PACKS', 'Server packs (in order)', 'Several packs that are applied one after another.', { expert: true }),
        text('GENERIC_PACKS_PREFIX', 'Server pack prefix', 'Added in front of every entry in the pack list.', { expert: true }),
        text('GENERIC_PACKS_SUFFIX', 'Server pack suffix', 'Added after every entry in the pack list.', { expert: true }),
        list('GENERIC_PACKS_DISABLE_MODS', 'Server pack: mods to skip', 'File names of mods from the packs that are not installed.', { expert: true }),
        bool('SKIP_GENERIC_PACK_UPDATE_CHECK', 'Skip pack update check', 'Do not check large packs for updates on every start.', { expert: true }),
        bool('FORCE_GENERIC_PACK_UPDATE', 'Force pack update', 'Apply the pack again on the next start.', { expert: true }),
        bool('SKIP_GENERIC_PACK_CHECKSUM', 'Skip pack checksum', 'Skip generating the SHA-1 checksum, the slowest part of a pack update.', { expert: true }),
        list('COPY_PLUGINS_SRC', 'Plugin sources', 'Container folders whose plugins are copied in on start.', { types: PLUGIN_TYPES, expert: true }),
        text('COPY_PLUGINS_DEST', 'Plugin destination', 'Container folder plugins are copied to.', { types: PLUGIN_TYPES, expert: true }),
        list('COPY_MODS_SRC', 'Mod sources', 'Container folders whose mods are copied in on start.', { types: MOD_TYPES, expert: true }),
        text('COPY_MODS_DEST', 'Mod destination', 'Container folder mods are copied to.', { types: MOD_TYPES, expert: true }),
        list('COPY_CONFIG_SRC', 'Config sources', 'Container folders whose config files are copied in on start.', { expert: true }),
        text('COPY_CONFIG_DEST', 'Config destination', 'Container folder config files are copied to.', { defaultValue: '/data/config', expert: true }),
        bool('SYNC_SKIP_NEWER_IN_DESTINATION', 'Keep newer config files', 'Do not overwrite config files that are newer than the source.', { expert: true }),
        bool('REPLACE_ENV_DURING_SYNC', 'Substitute variables in synced files', 'Replace ${CFG_...} placeholders in copied config files with environment values.', { defaultValue: true, expert: true }),
        text('REPLACE_ENV_SUFFIXES', 'Substitution file types', 'File extensions that placeholders are replaced in.', { defaultValue: 'yml,yaml,txt,cfg,conf,properties,hjson,json,tml,toml', expert: true }),
        text('REPLACE_ENV_VARIABLES_EXCLUDES', 'Substitution excludes', 'File names that are skipped.', { expert: true }),
        text('REPLACE_ENV_VARIABLES_EXCLUDE_PATHS', 'Substitution excluded paths', 'Paths that are skipped.', { expert: true }),
        bool('REMOVE_OLD_CONFIGS', 'Remove old configs first', 'Clear the config folder before a modpack is unpacked.', { defaultValue: false, expert: true }),
        text('REMOVE_OLD_CONFIGS_INCLUDE', 'Remove configs: include', 'Glob patterns of config files that are removed.', { defaultValue: '*', expert: true }),
        text('REMOVE_OLD_CONFIGS_EXCLUDE', 'Remove configs: exclude', 'Glob patterns of config files that are kept.', { expert: true }),
        num('REMOVE_OLD_CONFIGS_DEPTH', 'Remove configs: depth', 'How many folder levels the removal reaches.', { defaultValue: 16, min: 1, expert: true }),
    ];
})();

const modsModrinth = (() => {
    const text = make('text', 'mods', 'Modrinth');
    const bool = make('boolean', 'mods', 'Modrinth');
    const select = make('select', 'mods', 'Modrinth');
    const list = make('list', 'mods', 'Modrinth');
    const modpackTypes = ['modrinth'];
    const projectTypes = ['family:bukkit', 'family:modded', 'family:hybrid'];
    return [
        list('MODRINTH_PROJECTS', 'Modrinth projects', 'Mods and plugins from Modrinth, one per line. Use a slug, optionally with a version (lithium:0.12.1) or release channel (lithium:beta).', { types: projectTypes }),
        select('MODRINTH_DOWNLOAD_DEPENDENCIES', 'Download dependencies', 'Which dependencies of the listed projects are downloaded as well.', {
            defaultValue: 'none', types: projectTypes, choices: choices('none', 'required', 'optional'),
        }),
        select('MODRINTH_ALLOWED_VERSION_TYPE', 'Allowed release channel', 'Least stable release channel that may be installed.', {
            defaultValue: 'release', types: projectTypes, choices: choices('release', 'beta', 'alpha'),
        }),
        select('MODRINTH_PROJECTS_DEFAULT_VERSION_TYPE', 'Default release channel', 'Channel used for projects that do not name one.', {
            defaultValue: 'release', types: projectTypes, expert: true, choices: choices('release', 'beta', 'alpha'),
        }),
        bool('VERSION_FROM_MODRINTH_PROJECTS', 'Pick Minecraft version from projects', 'Use the newest Minecraft version that every listed project supports.', { types: projectTypes, expert: true }),
        select('MODRINTH_LOADER', 'Mod loader lookup', 'Loader used to look projects up when the server type is not a known loader.', {
            types: ['custom', 'family:hybrid', 'family:other'], expert: true,
            choices: choices('fabric', 'forge', 'neoforge', 'quilt', 'paper', 'bukkit', 'spigot', 'purpur', 'folia'),
        }),
        text('MODRINTH_MODPACK', 'Modpack', 'Slug, project URL or .mrpack path of the modpack to install.', { types: modpackTypes }),
        text('MODRINTH_VERSION', 'Modpack version', 'Version ID or number of the modpack. Newest release when empty.', { types: modpackTypes }),
        list('MODRINTH_EXCLUDE_FILES', 'Modpack: excluded files', 'Mod file names that are not installed, often client only mods that crash a server.', { types: modpackTypes }),
        list('MODRINTH_FORCE_INCLUDE_FILES', 'Modpack: forced files', 'Mod file names that are installed even though the pack marks them client only.', { types: modpackTypes }),
        bool('MODRINTH_IGNORE_MISSING_FILES', 'Ignore missing files', 'Carry on when a file listed by the pack cannot be found.', { types: modpackTypes, expert: true }),
        list('MODRINTH_OVERRIDES_EXCLUSIONS', 'Modpack: overrides exclusions', 'Paths inside the pack overrides that are not copied.', { types: modpackTypes, expert: true }),
    ];
})();

const modsCurseForge = (() => {
    const text = make('text', 'mods', 'CurseForge');
    const num = make('number', 'mods', 'CurseForge');
    const bool = make('boolean', 'mods', 'CurseForge');
    const select = make('select', 'mods', 'CurseForge');
    const secret = make('secret', 'mods', 'CurseForge');
    const list = make('list', 'mods', 'CurseForge');
    const t = ['auto_curseforge'];
    return [
        secret('CF_API_KEY', 'CurseForge API key', 'Key from console.curseforge.com. Dollar signs in the key must be written as $$.', { types: t, sensitive: true }),
        text('CF_PAGE_URL', 'Modpack page URL', 'Address of the modpack page, or of a specific file page.', { types: t }),
        text('CF_SLUG', 'Modpack slug', 'Slug of the modpack, as an alternative to the page URL.', { types: t }),
        text('CF_FILE_ID', 'File ID', 'Numeric ID of the file to install.', { types: t }),
        text('CF_FILENAME_MATCHER', 'File name matcher', 'Picks the file by name: a substring, or a regular expression wrapped in slashes.', { types: t }),
        text('CF_EXCLUDE_INCLUDE_FILE', 'Exclude/include file', 'JSON file with mods to leave out or force in. Empty turns the bundled file off.', { types: t, expert: true }),
        list('CF_EXCLUDE_MODS', 'Excluded mods', 'Mod slugs or IDs that are not installed.', { types: t }),
        list('CF_FORCE_INCLUDE_MODS', 'Forced mods', 'Mod slugs or IDs that are installed even when the pack excludes them.', { types: t }),
        bool('CF_FORCE_SYNCHRONIZE', 'Force synchronise', 'Check the exclude and include rules again on the next start.', { types: t, expert: true }),
        select('CF_SET_LEVEL_FROM', 'Take world from', 'Use the world that ships with the modpack.', { types: t, choices: choices('WORLD_FILE', 'OVERRIDES') }),
        num('CF_PARALLEL_DOWNLOADS', 'Parallel downloads', 'How many mods are downloaded at once.', { defaultValue: 4, min: 1, max: 32, types: t, expert: true }),
        bool('CF_OVERRIDES_SKIP_EXISTING', 'Keep existing override files', 'Do not overwrite files that already exist (world data is always kept).', { defaultValue: false, types: t, expert: true }),
        text('CF_MOD_LOADER_VERSION', 'Mod loader version', 'Replaces the loader version the modpack asks for.', { types: t, expert: true }),
    ];
})();

const modsFtb = (() => {
    const num = make('number', 'mods', 'Feed the Beast');
    return [
        num('FTB_MODPACK_ID', 'Modpack ID', 'Numeric ID of the modpack in the Feed the Beast app.', { types: ['ftba'] }),
        num('FTB_MODPACK_VERSION_ID', 'Modpack version ID', 'Numeric ID of the pack version. Newest when empty.', { types: ['ftba'] }),
    ];
})();

// -------------------------------------------------------------------------------------------------
// Advanced tab
// -------------------------------------------------------------------------------------------------

const advancedPlatform = (() => {
    const text = make('text', 'advanced', 'Server software');
    const bool = make('boolean', 'advanced', 'Server software');
    const select = make('select', 'advanced', 'Server software');
    return [
        bool('FORCE_REDOWNLOAD', 'Download server again', 'Download the server jar again on the next start even when it is present.', { defaultValue: false, types: ['vanilla', 'forge', 'bukkit', 'spigot', 'paper', 'family:modded', 'spongevanilla'] }),
        // Paper family
        text('PAPER_BUILD', 'Paper build', 'Specific build number of Paper. Newest when empty.', { types: ['paper'] }),
        select('PAPER_CHANNEL', 'Paper channel', 'Release channel builds are taken from.', { types: ['paper'], choices: choices('default', 'experimental'), defaultValue: 'default' }),
        text('PAPER_DOWNLOAD_URL', 'Paper download URL', 'Download Paper from this URL instead of the Paper project.', { types: ['paper'], expert: true }),
        text('PAPER_CUSTOM_JAR', 'Paper custom jar', 'Container path of a Paper jar to run.', { types: ['paper'], expert: true }),
        text('FOLIA_BUILD', 'Folia build', 'Specific build number of Folia. Newest when empty.', { types: ['folia'] }),
        select('FOLIA_CHANNEL', 'Folia channel', 'Release channel builds are taken from.', { types: ['folia'], choices: choices('default', 'experimental'), defaultValue: 'default' }),
        text('FOLIA_DOWNLOAD_URL', 'Folia download URL', 'Download Folia from this URL.', { types: ['folia'], expert: true }),
        text('PURPUR_BUILD', 'Purpur build', 'Specific build of Purpur. Newest when empty.', { types: ['purpur'] }),
        text('PURPUR_DOWNLOAD_URL', 'Purpur download URL', 'Download Purpur from this URL.', { types: ['purpur'], expert: true }),
        text('PUFFERFISH_BUILD', 'Pufferfish build', 'Specific build of Pufferfish. Newest when empty.', { types: ['pufferfish'] }),
        text('LEAF_BUILD', 'Leaf build', 'Specific build of Leaf. Newest when empty.', { types: ['leaf'] }),
        // Spigot and Bukkit
        text('SPIGOT_DOWNLOAD_URL', 'Spigot download URL', 'Use a prebuilt Spigot jar from this URL instead of building it.', { types: ['spigot'], expert: true }),
        text('BUKKIT_DOWNLOAD_URL', 'CraftBukkit download URL', 'Use a prebuilt CraftBukkit jar from this URL instead of building it.', { types: ['bukkit'], expert: true }),
        bool('BUILD_FROM_SOURCE', 'Build from source', 'Build the server from source even when a download is available.', { defaultValue: false, types: ['spigot', 'bukkit'], expert: true }),
        // Forge and NeoForge
        text('FORGE_VERSION', 'Forge version', 'Forge build such as 47.2.0, or RECOMMENDED or LATEST.', { types: ['forge'], defaultValue: 'RECOMMENDED', placeholder: 'RECOMMENDED' }),
        text('FORGE_INSTALLER', 'Forge installer file', 'Container path of a Forge installer jar to use.', { types: ['forge'], expert: true }),
        text('FORGE_INSTALLER_URL', 'Forge installer URL', 'Download the Forge installer from this URL.', { types: ['forge'], expert: true }),
        text('NEOFORGE_VERSION', 'NeoForge version', 'NeoForge build, or latest.', { types: ['neoforge'], defaultValue: 'latest' }),
        // Fabric and Quilt
        text('FABRIC_LOADER_VERSION', 'Fabric loader version', 'Fabric loader build. Newest when empty.', { types: ['fabric'] }),
        text('FABRIC_LAUNCHER_VERSION', 'Fabric launcher version', 'Version of the Fabric server launcher. Newest when empty.', { types: ['fabric'], expert: true }),
        text('FABRIC_LAUNCHER', 'Fabric launcher file', 'Container path of a launcher jar to use.', { types: ['fabric'], expert: true }),
        text('FABRIC_LAUNCHER_URL', 'Fabric launcher URL', 'Download the launcher from this URL.', { types: ['fabric'], expert: true }),
        text('QUILT_LOADER_VERSION', 'Quilt loader version', 'Quilt loader build. Newest when empty.', { types: ['quilt'] }),
        text('QUILT_INSTALLER_VERSION', 'Quilt installer version', 'Version of the Quilt installer. Newest when empty.', { types: ['quilt'], expert: true }),
        // Others
        select('SPONGEBRANCH', 'Sponge branch', 'Release branch of SpongeVanilla.', { types: ['spongevanilla'], choices: choices('STABLE', 'EXPERIMENTAL'), defaultValue: 'STABLE' }),
        text('SPONGEVERSION', 'Sponge version', 'Specific SpongeVanilla version. Newest of the branch when empty.', { types: ['spongevanilla'], expert: true }),
        text('MOHIST_BUILD', 'Mohist build', 'Specific build of Mohist. Newest when empty.', { types: ['mohist', 'banner'] }),
        select('ARCLIGHT_TYPE', 'Arclight platform', 'Mod platform Arclight is built for.', { types: ['arclight'], choices: choices('FORGE', 'NEOFORGE', 'FABRIC') }),
        text('ARCLIGHT_VERSION', 'Arclight version', 'Specific Arclight version. Newest when empty.', { types: ['arclight'], expert: true }),
        text('KETTING_VERSION', 'Ketting version', 'Specific Ketting version. Newest when empty.', { types: ['ketting'] }),
        text('CRUCIBLE_RELEASE', 'Crucible release', 'Specific Crucible release, or latest.', { types: ['crucible'], defaultValue: 'latest' }),
        text('CUSTOM_SERVER', 'Server jar', 'URL or container path of the server jar to run.', { types: ['custom'], placeholder: 'https://example.com/server.jar' }),
        text('CUSTOM_JAR_EXEC', 'Custom launch command', 'Replaces the -jar launch, for example -cp worldedit.jar:server.jar net.minecraft.server.Main.', { types: ['custom'], expert: true }),
    ];
})();

const advancedJava = (() => {
    const text = make('text', 'advanced', 'Java and memory');
    const bool = make('boolean', 'advanced', 'Java and memory');
    const multiline = make('multiline', 'advanced', 'Java and memory');
    return [
        text('INIT_MEMORY', 'Initial heap', 'Memory the Java heap starts with, for example 1G. Defaults to the server memory.', { placeholder: '1G' }),
        text('MAX_MEMORY', 'Maximum heap', 'Largest the Java heap may grow, for example 4G. Defaults to the server memory.', { placeholder: '4G' }),
        bool('USE_AIKAR_FLAGS', 'Aikar GC flags', 'Garbage collection tuning that suits most Paper style servers.', { defaultValue: true }),
        bool('USE_MEOWICE_FLAGS', 'MeowIce flags', 'Newer tuning flags for Java 17 and up.', { defaultValue: false }),
        bool('USE_MEOWICE_GRAALVM_FLAGS', 'MeowIce GraalVM flags', 'Use the GraalVM variant of the MeowIce flags.', { defaultValue: true, expert: true }),
        bool('USE_MEOWICE_ZGC_FLAGS', 'MeowIce ZGC flags', 'Use ZGC instead of G1. Needs the MeowIce flags.', { defaultValue: false, expert: true }),
        bool('USE_FLARE_FLAGS', 'Flare profiler flags', 'JVM flags that the Flare profiler needs.', { defaultValue: false }),
        bool('USE_SIMD_FLAGS', 'SIMD flags', 'Enable the SIMD vector API for mods and plugins that use it.', { defaultValue: false }),
        text('JVM_OPTS', 'JVM options', 'Extra JVM arguments, separated by spaces.', { expert: true }),
        text('JVM_XX_OPTS', 'JVM -XX options', 'Extra -XX arguments, placed before the -X options.', { expert: true }),
        text('JVM_DD_OPTS', 'JVM system properties', 'System properties as name=value pairs separated by commas.', { expert: true }),
        multiline('JAVA_AGENTS', 'Java agents', 'Agent jars loaded with -javaagent, as URLs or container paths, one per line.', { expert: true }),
        text('EXTRA_ARGS', 'Server arguments', 'Arguments passed to the server after the jar name.', { expert: true }),
        bool('ENABLE_JMX', 'Remote JMX', 'Allow profiling over JMX. The JMX port is not exposed by the manager.', { defaultValue: false, expert: true }),
        text('JMX_HOST', 'JMX host', 'Host or address JMX is reachable at.', { expert: true }),
        bool('DEBUG_MEMORY', 'Debug memory', 'Print how the memory settings were worked out.', { defaultValue: false, expert: true }),
        text('PRE_START_SCRIPT', 'Pre-start script', 'Container path of an executable that runs before the server starts. The server does not start when it fails.', { expert: true }),
    ];
})();

const advancedLogging = (() => {
    const text = make('text', 'advanced', 'Logging and time');
    const num = make('number', 'advanced', 'Logging and time');
    const bool = make('boolean', 'advanced', 'Logging and time');
    const select = make('select', 'advanced', 'Logging and time');
    return [
        text('TZ', 'Time zone', 'Time zone of the container, for example Europe/Berlin.', { defaultValue: 'UTC', placeholder: 'America/Los_Angeles' }),
        select('LOG_LEVEL', 'Log level', 'Lowest severity that is logged.', { defaultValue: 'info', choices: choices('trace', 'debug', 'info', 'warn', 'error') }),
        bool('LOG_TIMESTAMP', 'Timestamp every line', 'Add a timestamp to each log line.', { defaultValue: false }),
        text('LOG_CONSOLE_FORMAT', 'Console log format', 'Log4j2 pattern for the container logs, or json.', { expert: true }),
        text('LOG_FILE_FORMAT', 'File log format', 'Log4j2 pattern for logs/latest.log, or json.', { expert: true }),
        text('LOG_TERMINAL_FORMAT', 'Terminal log format', 'Log4j2 pattern for the attached console, or json.', { expert: true }),
        text('ROLLING_LOG_FILE_PATTERN', 'Archived log name', 'File name pattern of archived logs.', { defaultValue: 'logs/%d{yyyy-MM-dd}-%i.log.gz', expert: true }),
        num('ROLLING_LOG_MAX_FILES', 'Archived logs kept', 'How many archived logs are kept.', { defaultValue: 1000, min: 1, expert: true }),
        bool('ENABLE_ROLLING_LOGS', 'Rolling logs', 'Legacy switch that only affects error reporting.', { defaultValue: false, expert: true }),
        bool('CONSOLE', 'Allow console flag', 'Pass --noconsole to Spigot before 1.14. Leave on unless a server breaks.', { defaultValue: true, maxVersion: '1.14', expert: true }),
        bool('GUI', 'Allow server GUI', 'Let old servers open their GUI window, which never works in a container.', { defaultValue: true, maxVersion: '1.14', expert: true }),
    ];
})();

const advancedIdle = (() => {
    const num = make('number', 'advanced', 'Pause and stop when idle');
    const bool = make('boolean', 'advanced', 'Pause and stop when idle');
    const text = make('text', 'advanced', 'Pause and stop when idle');
    return [
        bool('ENABLE_AUTOPAUSE', 'Auto-pause', 'Freeze the server process while nobody is online. Players waking it up by connecting see a short delay. Not compatible with auto-stop.', { defaultValue: false }),
        num('AUTOPAUSE_TIMEOUT_EST', 'Pause after last player', 'Seconds between the last player leaving and the pause.', { defaultValue: 3600, min: 1 }),
        num('AUTOPAUSE_TIMEOUT_INIT', 'Pause after start', 'Seconds between start and the pause when nobody ever connects.', { defaultValue: 600, min: 1 }),
        num('AUTOPAUSE_TIMEOUT_KN', 'Pause after port knock', 'Seconds between a server list ping and the pause when nobody connects.', { defaultValue: 120, min: 1, expert: true }),
        num('AUTOPAUSE_PERIOD', 'Pause check interval', 'Seconds between checks of the pause state machine.', { defaultValue: 10, min: 1, expert: true }),
        text('AUTOPAUSE_KNOCK_INTERFACE', 'Knock interface', 'Network interface knockd listens on. It must exist inside the container.', { defaultValue: 'eth0', expert: true }),
        bool('DEBUG_AUTOPAUSE', 'Debug auto-pause', 'Print extra auto-pause information.', { defaultValue: false, expert: true }),
        bool('ENABLE_AUTOSTOP', 'Auto-stop', 'Stop the container after nobody was online for a while. Not compatible with auto-pause.', { defaultValue: false }),
        num('AUTOSTOP_TIMEOUT_EST', 'Stop after last player', 'Seconds between the last player leaving and the stop.', { defaultValue: 3600, min: 1 }),
        num('AUTOSTOP_TIMEOUT_INIT', 'Stop after start', 'Seconds between start and the stop when nobody ever connects.', { defaultValue: 1800, min: 1 }),
        num('AUTOSTOP_PERIOD', 'Stop check interval', 'Seconds between checks of the stop state machine.', { defaultValue: 10, min: 1, expert: true }),
        bool('DEBUG_AUTOSTOP', 'Debug auto-stop', 'Print extra auto-stop information.', { defaultValue: false, expert: true }),
    ];
})();

const advancedCommands = (() => {
    const multiline = make('multiline', 'advanced', 'Commands on events');
    return [
        multiline('RCON_CMDS_STARTUP', 'On server start', 'Commands to run once the server has started, one per line.', { expert: true }),
        multiline('RCON_CMDS_ON_CONNECT', 'On every player join', 'Commands to run whenever a player connects.', { expert: true }),
        multiline('RCON_CMDS_FIRST_CONNECT', 'On first player join', 'Commands to run when the first player connects.', { expert: true }),
        multiline('RCON_CMDS_ON_DISCONNECT', 'On every player leave', 'Commands to run whenever a player disconnects.', { expert: true }),
        multiline('RCON_CMDS_LAST_DISCONNECT', 'On last player leave', 'Commands to run when the last player disconnects.', { expert: true }),
    ];
})();

const advancedProperties = (() => {
    const text = make('text', 'advanced', 'server.properties handling');
    const bool = make('boolean', 'advanced', 'server.properties handling');
    const multiline = make('multiline', 'advanced', 'server.properties handling');
    const num = make('number', 'advanced', 'Network services');
    const netBool = make('boolean', 'advanced', 'Network services');
    return [
        bool('OVERRIDE_SERVER_PROPERTIES', 'Rewrite server.properties on start', 'Apply the settings above to server.properties on every start. Turn off to manage the file by hand.', { defaultValue: true }),
        bool('SKIP_SERVER_PROPERTIES', 'Do not create server.properties', 'Skip creating the file in the startup script.', { defaultValue: false, expert: true }),
        bool('DUMP_SERVER_PROPERTIES', 'Print server.properties on start', 'Write the final file to the container log before the server starts.', { defaultValue: false, expert: true }),
        bool('SERVER_PROPERTIES_ESCAPE_UNICODE', 'Escape unicode', 'Write non ASCII characters as \\uXXXX. Default for versions before 1.20.', { expert: true }),
        multiline('CUSTOM_SERVER_PROPERTIES', 'Custom properties', 'Extra name=value lines for server.properties, one per line. Useful for mod and plugin properties.', { placeholder: 'some-mod-property=value', expert: true }),
        netBool('ENABLE_QUERY', 'GameSpy query', 'Answer GameSpy4 query requests, used by some server list sites.', { defaultValue: false, property: 'enable-query' }),
        netBool('MANAGEMENT_SERVER_ENABLED', 'Management server', 'Start the management protocol server of the game. The manager does not expose its port.', { defaultValue: false, property: 'management-server-enabled', minVersion: '1.21.9', expert: true }),
        num('MANAGEMENT_SERVER_PORT', 'Management server port', 'Port inside the container.', { property: 'management-server-port', minVersion: '1.21.9', expert: true }),
        text('MANAGEMENT_SERVER_HOST', 'Management server host', 'Address the management server binds to.', { property: 'management-server-host', minVersion: '1.21.9', expert: true }),
        text('MANAGEMENT_SERVER_ALLOWED_ORIGINS', 'Management allowed origins', 'Origins that may connect to the management server.', { property: 'management-server-allowed-origins', minVersion: '1.21.9', expert: true }),
        make('secret', 'advanced', 'Network services')('MANAGEMENT_SERVER_SECRET', 'Management server secret', 'Token clients need to use the management server.', { property: 'management-server-secret', minVersion: '1.21.9', sensitive: true, expert: true }),
    ];
})();

// -------------------------------------------------------------------------------------------------
// Values the platform controls. They are listed so the interface can show them as read only.
// -------------------------------------------------------------------------------------------------

export const LOCKED_OPTIONS: OptionDefinition[] = [
    { env: 'EULA', label: 'Minecraft EULA', description: 'Accepted when the server is created.', kind: 'boolean', tab: 'advanced', group: 'Managed by the platform', locked: 'The EULA is accepted for you when the server is created.' },
    { env: 'TYPE', label: 'Server type', description: 'Chosen at creation.', kind: 'text', tab: 'advanced', group: 'Managed by the platform', locked: 'Set with the server type picker.' },
    { env: 'VERSION', label: 'Minecraft version', description: 'Chosen at creation.', kind: 'text', tab: 'advanced', group: 'Managed by the platform', locked: 'Set with the version picker.' },
    { env: 'UID', label: 'User ID', description: 'User the server runs as.', kind: 'number', tab: 'advanced', group: 'Managed by the platform', locked: 'Fixed so the manager can manage the server files.' },
    { env: 'GID', label: 'Group ID', description: 'Group the server runs as.', kind: 'number', tab: 'advanced', group: 'Managed by the platform', locked: 'Fixed so the manager can manage the server files.' },
    { env: 'ENABLE_RCON', label: 'RCON', description: 'Remote console access.', kind: 'boolean', tab: 'advanced', group: 'Managed by the platform', locked: RCON_LOCK },
    { env: 'RCON_PASSWORD', label: 'RCON password', description: 'RCON password.', kind: 'secret', tab: 'advanced', group: 'Managed by the platform', locked: RCON_LOCK, sensitive: true },
    { env: 'RCON_PASSWORD_FILE', label: 'RCON password file', description: 'RCON password file.', kind: 'text', tab: 'advanced', group: 'Managed by the platform', locked: RCON_LOCK },
    { env: 'RCON_PORT', label: 'RCON port', description: 'RCON port inside the container.', kind: 'number', tab: 'advanced', group: 'Managed by the platform', locked: RCON_LOCK },
    { env: 'SERVER_PORT', label: 'Server port', description: 'Game port inside the container.', kind: 'number', tab: 'advanced', group: 'Managed by the platform', locked: PORT_LOCK },
    { env: 'QUERY_PORT', label: 'Query port', description: 'GameSpy query port.', kind: 'number', tab: 'advanced', group: 'Managed by the platform', locked: PORT_LOCK },
    { env: 'SETUP_ONLY', label: 'Setup only', description: 'Stop after setup.', kind: 'boolean', tab: 'advanced', group: 'Managed by the platform', locked: 'The server always starts after setup.' },
    { env: 'EXEC_DIRECTLY', label: 'Run directly', description: 'Run Java without the wrapper.', kind: 'boolean', tab: 'advanced', group: 'Managed by the platform', locked: 'Needed for clean shutdowns and the console.' },
    { env: 'SKIP_JAVA_VERSION_CHECK', label: 'Skip Java check', description: 'Do not verify the Java version.', kind: 'boolean', tab: 'advanced', group: 'Managed by the platform', locked: 'The Java version is chosen for the Minecraft version automatically.' },
    { env: 'FIX_PERMISSIONS', label: 'Fix permissions', description: 'Repair file ownership on start.', kind: 'boolean', tab: 'advanced', group: 'Managed by the platform', locked: 'Needed for the manager to manage the server files.' },
];

const generalOptions = [...generalServer, ...generalPlayers, ...generalResourcePack];
const worldOptions = [...worldGeneration, ...worldGameplay, ...worldPerformance];
const modsOptions = [...modsIndividual, ...modsFiles, ...modsModrinth, ...modsCurseForge, ...modsFtb];
const advancedOptions = [...advancedPlatform, ...advancedJava, ...advancedLogging, ...advancedIdle, ...advancedCommands, ...advancedProperties];

/**
 * Every option a user may change.
 */
export const OPTIONS: OptionDefinition[] = [...generalOptions, ...worldOptions, ...modsOptions, ...advancedOptions];

