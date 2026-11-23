'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FaArchive, FaClock, FaDownload } from 'react-icons/fa';
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
    if (!data) return <div className={styles.card}><div className={styles.loading}>Reading the backups…</div></div>;

    const { policy } = data;
    return (
        <div className={`${styles.grid} ${styles.cols2}`}>
            <section className={styles.card}>
                <div className={styles.cardHeader}>
                    <h2><span className={styles.cardIcon}><FaClock aria-hidden="true" /></span> Automatic backups</h2>
                    <span className={`${styles.badge} ${policy.enabled ? styles.ok : styles.warn}`}>
                        {policy.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <div className={styles.kvList} style={{ marginBottom: '0.9rem' }}>
                    <div className={styles.kvRow}>
                        <span className={styles.kvKey}>Schedule</span>
                        <span className={styles.kvValue}>{policy.enabled ? formatEvery(policy.intervalHours) : 'Off'}</span>
                    </div>
                    {policy.enabled && (
                        <div className={styles.kvRow}>
                            <span className={styles.kvKey}>Retention</span>
                            <span className={styles.kvValue}>Newest {policy.keep} automatic backups</span>
                        </div>
                    )}
                    {policy.enabled && data.nextBackupAt && (
                        <div className={styles.kvRow}>
                            <span className={styles.kvKey}>Next backup</span>
                            <span className={styles.kvValue}>{new Date(data.nextBackupAt).toLocaleString()}{data.running ? ' (running now)' : ''}</span>
                        </div>
                    )}
                    <div className={styles.kvRow}>
                        <span className={styles.kvKey}>Last backup</span>
                        <span className={styles.kvValue}>{data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString() : 'None yet'}</span>
                    </div>
                </div>
                <p>Backups leave out everything that belongs to the proxy network, such as forwarding secrets and keys, like the download of the server does. Administrators set the schedule.</p>
            </section>

            <section className={styles.card}>
                <div className={styles.cardHeader}>
                    <h2><span className={styles.cardIcon}><FaArchive aria-hidden="true" /></span> Backups</h2>
                    <span className={`${styles.badge} ${styles.info}`}>{data.backups.length} saved</span>
                </div>
                {data.backups.length === 0 && <div className={styles.empty}>No backups yet.</div>}
                {data.backups.map(item => (
                    <div key={item.id} className={styles.addressRow}>
                        <div>
                            <span className={styles.addressLabel}>{item.kind === 'auto' ? 'Automatic' : 'Made by an administrator'}</span>
                            <span>{new Date(item.createdAt).toLocaleString()} · <span className={styles.mono}>{formatSize(item.sizeBytes)}</span></span>
                        </div>
                        <a className={`${styles.btn} ${styles.small}`} href={`/api/server/backups/download?uniqueId=${encodeURIComponent(uniqueId)}&id=${item.id}`} download>
                            <FaDownload aria-hidden="true" /> Download
                        </a>
                    </div>
                ))}
            </section>
        </div>
    );
}
