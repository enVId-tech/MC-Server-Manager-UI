/**
 * Domain that every Minecraft server subdomain lives under, for example `mc.example.com`
 * gives players the address `myserver.mc.example.com`.
 *
 * Configure it with SERVER_DOMAIN (ROOT_DOMAIN is still read for installations that already set it).
 */
export const DEFAULT_SERVER_DOMAIN = 'mc.etran.dev';

export function getServerDomain(): string {
    const configured = process.env.SERVER_DOMAIN || process.env.ROOT_DOMAIN || DEFAULT_SERVER_DOMAIN;
    return configured.trim().replace(/^\.+|\.+$/g, '').toLowerCase();
}

/**
 * Full hostname players connect to for a subdomain label ("myserver" -> "myserver.mc.example.com").
 */
export function buildServerHostname(subdomain: string): string {
    return `${subdomain}.${getServerDomain()}`;
}

/**
 * Subdomain label of a stored hostname ("myserver.mc.example.com" -> "myserver").
 * Values that are already a bare label are returned unchanged.
 */
export function getSubdomainLabel(hostname: string): string {
    const normalized = hostname.toLowerCase();
    const suffix = `.${getServerDomain()}`;

    if (normalized.endsWith(suffix)) {
        return normalized.slice(0, -suffix.length);
    }

    return normalized.split('.')[0];
}
