'use client';

import React, { useEffect, useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { postJson, type ServerInfo } from './types';

/** Image and version updates, for administrators only */
export default function AdminTab({ info, onChanged }: { info: ServerInfo; onChanged: () => void }) {
    const { showNotification, showConfirmDialog } = useNotifications();
    const [version, setVersion] = useState(info.version ?? '');
    const [busy, setBusy] = useState<string | null>(null);
    const [memory, setMemory] = useState('');
    const [memoryInfo, setMemoryInfo] = useState<{ mb: number | null; mode: string } | null>(null);

    useEffect(() => {
        void (async () => {
            const response = await fetch(`/api/server/settings?server=${encodeURIComponent(info.uniqueId)}`);
            const data = await response.json().catch(() => null);
            if (data?.memory) { setMemoryInfo(data.memory); setMemory(data.memory.mb ? String(data.memory.mb) : ''); }
        })();
    }, [info.uniqueId]);

    const saveMemory = async (auto: boolean) => {
        setBusy('memory');
        const { ok, body } = await postJson<{ memory?: { mb: number; mode: string } }>('/api/server/update', { uniqueId: info.uniqueId, action: 'memory', memoryMb: auto ? 'auto' : Number(memory) });
        setBusy(null);
        if (ok && body.memory) { setMemoryInfo(body.memory); setMemory(String(body.memory.mb)); }
        showNotification({ type: ok ? 'success' : 'error', title: 'Memory', message: body.message ?? (ok ? 'Saved.' : 'Failed.') });
    };

    const run = (action: 'image' | 'version') => {
        showConfirmDialog({
            title: action === 'image' ? 'Update the image' : `Move to ${version}`,
            message: `${action === 'image' ? 'The newest image is pulled' : `The server is changed to ${version}`} and the container is recreated. The world and files are kept; players are disconnected for a moment. Moving to an older version can damage a world that was loaded by a newer one.`,
            confirmText: 'Update',
            cancelText: 'Cancel',
            variant: 'danger',
            onConfirm: async () => {
                setBusy(action);
                const { ok, body } = await postJson<{ details?: string[] }>('/api/server/update', { uniqueId: info.uniqueId, action, version });
                setBusy(null);
                showNotification({ type: ok ? 'success' : 'error', title: 'Update', message: [body.message, ...(body.details ?? [])].filter(Boolean).join('\n') });
                onChanged();
            },
        });
    };

    return (
        <div className={`${styles.grid} ${styles.cols2}`}>
            <section className={styles.card}>
                <h2>Memory</h2>
                <p>{memoryInfo?.mode === 'manual' ? 'Set by hand. It does not change when plugins or mods are added.' : 'Sized automatically from the plugins, mods and player slots of this server.'}</p>
                <label className={styles.field}>Heap (MB)
                    <input className={styles.input} type="number" min={512} value={memory} onChange={event => setMemory(event.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className={`${styles.btn} ${styles.primary}`} disabled={busy !== null || !memory || Number(memory) < 512} onClick={() => void saveMemory(false)}>Set memory</button>
                    <button className={styles.btn} disabled={busy !== null || memoryInfo?.mode !== 'manual'} onClick={() => void saveMemory(true)}>Back to automatic</button>
                </div>
                <p className={styles.muted} style={{ marginTop: '0.5rem' }}>Applies the next time the container is recreated.</p>
            </section>
            <section className={styles.card}>
                <h2>Container image</h2>
                <p>Pulls the newest itzg image and recreates the container with the same settings.</p>
                <button className={`${styles.btn} ${styles.primary}`} disabled={info.imported || busy !== null} onClick={() => run('image')}>{busy === 'image' ? 'Updating…' : 'Update image'}</button>
                {info.imported && <p className={styles.muted} style={{ marginTop: '0.75rem' }}>Imported servers keep the container they came with.</p>}
            </section>
            <section className={styles.card}>
                <h2>Minecraft version</h2>
                <p>The proxy that fits the new version is picked again afterwards. Servers older than 1.13 cannot stay behind a modern forwarding proxy.</p>
                <label className={styles.field}>Version
                    <input className={styles.input} value={version} onChange={event => setVersion(event.target.value)} placeholder="1.21.4 or LATEST" />
                </label>
                <button className={`${styles.btn} ${styles.primary}`} style={{ marginTop: '0.75rem' }} disabled={info.imported || busy !== null || !version.trim() || version === info.version} onClick={() => run('version')}>
                    {busy === 'version' ? 'Updating…' : 'Change version'}
                </button>
            </section>
        </div>
    );
}
