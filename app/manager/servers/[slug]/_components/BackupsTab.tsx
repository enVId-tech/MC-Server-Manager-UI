'use client';

import React, { useCallback, useEffect, useState } from 'react';
import styles from '../dashboard.module.scss';

interface BackupItem {
    id: string;
    kind: 'auto' | 'manual';
    fileName: string;
    sizeBytes: number;
    createdAt: string;
}

interface BackupsResponse {
    running: boolean;
    policy: { enabled: boolean; intervalHours: number; keep: number; source: 'default' | 'custom' | 'off' };
    nextBackupAt: string | null;
    lastBackupAt: string | null;
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

/**
 * The backups of a server, to download. The schedule is shown but not editable here: administrators set it in the
 * admin panel (Admin → Backups), for everyone.
 */
export default function BackupsTab({ uniqueId }: { uniqueId: string }) {
    const [data, setData] = useState<BackupsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const response = await fetch(`/api/server/backups?uniqueId=${encodeURIComponent(uniqueId)}`);
            const body = await response.json();
            if (!response.ok) { setError(body.message ?? 'The backups could not be read.'); return; }
            setData(body);
            setError(null);
        } catch {
            setError('The backups could not be read.');
        }
    }, [uniqueId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the tab opens
        void load();
        const timer = setInterval(() => void load(), 30000);
        return () => clearInterval(timer);
    }, [load]);

    if (error) return <div className={`${styles.notice} ${styles.error}`}>{error}</div>;
    if (!data) return <p className={styles.muted}>Reading the backups…</p>;

    const { policy } = data;
    return (
        <div className={`${styles.grid} ${styles.cols2}`}>
            <section className={styles.card}>
                <h2>Automatic backups</h2>
                {policy.enabled ? (
                    <p>This server is backed up <strong>{formatEvery(policy.intervalHours)}</strong>, and the newest <strong>{policy.keep}</strong> automatic backups are kept.</p>
                ) : (
                    <p>Automatic backups are off for this server.</p>
                )}
                {policy.enabled && data.nextBackupAt && <p className={styles.muted}>Next backup: {new Date(data.nextBackupAt).toLocaleString()}{data.running ? ' (running now)' : ''}</p>}
                <p className={styles.muted}>Last backup: {data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString() : 'none yet'}</p>
                <p className={styles.muted}>Backups leave out everything that belongs to the proxy network, such as forwarding secrets and keys, like the download of the server does. Administrators set the schedule.</p>
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
                        <a className={`${styles.btn} ${styles.small}`} href={`/api/server/backups/download?uniqueId=${encodeURIComponent(uniqueId)}&id=${item.id}`} download>Download</a>
                    </div>
                ))}
            </section>
        </div>
    );
}
