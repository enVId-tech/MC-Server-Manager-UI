'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from './create-main.module.scss';

type Kind = 'velocity' | 'bungeecord' | 'waterfall';
type Forwarding = 'modern' | 'bungeeguard' | 'legacy' | 'none';
type PluginName = 'viaversion' | 'viabackwards' | 'viarewind' | 'geyser' | 'floodgate';

const KIND_LABEL: Record<Kind, string> = { velocity: 'Velocity', bungeecord: 'BungeeCord', waterfall: 'Waterfall' };
const FORWARDING_LABEL: Record<Forwarding, string> = {
    modern: 'Modern (Velocity only, most secure)', bungeeguard: 'BungeeGuard (token)', legacy: 'Legacy BungeeCord', none: 'None (not safe)',
};
const FORWARDING_FOR: Record<Kind, Forwarding[]> = { velocity: ['modern', 'bungeeguard', 'legacy', 'none'], bungeecord: ['bungeeguard', 'legacy', 'none'], waterfall: ['bungeeguard', 'legacy', 'none'] };
const PLUGINS: Array<{ id: PluginName; label: string }> = [
    { id: 'viaversion', label: 'ViaVersion' }, { id: 'viabackwards', label: 'ViaBackwards' }, { id: 'viarewind', label: 'ViaRewind' },
    { id: 'geyser', label: 'Geyser (Bedrock)' }, { id: 'floodgate', label: 'Floodgate' },
];

interface ExistingProxy { id: string; name: string; kind: Kind; port: number; baseSubdomain?: string; forwarding?: Forwarding }

/**
 * Administrators create proxies from the same page as servers. A proxy is the public entry of a network: players
 * connect to it, and the servers behind it get names under its base subdomain (server.ex1.example.org).
 */
