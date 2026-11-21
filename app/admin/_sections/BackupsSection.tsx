'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../admin.module.scss';
import { adminSend, useAdminData } from './shared';

interface Policy { enabled: boolean; intervalHours: number; keep: number; source: 'default' | 'custom' | 'off' }
interface RawPolicy { mode: 'default' | 'custom' | 'off'; intervalHours?: number; keep?: number }

interface BackupsData {
    defaults: { enabled: boolean; intervalHours: number; keep: number };
    servers: Array<{
        uniqueId: string; serverName: string; owner: string; policy: Policy; rawPolicy: RawPolicy;
        lastBackupAt: string | null; lastBackupError: string | null; running: boolean; count: number; bytes: number;
    }>;
}

interface BackupItem { id: string; kind: 'auto' | 'manual'; fileName: string; sizeBytes: number; createdAt: string }

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function every(hours: number): string {
    if (hours % 24 === 0) return hours === 24 ? 'every day' : `every ${hours / 24} days`;
    return hours === 1 ? 'every hour' : `every ${hours} hours`;
}

function ruleText(policy: Policy): string {
    return policy.enabled ? `${every(policy.intervalHours)}, keep ${policy.keep}` : 'Off';
}

/** The default rule for every server */
function DefaultsCard({ data, onSaved }: { data: BackupsData['defaults']; onSaved: () => void }) {
    const { showNotification } = useNotifications();
    const [enabled, setEnabled] = useState(data.enabled);
    const [hours, setHours] = useState(String(data.intervalHours));
    const [keep, setKeep] = useState(String(data.keep));
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        const response = await fetch('/api/admin/backups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, intervalHours: Number(hours), keep: Number(keep) }) });
        setSaving(false);
        showNotification({ type: response.ok ? 'success' : 'error', title: 'Backups', message: response.ok ? 'The default rule is saved.' : 'The default rule could not be saved.' });
        if (response.ok) onSaved();
    };

    return (
        <section className={styles.card}>
            <div className={styles.cardHeader}>
                <div>
                    <h2>Default rule</h2>
                    <p className={styles.hint}>Followed by every server that has no rule of its own. Backups leave out every proxy secret and key, like the download of a server does. Users can download their backups but cannot change any rule.</p>
                </div>
                <button className={`${styles.btn} ${styles.primary}`} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
            <div className={styles.formGrid}>
                <label className={styles.field}>
                    <span><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Back up servers automatically</span>
                    <span className={styles.hint}>Turns the schedule on or off for every server that follows the default.</span>
                </label>
                <label className={styles.field}>Hours between backups
                    <input className={styles.input} type="number" min={1} max={720} value={hours} onChange={event => setHours(event.target.value)} />
                    <span className={styles.hint}>From 1 hour to 30 days (720).</span>
                </label>
                <label className={styles.field}>Automatic backups kept
                    <input className={styles.input} type="number" min={1} max={100} value={keep} onChange={event => setKeep(event.target.value)} />
                    <span className={styles.hint}>The newest this many per server stay, older ones are deleted. Backups made by hand are never deleted automatically.</span>
                </label>
            </div>
        </section>
    );
}

