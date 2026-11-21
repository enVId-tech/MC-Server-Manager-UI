import { randomUUID } from 'crypto';
import { getSubdomainLabel } from '@/lib/config/domain';

/**
 * A server record needs a unique address, but an imported server only has one when the proxy already knows it
 * (its forced host). Until then it gets a placeholder that can never be a host name (underscores are not allowed
 * in them) and is shown as "no address".
 */
const PLACEHOLDER_PREFIX = 'unassigned_';

export function unassignedSubdomain(): string {
    return `${PLACEHOLDER_PREFIX}${randomUUID().slice(0, 8)}`;
}

export function isUnassignedSubdomain(value: string | null | undefined): boolean {
    return !value || value.startsWith(PLACEHOLDER_PREFIX);
}

/** The address to show or send to a client: an empty string when the server has none */
export function publicSubdomain(value: string | null | undefined): string {
    return isUnassignedSubdomain(value) ? '' : (value as string);
}

/** The label in front of the server domain, or an empty string when the server has no address */
export function subdomainLabel(value: string | null | undefined): string {
    return isUnassignedSubdomain(value) ? '' : getSubdomainLabel(value as string);
}
