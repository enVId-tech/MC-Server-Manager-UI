'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { postJson, type ServerInfo } from './types';

/** Image and version updates, for administrators only */
export default function AdminTab({ info, onChanged }: { info: ServerInfo; onChanged: () => void }) {
    const { showNotification, showConfirmDialog } = useNotifications();
    const [version, setVersion] = useState(info.version ?? '');
    const [busy, setBusy] = useState<string | null>(null);

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