export default function ProxyCreatePanel() {
    const router = useRouter();
    const { showNotification } = useNotifications();
    const [existing, setExisting] = useState<ExistingProxy[]>([]);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        name: '', kind: 'velocity' as Kind, forwarding: 'modern' as Forwarding, port: '25565', memory: '512M', publicHost: '',
        baseSubdomain: '', motd: '', plugins: [] as PluginName[], bedrockPort: '19132', shareSecret: true,
    });

    useEffect(() => {
        void fetch('/api/admin/network').then(r => (r.ok ? r.json() : null)).then(body => { if (body?.proxies) setExisting(body.proxies); }).catch(() => undefined);
    }, []);

    const velocityCount = existing.filter(proxy => proxy.kind === 'velocity').length;
    const suggestion = `ex${existing.length + 1}`;
    const usedPorts = existing.map(proxy => proxy.port);
    const portClash = usedPorts.includes(Number(form.port));
    const setKind = (kind: Kind) => setForm(previous => ({ ...previous, kind, forwarding: FORWARDING_FOR[kind].includes(previous.forwarding) ? previous.forwarding : FORWARDING_FOR[kind][0] }));

    const create = async () => {
        setBusy(true);
        try {
            const response = await fetch('/api/admin/network/proxies', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form, port: Number(form.port),
                    bedrockPort: form.plugins.includes('geyser') ? Number(form.bedrockPort) : undefined,
                    shareSecret: form.kind === 'velocity' && form.forwarding === 'modern' && velocityCount > 0 ? form.shareSecret : undefined,
                    motd: form.motd || undefined, publicHost: form.publicHost || undefined, baseSubdomain: form.baseSubdomain || undefined,
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.message ?? 'The proxy could not be created.');
            showNotification({ type: 'success', title: 'Proxy created', message: `${form.name} is starting. Servers are connected to it automatically.` });
            router.push('/admin#proxies');
        } catch (error) {
            showNotification({ type: 'error', title: 'Proxy not created', message: error instanceof Error ? error.message : 'The proxy could not be created.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>New proxy</h2>
            <div className={styles.formRow}>
                <div className={styles.formGroup}>
                    <label htmlFor="proxyName">Name</label>
                    <input id="proxyName" type="text" value={form.name} placeholder="velocity" onChange={event => setForm({ ...form, name: event.target.value })} />
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="proxyKind">Type</label>
                    <select id="proxyKind" value={form.kind} onChange={event => setKind(event.target.value as Kind)}>
                        {(Object.keys(KIND_LABEL) as Kind[]).map(kind => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                    </select>
                </div>
            </div>
            <div className={styles.formRow}>
                <div className={styles.formGroup}>
                    <label htmlFor="proxyForwarding">Forwarding</label>
                    <select id="proxyForwarding" value={form.forwarding} onChange={event => setForm({ ...form, forwarding: event.target.value as Forwarding })}>
                        {FORWARDING_FOR[form.kind].map(mode => <option key={mode} value={mode}>{FORWARDING_LABEL[mode]}</option>)}
                    </select>
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="proxyPort">Port players connect to</label>
                    <input id="proxyPort" inputMode="numeric" value={form.port} onChange={event => setForm({ ...form, port: event.target.value })} />
                    {portClash && <small className={styles.fieldHint}>Another proxy already uses this port. Each proxy needs its own.</small>}
                </div>
            </div>
            <div className={styles.formGroup}>
                <label htmlFor="proxyBase">Base subdomain{existing.length > 0 ? ' (required)' : ' (optional)'}</label>
                <input id="proxyBase" value={form.baseSubdomain} placeholder={suggestion} onChange={event => setForm({ ...form, baseSubdomain: event.target.value })} />
                <small className={styles.fieldHint}>Servers behind this proxy are reached as name.{form.baseSubdomain.trim() || suggestion}.your-domain. With several proxies, each needs its own base subdomain and port.</small>
            </div>
            <div className={styles.formRow}>
                <div className={styles.formGroup}>
                    <label htmlFor="proxyMemory">Memory</label>
                    <input id="proxyMemory" value={form.memory} placeholder="512M" onChange={event => setForm({ ...form, memory: event.target.value })} />
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="proxyHost">Public address (optional)</label>
                    <input id="proxyHost" value={form.publicHost} placeholder="mc.example.com" onChange={event => setForm({ ...form, publicHost: event.target.value })} />
                </div>
            </div>
            <div className={styles.formGroup}>
                <label htmlFor="proxyMotd">Message of the day (optional)</label>
                <input id="proxyMotd" value={form.motd} onChange={event => setForm({ ...form, motd: event.target.value })} />
            </div>

            <div className={styles.formGroup}>
                <label>Plugins to install now</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem' }}>
                    {PLUGINS.map(plugin => (
                        <label key={plugin.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <input type="checkbox" checked={form.plugins.includes(plugin.id)} onChange={event => setForm({ ...form, plugins: event.target.checked ? [...form.plugins, plugin.id] : form.plugins.filter(name => name !== plugin.id) })} />
                            {plugin.label}
                        </label>
                    ))}
                </div>
                <small className={styles.fieldHint}>Servers behind the proxy get matching ViaVersion, ViaBackwards and ViaRewind copies so players can use them.</small>
            </div>
            {form.plugins.includes('geyser') && (
                <div className={styles.formGroup}>
                    <label htmlFor="proxyBedrock">Bedrock port (UDP)</label>
                    <input id="proxyBedrock" inputMode="numeric" value={form.bedrockPort} onChange={event => setForm({ ...form, bedrockPort: event.target.value })} />
                </div>
            )}
            {form.kind === 'velocity' && form.forwarding === 'modern' && velocityCount > 0 && (
                <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={form.shareSecret} onChange={event => setForm({ ...form, shareSecret: event.target.checked })} />
                    Use the forwarding secret of the existing Velocity (needed for load balancing: a server knows only one secret)
                </label>
            )}
            <div className={styles.actionButtons}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || !form.name.trim() || portClash} onClick={() => void create()}>
                    {busy ? 'Creating…' : 'Create proxy'}
                </button>
            </div>
        </div>
    );
}
