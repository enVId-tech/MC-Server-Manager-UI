'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../admin.module.scss';
import { adminSend, useAdminData } from './shared';

type Kind = 'velocity' | 'bungeecord' | 'waterfall';
type Forwarding = 'modern' | 'bungeeguard' | 'legacy' | 'none';
type Strategy = 'all' | 'balanced' | 'priority';
type PluginName = 'viaversion' | 'viabackwards' | 'viarewind' | 'geyser' | 'floodgate';

interface Proxy {
    id: string;
    name: string;
    kind: Kind;
    forwarding: Forwarding;
    allowedForwarding: Forwarding[];
    enabled: boolean;
    priority: number;
    port: number;
    publicHost: string;
    motd: string;
    maxPlayers: number;
    containerName: string;
    networkName: string;
    configPath: string;
    running: boolean;
    imported: boolean;
    readable: boolean;
    error?: string;
    hasSecret: boolean;
    linkedServers: number;
    defaultEntry?: string;
    bedrockPort?: number;
    entries: Record<string, string>;
    plugins: Partial<Record<'viaversion' | 'viabackwards' | 'viarewind' | 'geyser' | 'floodgate' | 'edugeyser' | 'bungeeguard', boolean>>;
}

interface NetworkData {
    proxies: Proxy[];
    settings: { strategy: Strategy; noFallback: boolean; mirrorViaPlugins: boolean };
    servers: number;
    unlinked: Array<{ uniqueId: string; serverName: string; email: string; version: string; warnings: string[] }>;
    adopted?: string[];
}

const KIND_LABEL: Record<Kind, string> = { velocity: 'Velocity', bungeecord: 'BungeeCord', waterfall: 'Waterfall' };
const FORWARDING_LABEL: Record<Forwarding, string> = {
    modern: 'Modern (Minecraft 1.13+, Velocity only)',
    bungeeguard: 'BungeeGuard (any version, uses a token)',
    legacy: 'Legacy (any version, no token)',
    none: 'None',
};
const STRATEGY_LABEL: Record<Strategy, string> = {
    all: 'Every proxy knows every server',
    balanced: 'Spread servers evenly over the proxies',
    priority: 'Servers go to the proxy with the highest priority',
};
const OPTIONAL_PLUGINS: Array<{ id: PluginName; label: string }> = [
    { id: 'viaversion', label: 'ViaVersion' },
    { id: 'viabackwards', label: 'ViaBackwards' },
    { id: 'viarewind', label: 'ViaRewind' },
    { id: 'geyser', label: 'Geyser (Bedrock)' },
    { id: 'floodgate', label: 'Floodgate' },
];

function forwardingFor(kind: Kind): Forwarding[] {
    return kind === 'velocity' ? ['modern', 'bungeeguard', 'legacy'] : ['bungeeguard', 'legacy'];
}

function pluginBadges(proxy: Proxy): string[] {
    const names: Record<string, string> = {
        viaversion: 'ViaVersion', viabackwards: 'ViaBackwards', viarewind: 'ViaRewind', geyser: 'Geyser',
        floodgate: 'Floodgate', edugeyser: 'EduGeyser', bungeeguard: 'BungeeGuard',
    };
    return Object.entries(proxy.plugins).filter(([, on]) => on).map(([key]) => names[key] ?? key);
}

interface CreateForm {
    name: string;
    kind: Kind;
    forwarding: Forwarding;
    port: string;
    memory: string;
    publicHost: string;
    motd: string;
    plugins: PluginName[];
    bedrockPort: string;
    shareSecret: boolean;
}

const EMPTY_FORM: CreateForm = {
    name: '', kind: 'velocity', forwarding: 'modern', port: '25565', memory: '512M', publicHost: '', motd: '',
    plugins: [], bedrockPort: '19132', shareSecret: true,
};

