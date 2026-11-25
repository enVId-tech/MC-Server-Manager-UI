'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FaArrowCircleUp, FaCloudUploadAlt, FaExclamationTriangle, FaSyncAlt, FaTrash } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import { checkAddonCompatibility } from '@/lib/server/addons/compatibility';
import styles from './AddonManager.module.scss';

interface Addon {
    id: string;
    kind: 'plugin' | 'mod';
    source: string;
    url?: string;
    name: string;
    icon?: string;
    file: string;
    version?: string;
    auto: boolean;
    installedByServer?: boolean;
    compatibilityWarning?: string;
    availableUpdate?: { version?: string; checkedAt?: string };
    updatable?: boolean;
    updatePending: boolean;
    checkedAt?: string;
}

interface Lookup {
    source: string;
    sourceLabel: string;
    url: string;
    name: string | null;
    description?: string;
    icon?: string;
    kinds: Array<'plugin' | 'mod'>;
    loaders?: string[];
    downloadable: boolean;
    verified: boolean;
    note?: string;
}

interface Capabilities {
    plugins: boolean;
    mods: boolean;
    type: string;
    typeName?: string;
    version: string;
}

type Kind = 'plugin' | 'mod';

/**
 * Plugins and mods of one server: drop jars in, paste one link to see its name, logo, and compatibility warning
 * before adding, or switch to advanced mode to add many links at once. Known-source and server-added addons
 * (such as ViaVersion) can be checked for updates and updated directly here.
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
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [advanced, setAdvanced] = useState(false);
    const [bulk, setBulk] = useState('');
    const [results, setResults] = useState<Array<{ link?: string; file?: string; ok: boolean; name?: string; message?: string; warning?: string }>>([]);
    const [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const lookupSeq = useRef(0);

    useEffect(() => {
        let cancelled = false;
        void fetch(`/api/server/addons?server=${encodeURIComponent(uniqueId)}`)
            .then(async response => ({ ok: response.ok, body: await response.json() }))
            .then(({ ok, body }) => {
                if (cancelled) return;
                if (!ok) {
                    setError(body.message ?? 'Could not load plugins and mods.');
                } else {
                    setAddons(body.addons);
                    setCaps(body.capabilities);
                    setCanUploadFiles(body.canUploadFiles === true);
                    setError(null);
                }
                setLoading(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setError('Could not load plugins and mods.');
                    setLoading(false);
                }
            });
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

    const apply = (body: { addons?: Addon[] }) => {
        if (body.addons) setAddons(body.addons);
    };
    const canLoadPlugins = caps?.plugins ?? false;
    const canLoadMods = caps?.mods ?? false;
    const needsUploads = lookup?.source === 'other' && !canUploadFiles;
    const previewCompatibilityWarning = lookup && caps
        ? checkAddonCompatibility(lookup, {
            plugins: caps.plugins,
            mods: caps.mods,
            type: caps.type,
            typeName: caps.typeName,
        })
        : null;

    const addLinks = async (links: string[]) => {
        setBusy(true);
        setResults([]);
        try {
            const response = await fetch('/api/server/addons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server: uniqueId, links }),
            });
            const body = await response.json();
            if (body.results) setResults(body.results);
            apply(body);
            if (!response.ok && !body.results) throw new Error(body.message ?? 'Could not add it.');
            const added = (body.results ?? []).filter((r: { ok: boolean }) => r.ok).length;
            const withWarnings = (body.results ?? []).filter((r: { ok: boolean; warning?: string }) => r.ok && r.warning);
            if (added > 0) {
                showNotification({
                    type: withWarnings.length > 0 ? 'warning' : 'success',
                    title: 'Added',
                    message: withWarnings.length > 0
                        ? `${added} added, but ${withWarnings.length === 1 ? withWarnings[0].name ?? 'it' : `${withWarnings.length} items`} may not be compatible with this server.`
                        : `${added} added. Restart the server to load ${added === 1 ? 'it' : 'them'}.`,
                });
                setLink('');
                setLookup(null);
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
        if (jars.length === 0) {
            showNotification({ type: 'error', title: 'Not a jar', message: 'Only .jar files can be added.' });
            return;
        }
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
        title: `Remove ${addon.name}?`,
        message: 'The file is deleted from the server. Its settings folder stays.',
        confirmText: 'Remove',
        cancelText: 'Cancel',
        onConfirm: async () => {
            const response = await fetch(`/api/server/addons?server=${encodeURIComponent(uniqueId)}&id=${encodeURIComponent(addon.id)}`, { method: 'DELETE' });
            const body = await response.json().catch(() => ({}));
            if (response.ok) apply(body);
            else showNotification({ type: 'error', title: 'Not removed', message: body.message ?? 'Could not remove it.' });
        },
    });

    const patch = async (payload: Record<string, unknown>) => {
        const response = await fetch('/api/server/addons', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ server: uniqueId, ...payload }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) showNotification({ type: 'error', title: 'Failed', message: body.message ?? 'The request failed.' });
        else apply(body);
        return body as {
            outcomes?: Array<{ id: string; name: string; status: string; version?: string; error?: string }>;
            checkOutcomes?: Array<{ id: string; name: string; status: string; latestVersion?: string; error?: string }>;
        };
    };

    const checkUpdates = async () => {
        setBusy(true);
        const body = await patch({ checkUpdates: true });
        setBusy(false);
        const found = (body.checkOutcomes ?? []).filter(o => o.status === 'update-available');
        const failed = (body.checkOutcomes ?? []).filter(o => o.status === 'failed');
        showNotification({
            type: found.length > 0 ? 'info' : failed.length > 0 ? 'warning' : 'success',
            title: 'Update check',
            message: found.length > 0
                ? `${found.length} update${found.length === 1 ? '' : 's'} available (${found.map(o => o.name).join(', ')}).`
                : failed.length > 0
                    ? `Checked with ${failed.length} error${failed.length === 1 ? '' : 's'}.`
                    : 'All plugins and mods are up to date.',
        });
    };

    const updateAddonsNow = async (addon?: Addon) => {
        if (addon) setUpdatingId(addon.id);
        setBusy(true);
        const body = await patch(addon ? { update: true, id: addon.id } : { update: true });
        setBusy(false);
        setUpdatingId(null);

        const outcomes = body.outcomes ?? [];
        const updated = outcomes.filter(o => o.status === 'updated');
        const staged = outcomes.filter(o => o.status === 'staged');
        const failed = outcomes.filter(o => o.status === 'failed');

        if (failed.length > 0 && updated.length === 0 && staged.length === 0) {
            showNotification({ type: 'error', title: 'Update failed', message: failed.map(o => `${o.name}: ${o.error ?? 'failed'}`).join('\n') });
        } else if (updated.length > 0 || staged.length > 0) {
            const parts: string[] = [];
            if (updated.length > 0) parts.push(`${updated.length} updated`);
            if (staged.length > 0) parts.push(`${staged.length} staged for the next restart`);
            showNotification({ type: 'success', title: 'Updated', message: `${parts.join(', ')}.` });
        } else {
            showNotification({ type: 'info', title: 'Up to date', message: `${addon ? addon.name : 'Everything'} is already on the latest version.` });
        }
    };

    if (loading) return <div className={styles.muted}>Loading…</div>;
    if (error) return <div className={`${styles.notice} ${styles.error}`}>{error}</div>;
    if (!caps || (!canLoadPlugins && !canLoadMods)) return <div className={styles.notice}>This server type does not load plugins or mods.</div>;

    const noun = canLoadPlugins && canLoadMods ? 'plugins and mods' : canLoadPlugins ? 'plugins' : 'mods';
    const shown = addons.filter(addon => filter === 'all' || addon.kind === filter);
    const updatableAddons = addons.filter(addon => addon.updatable ?? (addon.source !== 'upload' && addon.source !== 'other'));
    const availableUpdates = addons.filter(addon => Boolean(addon.availableUpdate));

    return (
        <div className={styles.wrap}>
            <div className={styles.head}>
                <h2>Plugins &amp; mods</h2>
                <div className={styles.addRow}>
                    <button className={styles.btn} onClick={() => setAdvanced(value => !value)}>{advanced ? 'Single link' : 'Advanced: many links'}</button>
                    <button className={styles.btn} onClick={() => void checkUpdates()} disabled={busy || updatableAddons.length === 0}>
                        <FaSyncAlt /> Check for updates
                    </button>
                    {availableUpdates.length > 0 && (
                        <button className={`${styles.btn} ${styles.primary}`} onClick={() => void updateAddonsNow()} disabled={busy}>
                            <FaArrowCircleUp /> Update all ({availableUpdates.length})
                        </button>
                    )}
                </div>
            </div>
            <p className={styles.muted}>This server loads {noun}. Links to Modrinth, SpigotMC, Bukkit and CurseForge, plus server-installed plugins (like ViaVersion), show updates and can update themselves.</p>

            {availableUpdates.length > 0 && (
                <div className={`${styles.notice} ${styles.warning} ${styles.noticeRow}`}>
                    <span>
                        <strong>{availableUpdates.length} update{availableUpdates.length === 1 ? '' : 's'} available:</strong>{' '}
                        {availableUpdates.map(item => `${item.name}${item.availableUpdate?.version ? ` (v${item.availableUpdate.version})` : ''}`).join(', ')}
                    </span>
                    <button className={`${styles.btn} ${styles.primary}`} onClick={() => void updateAddonsNow()} disabled={busy}>
                        <FaArrowCircleUp /> Update all
                    </button>
                </div>
            )}

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
                    {previewCompatibilityWarning && (
                        <div className={`${styles.notice} ${styles.warning}`}>
                            <FaExclamationTriangle aria-hidden="true" /> <strong>May not be compatible:</strong> {previewCompatibilityWarning} You can still add it if intended.
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
                <ul className={styles.results}>
                    {results.map((r, index) => (
                        <li key={index} className={!r.ok ? styles.fail : r.warning ? styles.warn : styles.ok}>
                            {r.ok
                                ? `Added ${r.name ?? r.link ?? r.file}${r.warning ? ` — Warning: ${r.warning}` : ''}`
                                : `${r.link ?? r.file}: ${r.message}`}
                        </li>
                    ))}
                </ul>
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
                {shown.map(addon => {
                    const isUpdatable = addon.updatable ?? (addon.source !== 'upload' && addon.source !== 'other');
                    return (
                        <div className={styles.item} key={addon.id}>
                            {addon.icon ? <img className={styles.logo} src={addon.icon} alt="" referrerPolicy="no-referrer" /> : <div className={styles.logo} />}
                            <div className={styles.itemBody}>
                                <strong>
                                    {addon.name}
                                    <span className={styles.pill}>{addon.kind}</span>
                                    {addon.installedByServer && <span className={`${styles.pill} ${styles.serverAdded}`}>added by server</span>}
                                    {addon.compatibilityWarning && (
                                        <span className={`${styles.pill} ${styles.warningPill}`} title={addon.compatibilityWarning}>may not be compatible</span>
                                    )}
                                    {addon.availableUpdate && (
                                        <span className={`${styles.pill} ${styles.updateAvailable}`}>
                                            update available{addon.availableUpdate.version ? `: v${addon.availableUpdate.version}` : ''}
                                        </span>
                                    )}
                                    {addon.updatePending && <span className={`${styles.pill} ${styles.pending}`}>update at restart</span>}
                                </strong>
                                <span className={styles.itemMeta}>
                                    {addon.version ? `v${addon.version} · ` : ''}
                                    {addon.source === 'upload' ? 'uploaded' : addon.source}
                                    {addon.checkedAt ? ` · checked ${new Date(addon.checkedAt).toLocaleString()}` : ''}
                                </span>
                                {addon.compatibilityWarning && (
                                    <span className={styles.warnText}>{addon.compatibilityWarning}</span>
                                )}
                            </div>
                            {isUpdatable && !locked && (
                                <button
                                    className={`${styles.btn} ${addon.availableUpdate ? styles.primary : ''}`}
                                    disabled={busy}
                                    onClick={() => void updateAddonsNow(addon)}
                                >
                                    <FaArrowCircleUp /> {updatingId === addon.id ? 'Updating…' : 'Update'}
                                </button>
                            )}
                            {isUpdatable && (
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={addon.auto}
                                        disabled={locked}
                                        onChange={event => void patch({ id: addon.id, auto: event.target.checked })}
                                    />
                                    Auto-update
                                </label>
                            )}
                            {!locked && (
                                <button className={`${styles.btn} ${styles.danger}`} onClick={() => remove(addon)} aria-label={`Remove ${addon.name}`}>
                                    <FaTrash />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
