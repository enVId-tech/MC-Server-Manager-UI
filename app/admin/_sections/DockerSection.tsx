'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../admin.module.scss';
import { adminSend, useAdminData } from './shared';

interface UpdateConfig {
    enabled: boolean;
    schedule: 'daily' | 'weekly' | 'monthly' | 'manual';
    maintenanceWindow?: { startHour: number; endHour: number; timezone: string };
    autoRestart: boolean;
    cleanupOldImages: boolean;
    maxImageAge: number;
    notifyUsers: boolean;
    rollbackOnFailure: boolean;
}

interface DockerData {
    status: { config: UpdateConfig; isUpdating: boolean; queueSize: number };
    updateCheck: {
        updatesAvailable: boolean;
        containers: Array<{ serverId: string; serverName: string; containerName: string; currentImage: string; targetImage: string; status: string }>;
    };
}

interface UpdateResult {
    success: boolean;
    updatedContainers: string[];
    failedContainers: string[];
    errors: string[];
    rollbackPerformed: boolean;
    details: string[];
}

export default function DockerSection() {
    const { showNotification } = useNotifications();
    const docker = useAdminData<DockerData>('/api/admin/docker-updates');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<UpdateResult | null>(null);

    const config = docker.data?.status.config;
    const containers = docker.data?.updateCheck.containers ?? [];
    const isUpdating = docker.data?.status.isUpdating ?? false;

    const post = async (action: string, extra: Record<string, unknown> = {}) => {
        setBusy(true);
        const response = await adminSend<{ result?: UpdateResult; success?: boolean }>('/api/admin/docker-updates', 'POST', { action, ...extra });
        setBusy(false);
        if (!response.ok) {
            showNotification({ type: 'error', title: 'Docker updates', message: response.body.message || response.body.error || 'The request failed.' });
        }
        return response;
    };

    const update = async (serverIds: string[]) => {
        const { ok, body } = await post('manual-update', { serverIds });
        if (body.result) setResult(body.result);
        if (ok) {
            showNotification({ type: body.result?.success === false ? 'error' : 'success', title: 'Docker updates', message: body.result?.success === false ? 'Some updates failed.' : 'The update finished.' });
            setSelected(new Set());
            await docker.reload();
        }
    };

    const saveConfig = async (changes: Partial<UpdateConfig>) => {
        const { ok } = await post('update-config', { config: changes });
        if (ok) await docker.reload();
    };

    const cancel = async () => {
        const { ok } = await post('cancel-update');
        if (ok) await docker.reload();
    };

    const allSelected = containers.length > 0 && selected.size === containers.length;
    const toggle = (id: string) => setSelected(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1>Docker updates</h1>
                    <p>Keep the server images up to date, by hand or on a schedule. Imported servers keep their own containers and are not touched.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void docker.reload()} disabled={docker.loading}>{docker.loading ? 'Checking…' : 'Check for updates'}</button>
                </div>
            </div>

            {docker.error && <div className={`${styles.notice} ${styles.error}`}>{docker.error}</div>}
            {docker.loading && !docker.data && <div className={styles.loading}><span className={styles.spinner} /> Checking images…</div>}

            {docker.data && config && (
                <>
                    <div className={`${styles.grid} ${styles.stats}`}>
                        <div className={`${styles.stat} ${config.enabled ? styles.good : ''}`}>
                            <span className={styles.statLabel}>Automatic updates</span>
                            <span className={styles.statValue}>{config.enabled ? 'On' : 'Off'}</span>
                            <span className={styles.statNote}>Schedule: {config.schedule}</span>
                        </div>
                        <div className={`${styles.stat} ${isUpdating ? styles.warn : ''}`}>
                            <span className={styles.statLabel}>Right now</span>
                            <span className={styles.statValue}>{isUpdating ? 'Updating' : 'Idle'}</span>
                            <span className={styles.statNote}>{docker.data.status.queueSize} in the queue</span>
                        </div>
                        <div className={`${styles.stat} ${containers.length > 0 ? styles.warn : styles.good}`}>
                            <span className={styles.statLabel}>Updates available</span>
                            <span className={styles.statValue}>{containers.length}</span>
                            <span className={styles.statNote}>{containers.length === 0 ? 'everything is current' : 'servers can be updated'}</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statLabel}>Maintenance window</span>
                            <span className={styles.statValue} style={{ fontSize: '1.3rem' }}>
                                {config.maintenanceWindow ? `${config.maintenanceWindow.startHour}:00 – ${config.maintenanceWindow.endHour}:00` : 'Any time'}
                            </span>
                            <span className={styles.statNote}>{config.maintenanceWindow?.timezone ?? 'UTC'}</span>
                        </div>
                    </div>

                    {isUpdating && (
                        <div className={`${styles.notice} ${styles.warning}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                            <span>An update is running.</span>
                            <button className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => void cancel()} disabled={busy}>Cancel update</button>
                        </div>
                    )}

                    <section className={`${styles.card} ${styles.flush}`}>
                        <div className={styles.cardHeader}>
                            <h2>Available updates ({containers.length})</h2>
                            <div className={styles.headerActions}>
                                {selected.size > 0 && (
                                    <button className={`${styles.btn} ${styles.small}`} disabled={busy || isUpdating} onClick={() => void update([...selected])}>Update selected ({selected.size})</button>
                                )}
                                <button className={`${styles.btn} ${styles.small} ${styles.primary}`} disabled={busy || isUpdating || containers.length === 0} onClick={() => void update(containers.map(container => container.serverId))}>
                                    {busy ? 'Working…' : 'Update all'}
                                </button>
                            </div>
                        </div>
                        {containers.length === 0 ? (
                            <div className={styles.empty}>All server images are up to date.</div>
                        ) : (
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.checkCell}><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(containers.map(container => container.serverId)))} aria-label="Select all" /></th>
                                            <th>Server</th><th>Current image</th><th>New image</th><th>Status</th><th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {containers.map(container => (
                                            <tr key={container.serverId}>
                                                <td className={styles.checkCell}><input type="checkbox" checked={selected.has(container.serverId)} onChange={() => toggle(container.serverId)} aria-label={`Select ${container.serverName}`} /></td>
                                                <td className={styles.primaryText}>{container.serverName}</td>
                                                <td className={styles.mono}>{container.currentImage}</td>
                                                <td className={styles.mono}>{container.targetImage}</td>
                                                <td><span className={styles.badge}>{container.status}</span></td>
                                                <td><div className={styles.rowActions}><button className={`${styles.btn} ${styles.small}`} disabled={busy || isUpdating} onClick={() => void update([container.serverId])}>Update</button></div></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {result && (
                        <section className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h2>Last update</h2>
                                <span className={`${styles.badge} ${result.success ? styles.ok : styles.bad}`}>{result.success ? 'Succeeded' : 'Had failures'}</span>
                            </div>
                            <dl className={styles.kv}>
                                <dt>Updated</dt><dd>{result.updatedContainers.length > 0 ? result.updatedContainers.join(', ') : 'none'}</dd>
                                {result.failedContainers.length > 0 && (<><dt>Failed</dt><dd>{result.failedContainers.join(', ')}</dd></>)}
                                {result.rollbackPerformed && (<><dt>Rollback</dt><dd>Performed</dd></>)}
                            </dl>
                            {result.errors.length > 0 && (
                                <ul className={styles.importNotes} style={{ marginTop: '0.75rem' }}>{result.errors.map(error => <li key={error}>{error}</li>)}</ul>
                            )}
                        </section>
                    )}

                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Update settings</h2></div>
                        <div className={`${styles.grid} ${styles.cols2}`}>
                            <label className={styles.field}>
                                Schedule
                                <select className={styles.select} value={config.schedule} onChange={event => void saveConfig({ schedule: event.target.value as UpdateConfig['schedule'] })}>
                                    <option value="manual">Manual only</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </label>
                            <label className={styles.field}>
                                Remove images older than (days)
                                <input className={styles.input} type="number" min={1} max={365} defaultValue={config.maxImageAge} onBlur={event => {
                                    const days = parseInt(event.target.value);
                                    if (Number.isInteger(days) && days >= 1 && days <= 365 && days !== config.maxImageAge) void saveConfig({ maxImageAge: days });
                                }} />
                            </label>
                            {([
                                ['enabled', 'Update automatically on the schedule'],
                                ['autoRestart', 'Restart servers after an update'],
                                ['cleanupOldImages', 'Remove old images afterwards'],
                                ['notifyUsers', 'Tell users before updating'],
                                ['rollbackOnFailure', 'Roll back when an update fails'],
                            ] as const).map(([key, label]) => (
                                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem' }}>
                                    <input type="checkbox" checked={Boolean(config[key])} onChange={event => void saveConfig({ [key]: event.target.checked })} disabled={busy} />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </>
    );
}
