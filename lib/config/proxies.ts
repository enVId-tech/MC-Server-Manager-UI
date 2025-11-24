export interface ProxyDefinition {
    id: string;
    name: string;
    host: string; // Container name
    port: number; // External port
    configPath: string; // Path to velocity.toml in WebDAV/Volume
    networkName: string;
    memory: string; // e.g. "512M"
    type: 'velocity' | 'bungeecord' | 'waterfall';
}

export const definedProxies: ProxyDefinition[] = [
    {
        id: 'velocity-main',
        name: 'velocity',
        host: 'velocity',
        port: 25565,
        configPath: '/velocity/velocity.toml',
        networkName: 'velocity-network',
        memory: '512M',
        type: 'velocity'
    }
    // Add more proxies here as needed
    // {
    //     id: 'velocity-secondary',
    //     name: 'velocity-2',
    //     host: 'velocity-2',
    //     port: 25566,
    //     configPath: '/velocity-2/velocity.toml',
    //     networkName: 'velocity-network',
    //     memory: '512M',
    //     type: 'velocity'
    // }
];
