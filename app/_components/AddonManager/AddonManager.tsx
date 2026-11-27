'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FaArrowCircleUp, FaCloudUploadAlt, FaCodeBranch, FaExclamationTriangle, FaLink, FaSearch, FaSyncAlt, FaTrash } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import { checkAddonCompatibility } from '@/lib/server/addons/compatibility';
import styles from './AddonManager.module.scss';

interface MatchedSource {
    source: 'modrinth' | 'spigot' | 'bukkit' | 'curseforge';
    ref: string;
    url: string;
    name: string;
    icon?: string;
    downloadable: boolean;
    exactHashMatch?: boolean;
    kinds: Array<'plugin' | 'mod'>;
    loaders?: string[];
    note?: string;
}

interface Addon {
    id: string;
    kind: 'plugin' | 'mod';
    source: string;
    origin?: 'link' | 'upload' | 'existing' | 'server';
    ref?: string;
    url?: string;
    name: string;
    icon?: string;
    file: string;
    version?: string;
    versionId?: string;
    auto: boolean;
    pinnedVersion?: boolean;
    installedByServer?: boolean;
    matchedSources?: MatchedSource[];
    compatibilityWarning?: string;
    availableUpdate?: { version?: string; checkedAt?: string };
    updatable?: boolean;
    updatePending: boolean;
    checkedAt?: string;
}

