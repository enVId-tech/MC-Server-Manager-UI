/**
 * Files and Docker definitions for proxies this manager creates. Pure, so they can be tested.
 */
import YAML from 'yaml';
import { tomlString } from './toml';
import type { ForwardingMode, ProxyKind } from './versions';

export interface ProxyTemplateInput {
    motd: string;
    maxPlayers: number;
    forwarding: ForwardingMode;
}

/**
 * velocity.toml of a new proxy. `try` stays empty and a crash of a server does not move players elsewhere:
 * every server is reached through its own host name.
 */
export function velocityTomlTemplate(input: ProxyTemplateInput): string {
    return `# Velocity configuration created by the server manager.
# Servers are added to [servers] and [forced-hosts] automatically. Do not add them to "try": a player whose
# server stops is disconnected instead of being moved to somebody else's server.
config-version = "2.7"
bind = "0.0.0.0:25565"
motd = ${tomlString(input.motd)}
show-max-players = ${Math.max(1, Math.floor(input.maxPlayers))}
online-mode = true
force-key-authentication = true
prevent-client-proxy-connections = false
player-info-forwarding-mode = ${tomlString(input.forwarding)}
forwarding-secret-file = "forwarding.secret"
announce-forge = "NONE"
kick-existing-players = false
ping-passthrough = "DISABLED"
enable-player-address-logging = true

[servers]
try = []

[forced-hosts]

[advanced]
compression-threshold = 256
compression-level = -1
login-ratelimit = 3000
connection-timeout = 5000
read-timeout = 30000
haproxy-protocol = false
tcp-fast-open = false
bungee-plugin-message-channel = true
show-ping-requests = false
failover-on-unexpected-server-disconnect = false
announce-proxy-commands = true
log-command-executions = false
log-player-connections = true

[query]
enabled = false
port = 25565
map = "Velocity"
show-plugins = false
`;
}

export const BUNGEE_CONTAINER_PORT = 25577;

/** config.yml of a new BungeeCord or Waterfall proxy */
export function bungeeYamlTemplate(input: ProxyTemplateInput): string {
    return YAML.stringify({
        ip_forward: input.forwarding === 'legacy' || input.forwarding === 'bungeeguard',
        online_mode: true,
        prevent_proxy_connections: false,
        player_limit: -1,
        timeout: 30000,
        connection_throttle: 4000,
        listeners: [{
            host: `0.0.0.0:${BUNGEE_CONTAINER_PORT}`,
            motd: input.motd,
            max_players: Math.max(1, Math.floor(input.maxPlayers)),
            tab_list: 'GLOBAL_PING',
            tab_size: 60,
            ping_passthrough: false,
            query_enabled: false,
            query_port: BUNGEE_CONTAINER_PORT,
            proxy_protocol: false,
            force_default_server: false,
            bind_local_address: true,
            // A name that is not a server: nobody is moved to another server when theirs stops
            priorities: ['unavailable'],
            forced_hosts: {},
        }],
        servers: {},
        groups: {},
        permissions: { default: ['bungeecord.command.server', 'bungeecord.command.list'] },
        disabled_commands: ['disabledcommandhere'],
    }, { indent: 2, lineWidth: 0 });
}

export interface ComposeInput {
    kind: ProxyKind;
    name: string;
    containerName: string;
    image: string;
    hostPort: number;
    hostFolder: string;
    networkName: string;
    memory: string;
    /** UDP ports to publish, for Geyser */
    udpPorts?: number[];
}

/** Which image family a proxy runs. The itzg/mc-proxy image takes TYPE and mounts /server */
export function usesItzgProxyImage(image: string): boolean {
    return /itzg\/mc-proxy/i.test(image);
}

export function defaultProxyImage(kind: ProxyKind): string {
    if (kind === 'velocity') return process.env.VELOCITY_IMAGE?.trim() || 'envidtech/velocity:latest';
    return process.env.BUNGEE_IMAGE?.trim() || 'itzg/mc-proxy:latest';
}

export function proxyCompose(input: ComposeInput): string {
    const itzg = usesItzgProxyImage(input.image);
    const containerPort = input.kind === 'velocity' ? 25565 : BUNGEE_CONTAINER_PORT;
    const mount = itzg ? '/server' : '/velocity';
    const environment = itzg
        ? [`TYPE=${input.kind.toUpperCase()}`, `MEMORY=${input.memory}`, 'EULA=TRUE']
        : [`VELOCITY_MEMORY=${input.memory}`];

    return YAML.stringify({
        version: '3',
        services: {
            [input.containerName]: {
                image: input.image,
                container_name: input.containerName,
                restart: 'on-failure:5',
                // The manager reloads a proxy by writing to its console, which needs stdin
                stdin_open: true,
                tty: true,
                ports: [`${input.hostPort}:${containerPort}`, ...(input.udpPorts ?? []).map(port => `${port}:${port}/udp`)],
                volumes: [`${input.hostFolder}:${mount}`],
                networks: [input.networkName],
                environment,
            },
        },
        networks: { [input.networkName]: { external: true } },
    }, { indent: 2, lineWidth: 0 });
}
