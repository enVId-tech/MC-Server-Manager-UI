export interface PortainerEnvironment {
    Id: number;
    Name: string;
    // Add other relevant environment properties
}

export interface PortainerStack {
    Id: number;
    Name: string;
    EndpointId: number;
}

export interface PortainerContainer {
    Id: string;
    Names: string[];
    Image: string;
    Labels: { [key: string]: string };
    State: string;
    Status: string;
    Created?: number;
    StartedAt?: string;
    FinishedAt?: string;
    ExitCode?: number;
    NetworkSettings?: {
        Networks?: {
            [key: string]: {
                IPAddress?: string;
                Gateway?: string;
                MacAddress?: string;
            };
        };
        Ports?: {
            [key: string]: Array<{
                HostIp?: string;
                HostPort?: string;
            }> | null;
        };
    };
    Ports?: Array<{
        IP?: string;
        PrivatePort: number;
        PublicPort?: number;
        Type: string;
    }>;
    HostConfig?: {
        Memory?: number;
        CpuQuota?: number;
        CpuPeriod?: number;
        RestartPolicy?: {
            Name: string;
            MaximumRetryCount?: number;
        };
    };
}

export interface PortainerImage {
    Id: string;
    RepoTags: string[];
    Created: number;
    Size: number;
}

export interface PortainerStack {
    Id: number;
    Name: string;
    EndpointId: number;
}

export interface PortainerStackContent {
    Name: string;
    ComposeFile: string | any;
    Env?: Array<{ name: string; value: string }>
    FromAppTemplate?: boolean;
}

export type Constructor<T = {}> = new (...args: any[]) => T;