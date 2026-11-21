'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FaCloudUploadAlt, FaSyncAlt, FaTrash } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from './AddonManager.module.scss';

interface Addon {
    id: string; kind: 'plugin' | 'mod'; source: string; url?: string; name: string; icon?: string; file: string; version?: string;
    auto: boolean; updatePending: boolean;
}

interface Lookup {
    source: string; sourceLabel: string; url: string; name: string | null; description?: string; icon?: string; kinds: Array<'plugin' | 'mod'>;
    downloadable: boolean; verified: boolean; note?: string;
}

interface Capabilities { plugins: boolean; mods: boolean; type: string; version: string }
type Kind = 'plugin' | 'mod';

/**
 * Plugins and mods of one server: drop jars in, paste one link to see its name and logo before adding, or switch to
 * advanced mode to add many links at once. What the server can load decides whether plugins, mods or both show up.
 */
export default function AddonManager({ uniqueId, locked }: { uniqueId: string; locked?: boolean }) {
    const { showNotification, showConfirmDialog } = useNotifications();
    const [addons, setAddons] = useState<Addon[]>([]);
    const [caps, setCaps] = useState<Capabilities | null>(null);
    const [canUploadFiles, setCanUploadFiles] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Kind | 'all'>('all');
    const [link, setLink] = useState('');
    const [lookup, setLookup] = useState<Lookup | null>(null);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [advanced, setAdvanced] = useState(false);
    const [bulk, setBulk] = useState('');
    const [results, setResults] = useState<Array<{ link?: string; file?: string; ok: boolean; name?: string; message?: string }>>([]);
    const [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const lookupSeq = useRef(0);

    useEffect(() => {
        let cancelled = false;
        void fetch(`/api/server/addons?server=${encodeURIComponent(uniqueId)}`)
            .then(async response => ({ ok: response.ok, body: await response.json() }))
            .then(({ ok, body }) => {
                if (cancelled) return;
                if (!ok) { setError(body.message ?? 'Could not load plugins and mods.'); } else {
                    setAddons(body.addons); setCaps(body.capabilities); setCanUploadFiles(body.canUploadFiles === true); setError(null);
                }
                setLoading(false);
            })
            .catch(() => { if (!cancelled) { setError('Could not load plugins and mods.'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [uniqueId]);

    // One link at a time: look it up as soon as it is pasted
    useEffect(() => {
        const value = link.trim();
        if (advanced || value.length < 8) return;
        const seq = ++lookupSeq.current;
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/server/addons/lookup?link=${encodeURIComponent(value)}`);
                const body = await response.json();
                if (seq !== lookupSeq.current) return;
                if (!response.ok) setLookupError(body.message ?? 'The link could not be read.');
                else setLookup(body.lookup);
            } catch {
                if (seq === lookupSeq.current) setLookupError('The link could not be read.');
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [link, advanced]);

    const apply = (body: { addons?: Addon[] }) => { if (body.addons) setAddons(body.addons); };
    const canLoadPlugins = caps?.plugins ?? false;
    const canLoadMods = caps?.mods ?? false;
    const needsUploads = lookup?.source === 'other' && !canUploadFiles;

    const addLinks = async (links: string[]) => {
        setBusy(true);
        setResults([]);
        try {
            const response = await fetch('/api/server/addons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ server: uniqueId, links }) });
            const body = await response.json();
            if (body.results) setResults(body.results);
            apply(body);
            if (!response.ok && !body.results) throw new Error(body.message ?? 'Could not add it.');
            const added = (body.results ?? []).filter((r: { ok: boolean }) => r.ok).length;
            if (added > 0) {
                showNotification({ type: 'success', title: 'Added', message: `${added} added. Restart the server to load ${added === 1 ? 'it' : 'them'}.` });
                setLink(''); setLookup(null);
                if (advanced) setBulk('');
            } else if (links.length === 1) {
                showNotification({ type: 'error', title: 'Not added', message: body.results?.[0]?.message ?? 'Could not add it.' });
            }
        } catch (e) {
            showNotification({ type: 'error', title: 'Not added', message: e instanceof Error ? e.message : 'Could not add it.' });
        } finally {
            setBusy(false);
        }
    };

    const uploadJars = async (picked: File[]) => {
        const jars = picked.filter(file => /\.jar$/i.test(file.name));
        if (jars.length === 0) { showNotification({ type: 'error', title: 'Not a jar', message: 'Only .jar files can be added.' }); return; }
        setBusy(true);
        setResults([]);
        try {
            const form = new FormData();
            form.append('server', uniqueId);
            jars.forEach(file => form.append('file', file));
            const response = await fetch('/api/server/addons', { method: 'POST', body: form });
            const body = await response.json();
            if (body.results) setResults(body.results);
            apply(body);
            if (!response.ok && !body.results) throw new Error(body.message ?? 'The upload failed.');
        } catch (e) {
            showNotification({ type: 'error', title: 'Upload failed', message: e instanceof Error ? e.message : 'The upload failed.' });
        } finally {
            setBusy(false);
        }
    };

    const remove = (addon: Addon) => showConfirmDialog({
        title: `Remove ${addon.name}?`, message: 'The file is deleted from the server. Its settings folder stays.', confirmText: 'Remove', cancelText: 'Cancel',
        onConfirm: async () => {
            const response = await fetch(`/api/server/addons?server=${encodeURIComponent(uniqueId)}&id=${encodeURIComponent(addon.id)}`, { method: 'DELETE' });
            const body = await response.json().catch(() => ({}));
            if (response.ok) apply(body); else showNotification({ type: 'error', title: 'Not removed', message: body.message ?? 'Could not remove it.' });
        },
    });

    const patch = async (payload: Record<string, unknown>) => {
        const response = await fetch('/api/server/addons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ server: uniqueId, ...payload }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) showNotification({ type: 'error', title: 'Failed', message: body.message ?? 'The request failed.' });
        else apply(body);
        return body as { outcomes?: Array<{ name: string; status: string; error?: string }> };
    };

    const checkUpdates = async () => {
        setBusy(true);
        const body = await patch({ update: true });
        setBusy(false);
        const done = (body.outcomes ?? []).filter(o => o.status === 'updated' || o.status === 'staged');
        showNotification({ type: 'info', title: 'Update check', message: done.length > 0 ? `${done.length} update${done.length === 1 ? '' : 's'} found. They apply at the next restart.` : 'Everything is up to date.' });
    };

    if (loading) return <div className={styles.muted}>Loading…</div>;
    if (error) return <div className={`${styles.notice} ${styles.error}`}>{error}</div>;
    if (!caps || (!canLoadPlugins && !canLoadMods)) return <div className={styles.notice}>This server type does not load plugins or mods.</div>;

    const noun = canLoadPlugins && canLoadMods ? 'plugins and mods' : canLoadPlugins ? 'plugins' : 'mods';
    const shown = addons.filter(addon => filter === 'all' || addon.kind === filter);

    return (
        <div className={styles.wrap}>
            <div className={styles.head}>
                <h2>Plugins &amp; mods</h2>
                <div className={styles.addRow}>
                    <button className={styles.btn} onClick={() => setAdvanced(value => !value)}>{advanced ? 'Single link' : 'Advanced: many links'}</button>
                    <button className={styles.btn} onClick={() => void checkUpdates()} disabled={busy || addons.length === 0}><FaSyncAlt /> Check for updates</button>
                </div>
            </div>
            <p className={styles.muted}>This server loads {noun}. Links to Modrinth, SpigotMC, Bukkit and CurseForge show a preview and can update themselves.</p>

            {!locked && (advanced ? (
                <div className={styles.wrap}>
                    <textarea className={styles.textarea} value={bulk} onChange={event => setBulk(event.target.value)} placeholder={'One link per line\nhttps://modrinth.com/plugin/luckperms\nhttps://www.spigotmc.org/resources/essentialsx.9089/'} />
                    <div><button className={`${styles.btn} ${styles.primary}`} disabled={busy || bulk.trim() === ''} onClick={() => void addLinks(bulk.split(/\r?\n/).map(line => line.trim()).filter(Boolean))}>{busy ? 'Adding…' : 'Add all'}</button></div>
                </div>
            ) : (
                <div className={styles.wrap}>
                    <div className={styles.addRow}>
                        <input className={styles.input} value={link} onChange={event => { setLink(event.target.value); setLookup(null); setLookupError(null); }} placeholder="Paste a link to a plugin or mod" />
                        <button className={`${styles.btn} ${styles.primary}`} disabled={busy || !link.trim() || !!lookupError || needsUploads || lookup?.downloadable === false} onClick={() => void addLinks([link.trim()])}>{busy ? 'Adding…' : 'Add'}</button>
                    </div>
                    {lookupError && <div className={`${styles.notice} ${styles.error}`}>{lookupError}</div>}
                    {lookup && lookup.source !== 'other' && (
                        <div className={styles.preview}>
                                            {lookup.icon ? <img className={styles.logo} src={lookup.icon} alt="" referrerPolicy="no-referrer" /> : <div className={styles.logo} />}
                            <div className={styles.previewBody}>
                                <strong>{lookup.name}<span className={styles.pill}>{lookup.sourceLabel}</span></strong>
                                {lookup.description && <p>{lookup.description}</p>}
                                {lookup.note && <p>{lookup.note}</p>}
                            </div>
                        </div>
                    )}
                    {lookup?.source === 'other' && <div className={styles.notice}>{needsUploads ? 'Other links need file uploads to be switched on for this server (Files tab).' : 'Not a known site, so it is downloaded as it is, with no preview.'}</div>}
                </div>
            ))}

            {!locked && (
                <div
                    className={`${styles.drop} ${over ? styles.over : ''} ${canUploadFiles ? '' : styles.locked}`}
                    onDragOver={event => { event.preventDefault(); setOver(true); }}
                    onDragLeave={() => setOver(false)}
                    onDrop={event => { event.preventDefault(); setOver(false); if (canUploadFiles) void uploadJars(Array.from(event.dataTransfer.files)); }}
                    onClick={() => canUploadFiles && input.current?.click()}
                >
                    <FaCloudUploadAlt /> {canUploadFiles ? `Drop .jar files here to add ${noun}, or click to pick them` : 'Uploading jar files is switched off for this server. Turn it on in the Files tab.'}
                    <input ref={input} type="file" accept=".jar" multiple hidden onChange={event => { void uploadJars(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
                </div>
            )}

            {results.length > 0 && (
                <ul className={styles.results}>{results.map((r, index) => <li key={index} className={r.ok ? styles.ok : styles.fail}>{r.ok ? `Added ${r.name ?? r.link ?? r.file}` : `${r.link ?? r.file}: ${r.message}`}</li>)}</ul>
            )}

            {canLoadPlugins && canLoadMods && (
                <div className={styles.tabs}>
                    {(['all', 'plugin', 'mod'] as const).map(value => (
                        <button key={value} className={`${styles.tab} ${filter === value ? styles.active : ''}`} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'plugin' ? 'Plugins' : 'Mods'}</button>
                    ))}
                </div>
            )}

            <div className={styles.list}>
                {shown.length === 0 && <div className={styles.muted}>Nothing added through the manager yet.</div>}
                {shown.map(addon => (
                    <div className={styles.item} key={addon.id}>
                                    {addon.icon ? <img className={styles.logo} src={addon.icon} alt="" referrerPolicy="no-referrer" /> : <div className={styles.logo} />}
                        <div className={styles.itemBody}>
                            <strong>{addon.name}<span className={styles.pill}>{addon.kind}</span>{addon.updatePending && <span className={`${styles.pill} ${styles.pending}`}>update at restart</span>}</strong>
                            <span className={styles.itemMeta}>{addon.version ? `v${addon.version} · ` : ''}{addon.source === 'upload' ? 'uploaded' : addon.source}</span>
                        </div>
                        {addon.source !== 'upload' && addon.source !== 'other' && (
                            <label className={styles.switch}><input type="checkbox" checked={addon.auto} disabled={locked} onChange={event => void patch({ id: addon.id, auto: event.target.checked })} /> Auto-update</label>
                        )}
                        {!locked && <button className={`${styles.btn} ${styles.danger}`} onClick={() => remove(addon)} aria-label={`Remove ${addon.name}`}><FaTrash /></button>}
                    </div>
                ))}
            </div>
        </div>
    );
}
