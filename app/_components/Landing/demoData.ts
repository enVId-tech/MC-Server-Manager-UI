// Everything the demo panel shows. None of it is real: there is no server behind the demo.

export type DemoFile = { name: string; kind: 'dir' | 'file'; size?: string; content?: string };

export const DEMO_SERVER = {
    name: 'survival-smp',
    address: 'survival.example.com',
    type: 'Paper',
    version: '1.21.4',
    maxPlayers: 20,
    maxRamMb: 4096,
};

export const DEMO_PLAYERS = ['Steve_Builder', 'CreeperSlayer', 'NetherNomad', 'PixelFarmer', 'RedstoneRex', 'LunaMiner', 'EmberFox', 'BlockBard'];

export const INITIAL_LOG: string[] = [
    '[11:58:02 INFO]: Starting minecraft server version 1.21.4',
    '[11:58:04 INFO]: Loading properties',
    '[11:58:06 INFO]: Preparing level "world"',
    '[11:58:09 INFO]: Done (6.812s)! For help, type "help"',
    '[11:58:41 INFO]: Steve_Builder joined the game',
    '[11:59:13 INFO]: CreeperSlayer joined the game',
    '[12:00:20 INFO]: <Steve_Builder> anyone want to explore the new cave?',
];

export const DEMO_FILES: Record<string, DemoFile[]> = {
    '/': [
        { name: 'plugins', kind: 'dir' },
        { name: 'world', kind: 'dir' },
        { name: 'logs', kind: 'dir' },
        { name: 'server.properties', kind: 'file', size: '1.2 KB', content: 'motd=A Minecraft Server\ndifficulty=normal\nmax-players=20\npvp=true\nview-distance=10\nwhite-list=false\nenable-command-block=false\nlevel-name=world\nonline-mode=false' },
        { name: 'ops.json', kind: 'file', size: '134 B', content: '[\n  {\n    "name": "Steve_Builder",\n    "level": 4,\n    "bypassesPlayerLimit": false\n  }\n]' },
        { name: 'whitelist.json', kind: 'file', size: '2 B', content: '[]' },
        { name: 'bukkit.yml', kind: 'file', size: '1.1 KB', content: 'settings:\n  allow-end: true\n  warn-on-overload: true\n  connection-throttle: 4000\nspawn-limits:\n  monsters: 70\n  animals: 10' },
    ],
    '/plugins': [
        { name: 'EssentialsX.jar', kind: 'file', size: '1.6 MB' },
        { name: 'LuckPerms.jar', kind: 'file', size: '1.9 MB' },
        { name: 'Geyser-Spigot.jar', kind: 'file', size: '38 MB' },
        { name: 'WorldEdit.jar', kind: 'file', size: '4.1 MB' },
    ],
    '/world': [
        { name: 'region', kind: 'dir' },
        { name: 'level.dat', kind: 'file', size: '2.3 KB' },
        { name: 'session.lock', kind: 'file', size: '1 B' },
    ],
    '/logs': [
        { name: 'latest.log', kind: 'file', size: '14 KB', content: INITIAL_LOG.join('\n') },
    ],
};

export type DemoPlugin = { id: string; name: string; version: string; source: string; enabled: boolean; auto: boolean };

export const DEMO_PLUGINS: DemoPlugin[] = [
    { id: 'essentialsx', name: 'EssentialsX', version: '2.21.0', source: 'Modrinth', enabled: true, auto: true },
    { id: 'luckperms', name: 'LuckPerms', version: '5.4.150', source: 'Hangar', enabled: true, auto: true },
    { id: 'geyser', name: 'Geyser', version: '2.6.0', source: 'GeyserMC', enabled: true, auto: false },
    { id: 'worldedit', name: 'WorldEdit', version: '7.3.9', source: 'Modrinth', enabled: false, auto: false },
];
