/**
 * What tells proxies apart. With one proxy everything works on the server domain, with several each proxy needs
 * its own base subdomain (ex1.example.org, ex2.example.org: the servers behind a proxy are reached as
 * survival.ex1.example.org) and its own port, so players and DNS records never mix up the networks.
 * Pure functions, no Docker or database.
 */

import { isUnassignedSubdomain } from '@/lib/server/subdomain';
export interface ProxyIdentity {
    id: string;
    name: string;
    /** Subdomain label(s) in front of the server domain, for example "ex1". Empty for none */
    baseSubdomain?: string;
    /** Port players connect to */
    port: number;
}

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Lowercases and trims a base subdomain. Returns an error text when it is not a valid host name part */
export function normalizeBaseSubdomain(input: string | undefined | null): { value?: string; error?: string } {
    const value = (input ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!value) return {};
    if (value.length > 60) return { error: 'The base subdomain can be at most 60 characters.' };
    if (!value.split('.').every(label => label.length <= 63 && LABEL.test(label))) {
        return { error: 'The base subdomain may only contain lowercase letters, digits and dashes (for example ex1).' };
    }
    return { value };
}

/** The full base domain of a proxy: its base subdomain in front of the server domain */
export function baseDomainOf(baseSubdomain: string | undefined, serverDomain: string): string {
    return baseSubdomain ? `${baseSubdomain}.${serverDomain}` : serverDomain;
}

/** Host names a server is reached with through a proxy. A name that already has dots is a full host name and stays as it is */
export function hostnameFor(subdomainName: string | undefined | null, baseDomain: string): string | undefined {
    const name = (subdomainName ?? '').trim().toLowerCase();
    if (!name || isUnassignedSubdomain(name)) return undefined;
    return name.includes('.') ? name : `${name}.${baseDomain}`;
}

/**
 * Problems of a set of proxies, keyed by proxy id. Several proxies need different base subdomains and different
 * ports; a proxy with a base subdomain next to others that have none is also reported.
 */
export function identityIssues(proxies: ProxyIdentity[]): Map<string, string[]> {
    const issues = new Map<string, string[]>();
    const add = (id: string, text: string) => issues.set(id, [...(issues.get(id) ?? []), text]);
    if (proxies.length < 2) return issues;

    for (const proxy of proxies) {
        if (!proxy.baseSubdomain) add(proxy.id, 'Give this proxy a base subdomain (for example ex1): with several proxies each one needs its own.');
    }
    const byBase = new Map<string, ProxyIdentity[]>();
    const byPort = new Map<number, ProxyIdentity[]>();
    for (const proxy of proxies) {
        if (proxy.baseSubdomain) byBase.set(proxy.baseSubdomain, [...(byBase.get(proxy.baseSubdomain) ?? []), proxy]);
        byPort.set(proxy.port, [...(byPort.get(proxy.port) ?? []), proxy]);
    }
    for (const [base, group] of byBase) {
        if (group.length > 1) group.forEach(proxy => add(proxy.id, `The base subdomain ${base} is also used by ${group.filter(other => other.id !== proxy.id).map(other => other.name).join(', ')}.`));
    }
    for (const [port, group] of byPort) {
        if (group.length > 1) group.forEach(proxy => add(proxy.id, `Port ${port} is also used by ${group.filter(other => other.id !== proxy.id).map(other => other.name).join(', ')}.`));
    }
    return issues;
}

/**
 * Checks a proxy that is about to be created or changed against the others. Returns an error text, or null when
 * it can go ahead. The other proxies must already be in order: a second proxy cannot be added while the first one
 * has no base subdomain, because its servers would keep sharing the plain server domain.
 */
export function checkProxyIdentity(candidate: ProxyIdentity, others: ProxyIdentity[]): string | null {
    const rest = others.filter(proxy => proxy.id !== candidate.id);
    if (rest.length === 0) return null;

    if (!candidate.baseSubdomain) return 'With more than one proxy, every proxy needs its own base subdomain (for example ex1).';
    const sameBase = rest.find(proxy => proxy.baseSubdomain === candidate.baseSubdomain);
    if (sameBase) return `The base subdomain ${candidate.baseSubdomain} is already used by ${sameBase.name}. Pick another one (for example ex2).`;
    const samePort = rest.find(proxy => proxy.port === candidate.port);
    if (samePort) return `Port ${candidate.port} is already used by ${samePort.name}. Every proxy needs its own port.`;
    const unnamed = rest.find(proxy => !proxy.baseSubdomain);
    if (unnamed) return `${unnamed.name} has no base subdomain yet. Give it one first, then add or change this proxy.`;
    return null;
}