/** The rule, backups and actions of one server */
function ServerPanel({ server, defaults, onChanged }: { server: BackupsData['servers'][number]; defaults: BackupsData['defaults']; onChanged: () => void }) {
    const { showNotification, showConfirmDialog } = useNotifications();
    const [mode, setMode] = useState<RawPolicy['mode']>(server.rawPolicy.mode);
    const [hours, setHours] = useState(String(server.rawPolicy.intervalHours ?? defaults.intervalHours));
    const [keep, setKeep] = useState(String(server.rawPolicy.keep ?? defaults.keep));
    const [busy, setBusy] = useState<string | null>(null);
    const [backups, setBackups] = useState<BackupItem[] | null>(null);

    const loadBackups = useCallback(async () => {
        const response = await fetch(`/api/server/backups?uniqueId=${encodeURIComponent(server.uniqueId)}`);
        const body = await response.json().catch(() => ({}));
        setBackups(response.ok ? body.backups : []);
    }, [server.uniqueId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the panel opens
        void loadBackups();
    }, [loadBackups]);

    const url = '/api/server/backups';
    const saveRule = async () => {
        setBusy('rule');
        const { ok, body } = await adminSend(url, 'POST', { uniqueId: server.uniqueId, action: 'policy', mode, intervalHours: Number(hours), keep: Number(keep) });
        setBusy(null);
        showNotification({ type: ok ? 'success' : 'error', title: 'Backups', message: ok ? `The rule of ${server.serverName} is saved.` : body.message ?? 'The rule could not be saved.' });
        onChanged();
        await loadBackups();
    };

    const backupNow = async () => {
        setBusy('create');
        showNotification({ type: 'info', title: 'Backups', message: `Backing up ${server.serverName}. Large servers can take a few minutes.` });
        const { ok, body } = await adminSend(url, 'POST', { uniqueId: server.uniqueId, action: 'create' });
        setBusy(null);
        showNotification({ type: ok ? 'success' : 'error', title: 'Backups', message: ok ? 'The backup is ready.' : body.message ?? 'The backup failed.' });
        onChanged();
        await loadBackups();
    };

    const remove = (item: BackupItem) => {
        showConfirmDialog({
            title: 'Delete backup',
            message: `Delete the backup of ${server.serverName} from ${new Date(item.createdAt).toLocaleString()}? This cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger',
            onConfirm: async () => {
                const { ok, body } = await adminSend(`${url}?uniqueId=${encodeURIComponent(server.uniqueId)}&id=${item.id}`, 'DELETE');
                showNotification({ type: ok ? 'success' : 'error', title: 'Backups', message: ok ? 'Deleted.' : body.message ?? 'The backup could not be deleted.' });
                onChanged();
                await loadBackups();
            },
        });
    };

    return (
        <section className={styles.card}>
            <div className={styles.cardHeader}>
                <h2>{server.serverName}</h2>
                <Link className={`${styles.btn} ${styles.small}`} href={`/manager/servers/${encodeURIComponent(server.uniqueId)}`}>Open server</Link>
            </div>
            {server.lastBackupError && <div className={`${styles.notice} ${styles.error}`}>The last automatic backup failed: {server.lastBackupError}</div>}
            <div className={styles.formGrid}>
                <label className={styles.field}>Rule for this server
                    <select className={styles.input} value={mode} onChange={event => setMode(event.target.value as RawPolicy['mode'])}>
                        <option value="default">Follow the default ({defaults.enabled ? `${every(defaults.intervalHours)}, keep ${defaults.keep}` : 'off'})</option>
                        <option value="custom">Its own interval and number of copies</option>
                        <option value="off">No automatic backups</option>
                    </select>
                </label>
                {mode === 'custom' && (
                    <>
                        <label className={styles.field}>Hours between backups
                            <input className={styles.input} type="number" min={1} max={720} value={hours} onChange={event => setHours(event.target.value)} />
                        </label>
                        <label className={styles.field}>Automatic backups kept
                            <input className={styles.input} type="number" min={1} max={100} value={keep} onChange={event => setKeep(event.target.value)} />
                        </label>
                    </>
                )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
                <button className={`${styles.btn} ${styles.primary}`} disabled={busy !== null} onClick={() => void saveRule()}>{busy === 'rule' ? 'Saving…' : 'Save rule'}</button>
                <button className={styles.btn} disabled={busy !== null || server.running} onClick={() => void backupNow()}>{busy === 'create' || server.running ? 'Backing up…' : 'Back up now'}</button>
            </div>

            <h3>Backups ({backups?.length ?? '…'})</h3>
            {backups?.length === 0 && <p className={styles.mutedText}>No backups yet.</p>}
            {backups && backups.length > 0 && (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead><tr><th>Made</th><th>Kind</th><th>Size</th><th /></tr></thead>
                        <tbody>
                            {backups.map(item => (
                                <tr key={item.id}>
                                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                                    <td>{item.kind === 'auto' ? 'Automatic' : 'By an administrator'}</td>
                                    <td>{formatSize(item.sizeBytes)}</td>
                                    <td style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                        <a className={`${styles.btn} ${styles.small}`} href={`/api/server/backups/download?uniqueId=${encodeURIComponent(server.uniqueId)}&id=${item.id}`} download>Download</a>
                                        <button className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => remove(item)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

export default function BackupsSection() {
    const backups = useAdminData<BackupsData>('/api/admin/backups');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string | null>(null);

    const servers = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (backups.data?.servers ?? []).filter(server => !term || server.serverName.toLowerCase().includes(term) || server.owner.toLowerCase().includes(term));
    }, [backups.data, search]);
    const current = backups.data?.servers.find(server => server.uniqueId === selected);

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1>Backups</h1>
                    <p>Every server is backed up on a schedule. The rules are set here and nowhere else: users can only download their backups.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void backups.reload()} disabled={backups.loading}>Refresh</button>
                </div>
            </div>

            {backups.error && <div className={`${styles.notice} ${styles.error}`}>{backups.error}</div>}
            {backups.data && (
                <>
                    <DefaultsCard key={JSON.stringify(backups.data.defaults)} data={backups.data.defaults} onSaved={() => void backups.reload()} />

                    <section className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2>Servers ({backups.data.servers.length})</h2>
                            <input className={styles.input} style={{ maxWidth: '16rem' }} placeholder="Search by name or owner" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search servers" />
                        </div>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr><th>Server</th><th>Owner</th><th>Rule</th><th>Last backup</th><th>Backups</th><th /></tr>
                                </thead>
                                <tbody>
                                    {servers.map(server => (
                                        <tr key={server.uniqueId}>
                                            <td>{server.serverName}{server.lastBackupError && <span className={`${styles.badge} ${styles.bad}`} style={{ marginLeft: '0.4rem' }}>failed</span>}</td>
                                            <td>{server.owner}</td>
                                            <td>{ruleText(server.policy)}{server.policy.source === 'custom' && <span className={styles.badge} style={{ marginLeft: '0.4rem' }}>own rule</span>}{server.policy.source === 'off' && <span className={styles.badge} style={{ marginLeft: '0.4rem' }}>server off</span>}</td>
                                            <td>{server.lastBackupAt ? new Date(server.lastBackupAt).toLocaleString() : 'never'}</td>
                                            <td>{server.count} · {formatSize(server.bytes)}</td>
                                            <td><button className={`${styles.btn} ${styles.small}`} onClick={() => setSelected(selected === server.uniqueId ? null : server.uniqueId)}>{selected === server.uniqueId ? 'Close' : 'Manage'}</button></td>
                                        </tr>
                                    ))}
                                    {servers.length === 0 && <tr><td colSpan={6} className={styles.mutedText}>No servers match.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {current && <ServerPanel key={current.uniqueId + JSON.stringify(current.rawPolicy)} server={current} defaults={backups.data.defaults} onChanged={() => void backups.reload()} />}
                </>
            )}
        </>
    );
}
