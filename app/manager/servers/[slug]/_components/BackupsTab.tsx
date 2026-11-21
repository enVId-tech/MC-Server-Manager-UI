'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { postJson } from './types';

interface BackupItem {
    id: string;
    kind: 'auto' | 'manual';
    fileName: string;
    sizeBytes: number;
    createdAt: string;
}

interface Policy {
    enabled: boolean;
    intervalHours: number;
    keep: number;
    source: 'default' | 'custom' | 'off';
}

interface BackupsResponse {
    isAdmin: boolean;
    running: boolean;
    policy: Policy;
    nextBackupAt: string | null;
    lastBackupAt: string | null;
    lastBackupError: string | null;
    rawPolicy?: { mode: 'default' | 'custom' | 'off'; intervalHours?: number; keep?: number };
    defaults?: { enabled: boolean; intervalHours: number; keep: number };
    backups: BackupItem[];
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatEvery(hours: number): string {
    if (hours % 24 === 0) return hours === 24 ? 'every day' : `every ${hours / 24} days`;
    return hours === 1 ? 'every hour' : `every ${hours} hours`;
}

/** Backups of a server: download for everyone who owns it, rules and manual backups for administrators */
export default function BackupsTab({ uniqueId }: { uniqueId: string }) {
    const { showNotification, showConfirmDialog } = useNotifications();
    const [data, setData] = useState<BackupsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [mode, setMode] = useState<'default' | 'custom' | 'off'>('default');
    const [interval, setIntervalHours] = useState('24');
    const [keep, setKeep] = useState('7');

    const load = useCallback(async () => {
        try {
            const response = await fetch(`/api/server/backups?uniqueId=${encodeURIComponent(uniqueId)}`);
            const body = await response.json();
            if (!response.ok) { setError(body.message ?? 'The backups could not be read.'); return; }
            setData(body);
            setError(null);
            if (body.rawPolicy) {
                setMode(body.rawPolicy.mode);
                setIntervalHours(String(body.rawPolicy.intervalHours ?? body.defaults?.intervalHours ?? 24));
                setKeep(String(body.rawPolicy.keep ?? body.defaults?.keep ?? 7));
            }
        } catch {
            setError('The backups could not be read.');
        }
    }, [uniqueId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the tab opens
        void load();
        // A backup that runs takes a while; the list is refreshed while one is under way
        const timer = setInterval(() => void load(), 15000);
        return () => clearInterval(timer);
    }, [load]);

    const savePolicy = async () => {
        setBusy('policy');
        const { ok, body } = await postJson('/api/server/backups', { uniqueId, action: 'policy', mode, intervalHours: Number(interval), keep: Number(keep) });
        setBusy(null);
        showNotification({ type: ok ? 'success' : 'error', title: 'Backups', message: ok ? 'The backup rule is saved.' : body.message ?? 'The rule could not be saved.' });
        await load();
    };

    const backupNow = async () => {
        setBusy('create');
        showNotification({ type: 'info', title: 'Backups', message: 'Backing up. Large servers can take a few minutes.' });
        const { ok, body } = await postJson('/api/server/backups', { uniqueId, action: 'create' });
        setBusy(null);
        showNotification({ type: ok ? 'success' : 'error', title: 'Backups', message: ok ? 'The backup is ready.' : body.message ?? 'The backup failed.' });
        await load();
    };

    const remove = (item: BackupItem) => {
        showConfirmDialog({
            title: 'Delete backup',
            message: `Delete the backup from ${new Date(item.createdAt).toLocaleString()}? This cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger',
            onConfirm: async () => {
                const { ok, body } = await postJson('/api/server/backups?uniqueId=' + encodeURIComponent(uniqueId) + '&id=' + item.id, {}, 'DELETE');
                showNotification({ type: ok ? 'success' : 'error', title: 'Backups', message: ok ? 'Deleted.' : body.message ?? 'The backup could not be deleted.' });
                await load();
            },
        });
    };

    if (error) return <div className={`${styles.notice} ${styles.error}`}>{error}</div>;
    if (!data) return <p className={styles.muted}>Reading the backups…</p>;

    const { policy } = data;
    return (
        <div className={`${styles.grid} ${styles.cols2}`}>
            <section className={styles.card}>
                <h2>Automatic backups</h2>
                {policy.enabled ? (
                    <p>This server is backed up <strong>{formatEvery(policy.intervalHours)}</strong>, and the newest <strong>{policy.keep}</strong> automatic backups are kept.{policy.source === 'custom' ? ' This server has its own rule.' : ''}</p>
                ) : (
                    <p>Automatic backups are off for this server.</p>
                )}
                {policy.enabled && data.nextBackupAt && <p className={styles.muted}>Next backup: {new Date(data.nextBackupAt).toLocaleString()}{data.running ? ' (running now)' : ''}</p>}
                <p className={styles.muted}>Last backup: {data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString() : 'none yet'}</p>
                <p className={styles.muted}>Backups leave out everything that belongs to the proxy network, such as forwarding secrets and keys, like the download of the server does. Only administrators change these rules.</p>
                {data.lastBackupError && <div className={`${styles.notice} ${styles.error}`}>The last automatic backup failed: {data.lastBackupError}</div>}

                {data.isAdmin && (
                    <>
                        <h3 style={{ marginTop: '1rem' }}>Rule for this server</h3>
                        <label className={styles.field}>Rule
                            <select className={styles.input} value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
                                <option value="default">Follow the default{data.defaults ? ` (${data.defaults.enabled ? `${formatEvery(data.defaults.intervalHours)}, keep ${data.defaults.keep}` : 'off'})` : ''}</option>
                                <option value="custom">Its own interval and number of copies</option>
                                <option value="off">No automatic backups</option>
                            </select>
                        </label>
                        {mode === 'custom' && (
                            <>
                                <label className={styles.field}>Hours between backups
                                    <input className={styles.input} type="number" min={1} max={720} value={interval} onChange={event => setIntervalHours(event.target.value)} />
                                </label>
                                <label className={styles.field}>Automatic backups to keep
                                    <input className={styles.input} type="number" min={1} max={100} value={keep} onChange={event => setKeep(event.target.value)} />
                                </label>
                            </>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                            <button className={`${styles.btn} ${styles.primary}`} disabled={busy !== null} onClick={() => void savePolicy()}>{busy === 'policy' ? 'Saving…' : 'Save rule'}</button>
                            <button className={styles.btn} disabled={busy !== null || data.running} onClick={() => void backupNow()}>{busy === 'create' || data.running ? 'Backing up…' : 'Back up now'}</button>
                        </div>
                        <p className={styles.muted}>The default for all servers is set under Admin → Settings.</p>
                    </>
                )}
            </section>

            <section className={styles.card}>
                <h2>Backups ({data.backups.length})</h2>
                {data.backups.length === 0 && <p className={styles.muted}>No backups yet.</p>}
                {data.backups.map(item => (
                    <div key={item.id} className={styles.addressRow}>
                        <div>
                            <span className={styles.addressLabel}>{item.kind === 'auto' ? 'Automatic' : 'Made by an administrator'}</span>
                            <span>{new Date(item.createdAt).toLocaleString()} · {formatSize(item.sizeBytes)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <a className={`${styles.btn} ${styles.small}`} href={`/api/server/backups/download?uniqueId=${encodeURIComponent(uniqueId)}&id=${item.id}`} download>Download</a>
                            {data.isAdmin && <button className={`${styles.btn} ${styles.small}`} onClick={() => remove(item)}>Delete</button>}
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
}