interface Lookup {
    source: string;
    sourceLabel: string;
    ref?: string;
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

interface VersionOption {
    versionId: string;
    version: string;
    name?: string;
    releaseType?: 'release' | 'beta' | 'alpha';
    publishedAt?: string;
    gameVersions?: string[];
    loaders?: string[];
    downloadable: boolean;
    compatible: boolean;
    compatibilityNote?: string;
}

interface VersionDrawerState {
    loading: boolean;
    error?: string;
    versions: VersionOption[];
    strictModMatching: boolean;
    mcVersion: string;
    loaders: string[];
    selectedVersionId: string;
    showIncompatible: boolean;
}

interface Capabilities {
    plugins: boolean;
    mods: boolean;
    type: string;
    typeName?: string;
    version: string;
}

type Kind = 'plugin' | 'mod';

const SOURCE_LABELS: Record<string, string> = {
    modrinth: 'Modrinth',
    spigot: 'SpigotMC',
    bukkit: 'Bukkit',
    curseforge: 'CurseForge',
    other: 'Direct link',
    upload: 'Uploaded jar',
    discovered: 'Existing local jar',
};

function formatVersionLabel(v: VersionOption): string {
    const parts = [v.version];
    if (v.releaseType && v.releaseType !== 'release') parts.push(`[${v.releaseType}]`);
    if (v.gameVersions && v.gameVersions.length > 0) {
        const shown = v.gameVersions.length <= 3 ? v.gameVersions.join(', ') : `${v.gameVersions[0]}…${v.gameVersions[v.gameVersions.length - 1]}`;
        parts.push(`MC ${shown}`);
    }
    if (!v.compatible) parts.push('(incompatible)');
    return parts.join(' · ');
}

/**
 * Plugins and mods of one server: discovers existing/manual jars automatically, matches them with Modrinth,
 * SpigotMC, and CurseForge so users can switch update sources, pick specific versions (with strict 1:1 matching
 * for mods), and update or stage updates cleanly.
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
    const [previewVersions, setPreviewVersions] = useState<VersionOption[]>([]);
    const [previewVersionId, setPreviewVersionId] = useState('');
    const [previewShowIncompatible, setPreviewShowIncompatible] = useState(false);
    const [previewStrictMod, setPreviewStrictMod] = useState(false);
    const [busy, setBusy] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [advanced, setAdvanced] = useState(false);
    const [bulk, setBulk] = useState('');
    const [results, setResults] = useState<Array<{ link?: string; file?: string; ok: boolean; name?: string; message?: string; warning?: string }>>([]);
    const [over, setOver] = useState(false);
    const [versionDrawers, setVersionDrawers] = useState<Record<string, VersionDrawerState>>({});
    const [linkInputForId, setLinkInputForId] = useState<string | null>(null);
    const [manualSourceLink, setManualSourceLink] = useState('');
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

    // One link at a time: look it up and fetch selectable versions as soon as it is pasted
    useEffect(() => {
        const value = link.trim();
        if (advanced || value.length < 8) return;
        const seq = ++lookupSeq.current;
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/server/addons/lookup?link=${encodeURIComponent(value)}`);
                const body = await response.json();
                if (seq !== lookupSeq.current) return;
                if (!response.ok) {
                    setLookupError(body.message ?? 'The link could not be read.');
                    return;
                }
                const found = body.lookup as Lookup;
                setLookup(found);
                setPreviewVersions([]);
                setPreviewVersionId('');
                setPreviewShowIncompatible(false);

                if (found.downloadable && found.ref && ['modrinth', 'spigot', 'curseforge'].includes(found.source)) {
                    const desiredKind: Kind = (caps?.mods && !caps?.plugins && found.kinds.includes('mod'))
                        ? 'mod'
                        : (caps?.plugins && !caps?.mods && found.kinds.includes('plugin'))
                            ? 'plugin'
                            : (found.kinds[0] ?? 'plugin');
                    setPreviewStrictMod(desiredKind === 'mod');
                    const verRes = await fetch(
                        `/api/server/addons/versions?server=${encodeURIComponent(uniqueId)}&source=${encodeURIComponent(found.source)}&ref=${encodeURIComponent(found.ref)}&kind=${desiredKind}`
                    );
                    if (seq !== lookupSeq.current || !verRes.ok) return;
                    const verBody = await verRes.json();
                    if (seq !== lookupSeq.current) return;
                    if (Array.isArray(verBody.versions)) {
                        setPreviewVersions(verBody.versions as VersionOption[]);
                        setPreviewStrictMod(Boolean(verBody.strictModMatching));
                    }
                }
            } catch {
                if (seq === lookupSeq.current) setLookupError('The link could not be read.');
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [link, advanced, uniqueId, caps?.mods, caps?.plugins]);

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

    const selectedPreviewVersion = previewVersions.find(v => v.versionId === previewVersionId);

    const addLinks = async (links: string[]) => {
        setBusy(true);
        setResults([]);
        try {
            const payload: Record<string, unknown> = { server: uniqueId, links };
            if (links.length === 1 && previewVersionId) {
                payload.versionId = previewVersionId;
                if (selectedPreviewVersion && !selectedPreviewVersion.compatible) {
                    payload.allowIncompatibleVersion = true;
                }
            }
            const response = await fetch('/api/server/addons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
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
                setPreviewVersions([]);
                setPreviewVersionId('');
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
        return {
            ok: response.ok,
            ...(body as {
                outcomes?: Array<{ id: string; name: string; status: string; version?: string; error?: string }>;
                checkOutcomes?: Array<{ id: string; name: string; status: string; latestVersion?: string; error?: string }>;
            }),
        };
    };

    const matchAllSources = async (id?: string) => {
        if (id) setUpdatingId(id);
        setBusy(true);
        const body = await patch(id ? { matchSources: true, id } : { matchSources: true });
        setBusy(false);
        setUpdatingId(null);
        if (body.ok) {
            showNotification({
                type: 'success',
                title: 'Sources scanned',
                message: id ? 'Checked Modrinth, SpigotMC, and CurseForge for matches.' : 'Scanned server jars and matched available sources.',
            });
        }
    };

    const selectAddonSource = async (addon: Addon, value: string) => {
        setUpdatingId(addon.id);
        setBusy(true);
        if (value === 'local') {
            await patch({ id: addon.id, selectSource: { source: 'local' } });
        } else {
            const sep = value.indexOf(':');
            const source = value.slice(0, sep);
            const ref = value.slice(sep + 1);
            await patch({ id: addon.id, selectSource: { source, ref } });
        }
        setVersionDrawers(prev => {
            const next = { ...prev };
            delete next[addon.id];
            return next;
        });
        setBusy(false);
        setUpdatingId(null);
    };

    const linkAddonSource = async (addon: Addon) => {
        const url = manualSourceLink.trim();
        if (!url) return;
        setUpdatingId(addon.id);
        setBusy(true);
        const res = await patch({ id: addon.id, selectSource: { link: url } });
        setBusy(false);
        setUpdatingId(null);
        if (res.ok) {
            setLinkInputForId(null);
            setManualSourceLink('');
            setVersionDrawers(prev => {
                const next = { ...prev };
                delete next[addon.id];
                return next;
            });
            showNotification({ type: 'success', title: 'Source linked', message: `${addon.name} is now linked to that source for updates and versions.` });
        }
    };

    const toggleVersionDrawer = async (addon: Addon) => {
        if (versionDrawers[addon.id]) {
            setVersionDrawers(prev => {
                const next = { ...prev };
                delete next[addon.id];
                return next;
            });
            return;
        }
        setVersionDrawers(prev => ({
            ...prev,
            [addon.id]: {
                loading: true,
                versions: [],
                strictModMatching: addon.kind === 'mod',
                mcVersion: caps?.version ?? 'LATEST',
                loaders: [],
                selectedVersionId: '',
                showIncompatible: false,
            },
        }));
        try {
            const res = await fetch(`/api/server/addons/versions?server=${encodeURIComponent(uniqueId)}&id=${encodeURIComponent(addon.id)}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.message ?? 'Could not fetch versions.');
            const versions = (body.versions ?? []) as VersionOption[];
            const firstCompat = versions.find(v => v.compatible && v.downloadable) ?? versions[0];
            setVersionDrawers(prev => ({
                ...prev,
                [addon.id]: {
                    loading: false,
                    versions,
                    strictModMatching: Boolean(body.strictModMatching),
                    mcVersion: String(body.mcVersion ?? caps?.version ?? 'LATEST'),
                    loaders: (body.loaders ?? []) as string[],
                    selectedVersionId: firstCompat?.versionId ?? '',
                    showIncompatible: false,
                },
            }));
        } catch (err) {
            setVersionDrawers(prev => ({
                ...prev,
                [addon.id]: {
                    loading: false,
                    error: err instanceof Error ? err.message : 'Could not fetch versions.',
                    versions: [],
                    strictModMatching: addon.kind === 'mod',
                    mcVersion: caps?.version ?? 'LATEST',
                    loaders: [],
                    selectedVersionId: '',
                    showIncompatible: false,
                },
            }));
        }
    };

    const applySelectedVersion = async (addon: Addon) => {
        const drawer = versionDrawers[addon.id];
        if (!drawer?.selectedVersionId) return;
        const chosen = drawer.versions.find(v => v.versionId === drawer.selectedVersionId);
        setUpdatingId(addon.id);
        setBusy(true);
        const res = await patch({
            id: addon.id,
            versionId: drawer.selectedVersionId,
            ...(chosen && !chosen.compatible ? { allowIncompatibleVersion: true } : {}),
        });
        setBusy(false);
        setUpdatingId(null);
        if (res.ok) {
            const outcome = res.outcomes?.[0];
            showNotification({
                type: 'success',
                title: outcome?.status === 'staged' ? 'Version staged' : 'Version installed',
                message: outcome?.status === 'staged'
                    ? `${addon.name} (${outcome.version ?? chosen?.version ?? ''}) is staged and will apply on next restart.`
                    : `${addon.name} switched to ${outcome?.version ?? chosen?.version ?? 'the selected version'}.`,
            });
        }
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
    const updatableAddons = addons.filter(addon => addon.updatable ?? (addon.source !== 'upload' && addon.source !== 'discovered' && addon.source !== 'other'));
    const availableUpdates = addons.filter(addon => Boolean(addon.availableUpdate));

    const visiblePreviewVersions = previewStrictMod && !previewShowIncompatible
        ? previewVersions.filter(v => v.compatible)
        : previewVersions;

    return (
        <div className={styles.wrap}>
            <div className={styles.head}>
                <h2>Plugins &amp; mods</h2>
                <div className={styles.addRow}>
                    <button className={styles.btn} onClick={() => setAdvanced(value => !value)}>{advanced ? 'Single link' : 'Advanced: many links'}</button>
                    <button className={styles.btn} onClick={() => void matchAllSources()} disabled={busy || addons.length === 0}>
                        <FaSearch /> Scan &amp; match sources
                    </button>
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
            <p className={styles.muted}>This server loads {noun}. Existing and manually uploaded jars are detected automatically, matched against Modrinth, SpigotMC and CurseForge, and allow choosing update sources and versions (with strict 1:1 version checks for mods).</p>

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
                        <input
                            className={styles.input}
                            value={link}
                            onChange={event => {
                                setLink(event.target.value);
                                setLookup(null);
                                setLookupError(null);
                                setPreviewVersions([]);
                                setPreviewVersionId('');
                            }}
                            placeholder="Paste a link to a plugin or mod"
                        />
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
                                {previewVersions.length > 0 && (
                                    <div className={styles.sourceRow}>
                                        <label>
                                            Version:{' '}
                                            <select
                                                className={styles.inlineSelect}
                                                value={previewVersionId}
                                                onChange={event => setPreviewVersionId(event.target.value)}
                                            >
                                                <option value="">Latest compatible</option>
                                                {visiblePreviewVersions.filter(v => v.downloadable).map(v => (
                                                    <option key={v.versionId} value={v.versionId}>{formatVersionLabel(v)}</option>
                                                ))}
                                            </select>
                                        </label>
                                        {previewStrictMod && (
                                            <label className={styles.switch}>
                                                <input
                                                    type="checkbox"
                                                    checked={previewShowIncompatible}
                                                    onChange={event => setPreviewShowIncompatible(event.target.checked)}
                                                />
                                                Show incompatible mod versions
                                            </label>
                                        )}
                                    </div>
                                )}
                                {selectedPreviewVersion && !selectedPreviewVersion.compatible && (
                                    <span className={styles.warnText}>
                                        <FaExclamationTriangle aria-hidden="true" /> {selectedPreviewVersion.compatibilityNote}
                                    </span>
                                )}
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
                {shown.length === 0 && <div className={styles.muted}>No plugins or mods found in this server folder yet.</div>}
                {shown.map(addon => {
                    const isUpdatable = addon.updatable ?? (addon.source !== 'upload' && addon.source !== 'discovered' && addon.source !== 'other');
                    const matches = addon.matchedSources ?? [];
                    const currentSourceKey = isUpdatable && addon.ref ? `${addon.source}:${addon.ref}` : 'local';
                    const drawer = versionDrawers[addon.id];
                    const visibleVersions = drawer
                        ? (drawer.strictModMatching && !drawer.showIncompatible ? drawer.versions.filter(v => v.compatible) : drawer.versions)
                        : [];
                    const chosenDrawerVersion = drawer?.versions.find(v => v.versionId === drawer.selectedVersionId);

                    return (
                        <div className={styles.itemCard} key={addon.id}>
                            <div className={styles.item}>
                                {addon.icon ? <img className={styles.logo} src={addon.icon} alt="" referrerPolicy="no-referrer" /> : <div className={styles.logo} />}
                                <div className={styles.itemBody}>
                                    <strong>
                                        {addon.url ? <a href={addon.url} target="_blank" rel="noreferrer">{addon.name}</a> : addon.name}
                                        <span className={styles.pill}>{addon.kind}</span>
                                        {addon.installedByServer && <span className={`${styles.pill} ${styles.serverAdded}`}>added by server</span>}
                                        {(addon.origin === 'existing' || addon.origin === 'upload') && (
                                            <span className={styles.pill}>{addon.origin === 'existing' ? 'existing' : 'manual upload'}</span>
                                        )}
                                        {addon.pinnedVersion && <span className={styles.pill}>pinned</span>}
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
                                        {SOURCE_LABELS[addon.source] ?? addon.source}
                                        {addon.checkedAt ? ` · checked ${new Date(addon.checkedAt).toLocaleString()}` : ''}
                                    </span>

                                    {!locked && (matches.length > 0 || !isUpdatable) && (
                                        <div className={styles.sourceRow}>
                                            {matches.length > 0 && (
                                                <label>
                                                    Source:{' '}
                                                    <select
                                                        className={styles.inlineSelect}
                                                        value={currentSourceKey}
                                                        disabled={busy}
                                                        onChange={event => void selectAddonSource(addon, event.target.value)}
                                                    >
                                                        {matches.map(m => (
                                                            <option
                                                                key={`${m.source}:${m.ref}`}
                                                                value={`${m.source}:${m.ref}`}
                                                                disabled={!m.downloadable}
                                                            >
                                                                {SOURCE_LABELS[m.source] ?? m.source} — {m.name}{m.exactHashMatch ? ' (exact match)' : ''}{!m.downloadable ? ' (external / manual only)' : ''}
                                                            </option>
                                                        ))}
                                                        <option value="local">Local only (no auto-update)</option>
                                                    </select>
                                                </label>
                                            )}
                                            {!isUpdatable && (
                                                <button
                                                    type="button"
                                                    className={`${styles.btn} ${styles.small}`}
                                                    disabled={busy}
                                                    onClick={() => void matchAllSources(addon.id)}
                                                >
                                                    <FaSearch /> Find source
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.small}`}
                                                disabled={busy}
                                                onClick={() => {
                                                    setLinkInputForId(prev => prev === addon.id ? null : addon.id);
                                                    setManualSourceLink('');
                                                }}
                                            >
                                                <FaLink /> Set URL
                                            </button>
                                        </div>
                                    )}

                                    {linkInputForId === addon.id && !locked && (
                                        <div className={styles.sourceRow}>
                                            <input
                                                className={styles.input}
                                                value={manualSourceLink}
                                                onChange={event => setManualSourceLink(event.target.value)}
                                                placeholder="Paste Modrinth, SpigotMC, Bukkit, or CurseForge link"
                                            />
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.small} ${styles.primary}`}
                                                disabled={busy || !manualSourceLink.trim()}
                                                onClick={() => void linkAddonSource(addon)}
                                            >
                                                Link
                                            </button>
                                        </div>
                                    )}

                                    {addon.compatibilityWarning && (
                                        <span className={styles.warnText}>{addon.compatibilityWarning}</span>
                                    )}
                                </div>

                                <div className={styles.itemActions}>
                                    {isUpdatable && !locked && ['modrinth', 'spigot', 'curseforge'].includes(addon.source) && (
                                        <button
                                            className={styles.btn}
                                            disabled={busy}
                                            onClick={() => void toggleVersionDrawer(addon)}
                                        >
                                            <FaCodeBranch /> {drawer ? 'Hide versions' : 'Versions'}
                                        </button>
                                    )}
                                    {isUpdatable && !locked && (
                                        <button
                                            className={`${styles.btn} ${addon.availableUpdate ? styles.primary : ''}`}
                                            disabled={busy}
                                            onClick={() => void updateAddonsNow(addon)}
                                        >
                                            <FaArrowCircleUp /> {updatingId === addon.id ? 'Working…' : 'Update'}
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
                            </div>

                            {drawer && (
                                <div className={styles.versionPanel}>
                                    {drawer.loading ? (
                                        <span>Loading versions from {SOURCE_LABELS[addon.source] ?? addon.source}…</span>
                                    ) : drawer.error ? (
                                        <span className={styles.warnText}>{drawer.error}</span>
                                    ) : drawer.versions.length === 0 ? (
                                        <span>No selectable versions returned by {SOURCE_LABELS[addon.source] ?? addon.source}.</span>
                                    ) : (
                                        <>
                                            <div className={styles.versionRow}>
                                                <select
                                                    className={styles.inlineSelect}
                                                    value={drawer.selectedVersionId}
                                                    onChange={event => setVersionDrawers(prev => ({
                                                        ...prev,
                                                        [addon.id]: { ...prev[addon.id], selectedVersionId: event.target.value },
                                                    }))}
                                                >
                                                    {visibleVersions.map(v => (
                                                        <option key={v.versionId} value={v.versionId} disabled={!v.downloadable}>
                                                            {formatVersionLabel(v)}{!v.downloadable ? ' (not downloadable)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    className={`${styles.btn} ${styles.small} ${styles.primary}`}
                                                    disabled={busy || !drawer.selectedVersionId || !chosenDrawerVersion?.downloadable}
                                                    onClick={() => void applySelectedVersion(addon)}
                                                >
                                                    Install selected version
                                                </button>
                                                {drawer.strictModMatching && (
                                                    <label className={styles.switch}>
                                                        <input
                                                            type="checkbox"
                                                            checked={drawer.showIncompatible}
                                                            onChange={event => setVersionDrawers(prev => ({
                                                                ...prev,
                                                                [addon.id]: { ...prev[addon.id], showIncompatible: event.target.checked },
                                                            }))}
                                                        />
                                                        Show incompatible mod versions
                                                    </label>
                                                )}
                                            </div>
                                            <span>
                                                {drawer.strictModMatching
                                                    ? `Mods use strict 1:1 matching for Minecraft ${drawer.mcVersion}${drawer.loaders.length > 0 ? ` (${drawer.loaders.join('/')})` : ''}.`
                                                    : `Plugins work across most server versions (server is ${drawer.mcVersion}).`}
                                            </span>
                                            {chosenDrawerVersion?.compatibilityNote && (
                                                <span className={chosenDrawerVersion.compatible ? undefined : styles.warnText}>
                                                    {!chosenDrawerVersion.compatible && <FaExclamationTriangle aria-hidden="true" />} {chosenDrawerVersion.compatibilityNote}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