export default function ProxiesSection() {
    const { showNotification, showConfirmDialog } = useNotifications();
    const network = useAdminData<NetworkData>('/api/admin/network');
    const [busy, setBusy] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
    const [open, setOpen] = useState<string | null>(null);
    const [draft, setDraft] = useState<Record<string, string | boolean>>({});

    const data = network.data;
    const proxies = useMemo(() => data?.proxies ?? [], [data]);
    const grouped = useMemo(
        () => (['velocity', 'bungeecord', 'waterfall'] as Kind[]).map(kind => ({ kind, items: proxies.filter(proxy => proxy.kind === kind) })),
        [proxies]
    );
    const velocityCount = proxies.filter(proxy => proxy.kind === 'velocity').length;

    const report = (ok: boolean, title: string, message?: string, details?: string[]) => {
        showNotification({ type: ok ? 'success' : 'error', title, message: [message, ...(details ?? [])].filter(Boolean).join('\n') || (ok ? 'Done.' : 'Failed.') });
    };

    const run = async <T extends { details?: string[]; restartRequired?: boolean }>(
        key: string, title: string, send: () => Promise<{ ok: boolean; body: T & { message?: string } }>
    ) => {
        setBusy(key);
        try {
            const { ok, body } = await send();
            const restartNote = ok && body.restartRequired ? 'Restart the proxy for this to take effect.' : undefined;
            report(ok, title, body.message ?? restartNote, body.details);
            await network.reload();
            return ok;
        } finally {
            setBusy(null);
        }
    };

    const setKind = (kind: Kind) => setForm(previous => ({
        ...previous,
        kind,
        forwarding: forwardingFor(kind).includes(previous.forwarding) ? previous.forwarding : forwardingFor(kind)[0],
    }));

    const create = async () => {
        const ok = await run('create', 'Proxy', () => adminSend('/api/admin/network/proxies', 'POST', {
            ...form,
            port: Number(form.port),
            bedrockPort: form.plugins.includes('geyser') ? Number(form.bedrockPort) : undefined,
            shareSecret: form.kind === 'velocity' && form.forwarding === 'modern' && velocityCount > 0 ? form.shareSecret : undefined,
            motd: form.motd || undefined,
            publicHost: form.publicHost || undefined,
        }));
        if (ok) {
            setCreating(false);
            setForm(EMPTY_FORM);
        }
    };

    const patch = (proxy: Proxy, changes: Record<string, unknown>, title = 'Proxy') =>
        run(`patch-${proxy.id}`, title, () => adminSend('/api/admin/network/proxies', 'PATCH', { id: proxy.id, ...changes }));

    const putSettings = async (changes: Partial<NetworkData['settings']>) => {
        setBusy('settings');
        const response = await fetch('/api/admin/network', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
        });
        const body = await response.json().catch(() => ({}));
        setBusy(null);
        report(response.ok, 'Network', body.message, body.details);
        await network.reload();
    };

    const rebalance = () => run('sync', 'Sync', () => adminSend('/api/admin/network', 'POST', { action: 'sync' }));

    const remove = (proxy: Proxy) => showConfirmDialog({
        title: `Delete ${proxy.name}`,
        message: `${proxy.imported ? 'The container and files of an existing proxy stay where they are; it is only removed from the dashboard.' : 'The proxy container and its files are removed.'} ${proxy.linkedServers} server${proxy.linkedServers === 1 ? ' is' : 's are'} behind it and will be taken out of its configuration. This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'danger',
        requireText: proxy.name,
        requireTextPrompt: 'To confirm, type the name of the proxy:',
        onConfirm: () => void run(`delete-${proxy.id}`, 'Proxy', () => adminSend(`/api/admin/network/proxies?id=${encodeURIComponent(proxy.id)}`, 'DELETE')),
    });

    const draftValue = (proxy: Proxy, key: string, fallback: string) => String(draft[`${proxy.id}:${key}`] ?? fallback);
    const setDraftValue = (proxy: Proxy, key: string, value: string | boolean) => setDraft(previous => ({ ...previous, [`${proxy.id}:${key}`]: value }));

    const saveDetails = (proxy: Proxy) => {
        const changes: Record<string, unknown> = {};
        const name = draftValue(proxy, 'name', proxy.name);
        if (name !== proxy.name) changes.name = name;
        const publicHost = draftValue(proxy, 'publicHost', proxy.publicHost);
        if (publicHost !== proxy.publicHost) changes.publicHost = publicHost;
        const motd = draftValue(proxy, 'motd', proxy.motd);
        if (motd !== proxy.motd) changes.motd = motd;
        const maxPlayers = Number(draftValue(proxy, 'maxPlayers', String(proxy.maxPlayers)));
        if (Number.isFinite(maxPlayers) && maxPlayers !== proxy.maxPlayers) changes.maxPlayers = maxPlayers;
        const priority = Number(draftValue(proxy, 'priority', String(proxy.priority)));
        if (Number.isFinite(priority) && priority !== proxy.priority) changes.priority = priority;
        const defaultEntry = draftValue(proxy, 'defaultEntry', proxy.defaultEntry ?? '');
        if (defaultEntry !== (proxy.defaultEntry ?? '')) changes.defaultEntry = defaultEntry;
        const memory = draftValue(proxy, 'memory', '');
        if (memory) changes.memory = memory;
        const image = draftValue(proxy, 'image', '');
        if (image) changes.image = image;
        if (Object.keys(changes).length === 0) {
            report(true, 'Proxy', 'Nothing was changed.');
            return;
        }
        void patch(proxy, changes);
    };

    const changeForwarding = (proxy: Proxy, forwarding: Forwarding) => {
        if (forwarding === proxy.forwarding) return;
        showConfirmDialog({
            title: 'Change forwarding',
            message: `Servers that use ${FORWARDING_LABEL[proxy.forwarding].split(' (')[0]} forwarding are set up again for ${FORWARDING_LABEL[forwarding].split(' (')[0]}. Their containers restart, and servers older than 1.13 cannot stay on modern forwarding.`,
            confirmText: 'Change',
            cancelText: 'Cancel',
            variant: 'default',
            onConfirm: () => void patch(proxy, { forwarding }, 'Forwarding'),
        });
    };

    const missingVelocity = velocityCount === 0;

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1>Proxies</h1>
                    <p>Velocity, BungeeCord and Waterfall instances. New and existing servers are added to them automatically, and they never fall back to another server when one stops.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void rebalance()} disabled={busy !== null || proxies.length === 0}>
                        {busy === 'sync' ? 'Syncing…' : 'Check every server'}
                    </button>
                    <button className={`${styles.btn} ${styles.primary}`} onClick={() => setCreating(value => !value)}>
                        {creating ? 'Close' : 'New proxy'}
                    </button>
                </div>
            </div>

            {network.error && <div className={`${styles.notice} ${styles.error}`}>{network.error}</div>}
            {data && data.adopted && data.adopted.length > 0 && (
                <div className={`${styles.notice} ${styles.success}`}>Found and added: {data.adopted.join(', ')}</div>
            )}

            {data && proxies.length === 0 && !creating && (
                <div className={`${styles.notice} ${styles.warning}`}>
                    There is no proxy yet. Create at least one so servers can join a network; until then every server shows a warning that it is only joinable through its own port.
                </div>
            )}

            {creating && (
                <section className={styles.card}>
                    <div className={styles.cardHeader}><h2>New proxy</h2></div>
                    <div className={`${styles.grid} ${styles.cols3}`}>
                        <label className={styles.field}>Name
                            <input className={styles.input} value={form.name} placeholder="velocity" onChange={event => setForm({ ...form, name: event.target.value })} />
                        </label>
                        <label className={styles.field}>Type
                            <select className={styles.select} value={form.kind} onChange={event => setKind(event.target.value as Kind)}>
                                {(Object.keys(KIND_LABEL) as Kind[]).map(kind => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                            </select>
                        </label>
                        <label className={styles.field}>Forwarding
                            <select className={styles.select} value={form.forwarding} onChange={event => setForm({ ...form, forwarding: event.target.value as Forwarding })}>
                                {forwardingFor(form.kind).map(mode => <option key={mode} value={mode}>{FORWARDING_LABEL[mode]}</option>)}
                            </select>
                        </label>
                        <label className={styles.field}>Port players connect to
                            <input className={styles.input} inputMode="numeric" value={form.port} onChange={event => setForm({ ...form, port: event.target.value })} />
                        </label>
                        <label className={styles.field}>Memory
                            <input className={styles.input} value={form.memory} placeholder="512M" onChange={event => setForm({ ...form, memory: event.target.value })} />
                        </label>
                        <label className={styles.field}>Public address (optional)
                            <input className={styles.input} value={form.publicHost} placeholder="mc.example.com" onChange={event => setForm({ ...form, publicHost: event.target.value })} />
                        </label>
                        <label className={styles.field} style={{ gridColumn: '1 / -1' }}>Message of the day (optional)
                            <input className={styles.input} value={form.motd} onChange={event => setForm({ ...form, motd: event.target.value })} />
                        </label>
                    </div>

                    <p className={styles.hint} style={{ marginTop: '1rem' }}>Plugins to install now. Servers behind the proxy get matching ViaVersion, ViaBackwards and ViaRewind copies so players can use them.</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem' }}>
                        {OPTIONAL_PLUGINS.map(plugin => (
                            <label key={plugin.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                                <input
                                    type="checkbox"
                                    checked={form.plugins.includes(plugin.id)}
                                    onChange={event => setForm({
                                        ...form,
                                        plugins: event.target.checked ? [...form.plugins, plugin.id] : form.plugins.filter(name => name !== plugin.id),
                                    })}
                                />
                                {plugin.label}
                            </label>
                        ))}
                    </div>
                    {form.plugins.includes('geyser') && (
                        <label className={styles.field} style={{ maxWidth: '16rem', marginTop: '0.8rem' }}>Bedrock port (UDP)
                            <input className={styles.input} inputMode="numeric" value={form.bedrockPort} onChange={event => setForm({ ...form, bedrockPort: event.target.value })} />
                        </label>
                    )}
                    {form.kind === 'velocity' && form.forwarding === 'modern' && velocityCount > 0 && (
                        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', marginTop: '0.8rem' }}>
                            <input type="checkbox" checked={form.shareSecret} onChange={event => setForm({ ...form, shareSecret: event.target.checked })} />
                            Use the forwarding secret of the existing Velocity (needed for load balancing: a server knows only one secret)
                        </label>
                    )}
                    {form.kind === 'velocity' && form.forwarding === 'modern' && missingVelocity && (
                        <p className={styles.hint} style={{ marginTop: '0.8rem' }}>
                            With modern forwarding as the only proxy, users can only create servers for Minecraft 1.13 and newer. Add a BungeeGuard or legacy proxy to allow older versions.
                        </p>
                    )}
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem' }}>
                        <button className={`${styles.btn} ${styles.primary}`} disabled={busy !== null || !form.name.trim()} onClick={() => void create()}>
                            {busy === 'create' ? 'Creating…' : 'Create proxy'}
                        </button>
                        <button className={styles.btn} onClick={() => setCreating(false)}>Cancel</button>
                    </div>
                </section>
            )}

            {network.loading && !data ? (
                <div className={styles.loading}><span className={styles.spinner} /> Looking for proxies…</div>
            ) : (
                grouped.filter(group => group.items.length > 0).map(group => (
                    <section key={group.kind} className={`${styles.card} ${styles.flush}`}>
                        <div className={styles.cardHeader}><h2>{KIND_LABEL[group.kind]} ({group.items.length})</h2></div>
                        {group.items.map(proxy => {
                            const expanded = open === proxy.id;
                            const badges = pluginBadges(proxy);
                            return (
                                <div key={proxy.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '1rem 1.25rem' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <div className={styles.primaryText}>
                                                {proxy.name}{' '}
                                                <span className={`${styles.badge} ${proxy.running ? styles.ok : styles.bad}`}>{proxy.running ? 'running' : 'stopped'}</span>{' '}
                                                {!proxy.enabled && <span className={`${styles.badge} ${styles.warn}`}>disabled</span>}{' '}
                                                {proxy.imported && <span className={`${styles.badge} ${styles.info}`}>existing</span>}
                                            </div>
                                            <div className={styles.mutedText}>
                                                {FORWARDING_LABEL[proxy.forwarding].split(' (')[0]} forwarding · port <span className={styles.mono}>{proxy.port}</span> · {proxy.linkedServers} server{proxy.linkedServers === 1 ? '' : 's'} · priority {proxy.priority}
                                                {badges.length > 0 && <> · {badges.join(', ')}</>}
                                            </div>
                                            {!proxy.readable && <div className={`${styles.notice} ${styles.error}`} style={{ marginTop: '0.5rem' }}>Its configuration cannot be read{proxy.error ? `: ${proxy.error}` : ''}.</div>}
                                            {proxy.forwarding !== 'legacy' && proxy.forwarding !== 'none' && !proxy.hasSecret && (
                                                <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: '0.5rem' }}>No forwarding secret was found. Servers cannot be added to this proxy until it has one.</div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <Link className={`${styles.btn} ${styles.small}`} href={`/manager/servers/${proxy.id}`}>Console and files</Link>
                                            <button className={`${styles.btn} ${styles.small}`} disabled={busy !== null} onClick={() => void patch(proxy, { enabled: !proxy.enabled })}>{proxy.enabled ? 'Disable' : 'Enable'}</button>
                                            <button className={`${styles.btn} ${styles.small}`} onClick={() => setOpen(expanded ? null : proxy.id)}>{expanded ? 'Close' : 'Settings'}</button>
                                        </div>
                                    </div>

                                    {expanded && (
                                        <div style={{ marginTop: '1rem' }}>
                                            <div className={`${styles.grid} ${styles.cols3}`}>
                                                <label className={styles.field}>Name
                                                    <input className={styles.input} value={draftValue(proxy, 'name', proxy.name)} onChange={event => setDraftValue(proxy, 'name', event.target.value)} />
                                                </label>
                                                <label className={styles.field}>Forwarding
                                                    <select className={styles.select} value={proxy.forwarding} onChange={event => changeForwarding(proxy, event.target.value as Forwarding)}>
                                                        {(proxy.allowedForwarding.length > 0 ? proxy.allowedForwarding : forwardingFor(proxy.kind)).map(mode => <option key={mode} value={mode}>{FORWARDING_LABEL[mode]}</option>)}
                                                    </select>
                                                </label>
                                                <label className={styles.field}>Priority (higher is used first)
                                                    <input className={styles.input} inputMode="numeric" value={draftValue(proxy, 'priority', String(proxy.priority))} onChange={event => setDraftValue(proxy, 'priority', event.target.value)} />
                                                </label>
                                                <label className={styles.field}>Public address
                                                    <input className={styles.input} value={draftValue(proxy, 'publicHost', proxy.publicHost)} onChange={event => setDraftValue(proxy, 'publicHost', event.target.value)} />
                                                </label>
                                                <label className={styles.field}>Maximum players
                                                    <input className={styles.input} inputMode="numeric" value={draftValue(proxy, 'maxPlayers', String(proxy.maxPlayers))} onChange={event => setDraftValue(proxy, 'maxPlayers', event.target.value)} />
                                                </label>
                                                <label className={styles.field}>Server for players without a host name (Bedrock)
                                                    <select className={styles.select} value={draftValue(proxy, 'defaultEntry', proxy.defaultEntry ?? '')} onChange={event => setDraftValue(proxy, 'defaultEntry', event.target.value)}>
                                                        <option value="">None</option>
                                                        {Object.keys(proxy.entries).map(entry => <option key={entry} value={entry}>{entry}</option>)}
                                                    </select>
                                                </label>
                                                <label className={styles.field} style={{ gridColumn: '1 / -1' }}>Message of the day
                                                    <input className={styles.input} value={draftValue(proxy, 'motd', proxy.motd)} onChange={event => setDraftValue(proxy, 'motd', event.target.value)} />
                                                </label>
                                                {!proxy.imported && (
                                                    <>
                                                        <label className={styles.field}>Memory (for example 1G)
                                                            <input className={styles.input} value={draftValue(proxy, 'memory', '')} placeholder="unchanged" onChange={event => setDraftValue(proxy, 'memory', event.target.value)} />
                                                        </label>
                                                        <label className={styles.field} style={{ gridColumn: 'span 2' }}>Image
                                                            <input className={styles.input} value={draftValue(proxy, 'image', '')} placeholder="unchanged" onChange={event => setDraftValue(proxy, 'image', event.target.value)} />
                                                        </label>
                                                    </>
                                                )}
                                            </div>
                                            <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                <button className={`${styles.btn} ${styles.primary}`} disabled={busy !== null} onClick={() => saveDetails(proxy)}>Save</button>
                                                {!proxy.imported && (
                                                    <button className={styles.btn} disabled={busy !== null} onClick={() => void patch(proxy, { pullImage: true }, 'Image')}>Update image</button>
                                                )}
                                                {OPTIONAL_PLUGINS.filter(plugin => !proxy.plugins[plugin.id]).map(plugin => (
                                                    <button key={plugin.id} className={`${styles.btn} ${styles.small}`} disabled={busy !== null} onClick={() => void patch(proxy, { installPlugins: [plugin.id] }, plugin.label)}>
                                                        Install {plugin.label}
                                                    </button>
                                                ))}
                                                <button className={`${styles.btn} ${styles.danger}`} disabled={busy !== null} onClick={() => remove(proxy)} style={{ marginLeft: 'auto' }}>Delete</button>
                                            </div>
                                            {Object.keys(proxy.entries).length > 0 && (
                                                <div className={styles.tableWrap} style={{ marginTop: '1rem' }}>
                                                    <table className={styles.table}>
                                                        <thead><tr><th>Server in the proxy</th><th>Address</th></tr></thead>
                                                        <tbody>
                                                            {Object.entries(proxy.entries).map(([name, address]) => (
                                                                <tr key={name}><td className={styles.primaryText}>{name}</td><td className={styles.mono}>{address}</td></tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </section>
                ))
            )}

            {data && (
                <section className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div>
                            <h2>Load balancing</h2>
                            <p className={styles.hint}>
                                {proxies.filter(proxy => proxy.enabled).length > 1
                                    ? 'More than one proxy was found, so servers can be spread over them.'
                                    : 'This takes effect once a second proxy with the same forwarding exists.'}
                            </p>
                        </div>
                    </div>
                    <div className={`${styles.grid} ${styles.cols2}`}>
                        <label className={styles.field}>How servers are spread
                            <select className={styles.select} value={data.settings.strategy} disabled={busy !== null} onChange={event => void putSettings({ strategy: event.target.value as Strategy })}>
                                {(Object.keys(STRATEGY_LABEL) as Strategy[]).map(strategy => <option key={strategy} value={strategy}>{STRATEGY_LABEL[strategy]}</option>)}
                            </select>
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', justifyContent: 'center' }}>
                            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.88rem' }}>
                                <input type="checkbox" checked={data.settings.noFallback} disabled={busy !== null} onChange={event => void putSettings({ noFallback: event.target.checked })} />
                                Never send players to another server when theirs stops
                            </label>
                            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.88rem' }}>
                                <input type="checkbox" checked={data.settings.mirrorViaPlugins} disabled={busy !== null} onChange={event => void putSettings({ mirrorViaPlugins: event.target.checked })} />
                                Install ViaVersion, ViaBackwards and ViaRewind on servers when the proxy has them
                            </label>
                        </div>
                    </div>
                </section>
            )}

            {data && data.unlinked.length > 0 && (
                <section className={`${styles.card} ${styles.flush}`}>
                    <div className={styles.cardHeader}>
                        <div>
                            <h2>Servers without a proxy ({data.unlinked.length})</h2>
                            <p className={styles.hint}>“Check every server” adds them to a suitable proxy. Those no proxy supports keep a warning on their dashboard.</p>
                        </div>
                    </div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead><tr><th>Server</th><th>Owner</th><th>Version</th><th>Reason</th></tr></thead>
                            <tbody>
                                {data.unlinked.map(server => (
                                    <tr key={server.uniqueId}>
                                        <td className={styles.primaryText}><Link href={`/manager/servers/${server.uniqueId}`}>{server.serverName}</Link></td>
                                        <td>{server.email}</td>
                                        <td className={styles.mono}>{server.version}</td>
                                        <td className={styles.mutedText}>{server.warnings.length > 0 ? server.warnings.join(', ') : 'not checked yet'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </>
    );
}
