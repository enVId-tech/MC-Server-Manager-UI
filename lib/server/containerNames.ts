/** Name of the Docker container that runs a server. Servers created here use `mc-<id>`; imported ones keep their own. */
export function getContainerName(server: { uniqueId?: unknown; containerName?: unknown }): string {
    if (typeof server.containerName === 'string' && server.containerName.trim()) {
        return server.containerName.trim();
    }
    return `mc-${String(server.uniqueId)}`;
}
