'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../admin.module.scss';
import { adminSend, useAdminData } from './shared';

interface Instance {
    configPath: string;
    folder: string;
    source: 'env' | 'docker' | 'scan';
    containerName?: string;
}

interface VelocityData {
    active: Instance | null;
    others: Instance[];
    config: {
        bind: string;
        motd: string;
        forwardingMode: string;
        onlineMode: boolean;
        servers: Record<string, { address: string }>;
        tryOrder: string[];
        forcedHosts: Record<string, string[]>;
    } | null;
    configError?: string;
}

interface ProxiesData {
    proxies: Array<{
        id: string;
        name: string;
        host: string;
        port: number;
        type: string;
        status: { running: boolean; state?: string };
        healthStatus: string;
    }>;
}

const SOURCE_LABEL: Record<Instance['source'], string> = {
    env: 'VELOCITY_CONFIG_PATH',
    docker: 'Running container',
    scan: 'Found in a folder',
};

export default function VelocitySection() {
    const { showNotification } = useNotifications();
    const velocity = useAdminData<VelocityData>('/api/admin/velocity');
    const proxies = useAdminData<ProxiesData>('/api/admin/proxies');
    const [busy, setBusy] = useState<'reload' | 'rescan' | 'sync' | null>(null);

    const act = async (action: 'reload' | 'rescan') => {
        setBusy(action);
        const { ok, body } = await adminSend<{ details?: string[] }>('/api/admin/velocity', 'POST', { action });
        setBusy(null);
        showNotification({
            type: ok ? 'success' : 'error',
            title: action === 'reload' ? 'Reload' : 'Search',
            message: [body.message, ...(body.details ?? [])].filter(Boolean).join('\n'),
        });
        await Promise.all([velocity.reload(), proxies.reload()]);
    };

    const sync = async () => {
        setBusy('sync');
        const { ok, body } = await adminSend<{ details?: string[] }>('/api/admin/sync-proxies', 'POST');
        setBusy(null);
        showNotification({
            type: ok ? 'success' : 'error',
            title: 'Proxy sync',
            message: ok ? 'Proxies and servers are in sync.' : body.message || 'The sync failed.',
        });
        await Promise.all([velocity.reload(), proxies.reload()]);
    };

    const config = velocity.data?.config;
    const active = velocity.data?.active;
    const serverEntries = config ? Object.entries(config.servers) : [];
    const forcedHosts = config ? Object.entries(config.forcedHosts) : [];

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1>Velocity</h1>
                    <p>The proxy that players connect through. An existing Velocity instance is always the one that gets changed.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void act('rescan')} disabled={busy !== null}>{busy === 'rescan' ? 'Searching…' : 'Search again'}</button>
                    <button className={`${styles.btn} ${styles.primary}`} onClick={() => void act('reload')} disabled={busy !== null || !active}>
                        {busy === 'reload' ? 'Reloading…' : 'Reload without kicking players'}
                    </button>
                </div>
            </div>

            {velocity.error && <div className={`${styles.notice} ${styles.error}`}>{velocity.error}</div>}

            {velocity.loading && !velocity.data ? (
                <div className={styles.loading}><span className={styles.spinner} /> Looking for Velocity…</div>
            ) : !active ? (
                <div className={`${styles.card} ${styles.empty}`}>
                    No Velocity instance was found in the storage folder, in the import folders or among the running containers.
                    <br />
                    Put its folder in <span className={styles.mono}>IMPORT_SCAN_PATHS</span> or set <span className={styles.mono}>VELOCITY_CONFIG_PATH</span>.
                </div>
            ) : (
                <>
                    <section className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2>Active instance</h2>
                            <span className={`${styles.badge} ${styles.ok}`}>{SOURCE_LABEL[active.source]}</span>
                        </div>
                        <dl className={styles.kv}>
                            <dt>Configuration file</dt>
                            <dd className={styles.mono}>{active.configPath}</dd>
                            {active.containerName && (<><dt>Container</dt><dd>{active.containerName}</dd></>)}
                            {config && (
                                <>
                                    <dt>Listening on</dt>
                                    <dd className={styles.mono}>{config.bind}</dd>
                                    <dt>Forwarding</dt>
                                    <dd>{config.forwardingMode}</dd>
                                    <dt>Online mode</dt>
                                    <dd>{config.onlineMode ? 'On' : 'Off'}</dd>
                                    <dt>Try order</dt>
                                    <dd>{config.tryOrder.length > 0 ? config.tryOrder.join(' → ') : 'none'}</dd>
                                </>
                            )}
                        </dl>
                        {velocity.data?.configError && <div className={`${styles.notice} ${styles.error}`} style={{ marginTop: '1rem' }}>{velocity.data.configError}</div>}
                        {velocity.data && velocity.data.others.length > 0 && (
                            <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: '1rem' }}>
                                More velocity.toml files exist and are ignored:
                                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                                    {velocity.data.others.map(other => <li key={other.configPath} className={styles.mono}>{other.configPath}</li>)}
                                </ul>
                            </div>
                        )}
                    </section>

                    <section className={`${styles.card} ${styles.flush}`}>
                        <div className={styles.cardHeader}>
                            <h2>Registered servers ({serverEntries.length})</h2>
                        </div>
                        {serverEntries.length === 0 ? (
                            <div className={styles.empty}>No servers are registered yet.</div>
                        ) : (
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead><tr><th>Name</th><th>Backend address</th><th>Hostnames</th></tr></thead>
                                    <tbody>
                                        {serverEntries.map(([name, entry]) => (
                                            <tr key={name}>
                                                <td className={styles.primaryText}>{name}</td>
                                                <td className={styles.mono}>{entry.address}</td>
                                                <td>
                                                    {forcedHosts.filter(([, targets]) => targets.includes(name)).map(([host]) => (
                                                        <div key={host} className={styles.mono}>{host}</div>
                                                    ))}
                                                    {forcedHosts.every(([, targets]) => !targets.includes(name)) && <span className={styles.mutedText}>none</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}

            <section className={`${styles.card} ${styles.flush}`}>
                <div className={styles.cardHeader}>
                    <div>
                        <h2>Proxies defined for this manager</h2>
                        <p className={styles.hint}>From proxies.yaml. A proxy is never created while another Velocity already exists.</p>
                    </div>
                    <button className={styles.btn} onClick={() => void sync()} disabled={busy !== null}>{busy === 'sync' ? 'Syncing…' : 'Sync'}</button>
                </div>
                {!proxies.data || proxies.data.proxies.length === 0 ? (
                    <div className={styles.empty}>{proxies.error ?? 'No proxies are defined.'}</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead><tr><th>Name</th><th>Type</th><th>Container</th><th>Port</th><th>State</th></tr></thead>
                            <tbody>
                                {proxies.data.proxies.map(proxy => (
                                    <tr key={proxy.id}>
                                        <td className={styles.primaryText}>{proxy.name}</td>
                                        <td>{proxy.type}</td>
                                        <td className={styles.mono}>{proxy.host}</td>
                                        <td className={styles.mono}>{proxy.port}</td>
                                        <td><span className={`${styles.badge} ${proxy.status.running ? styles.ok : styles.bad}`}>{proxy.status.running ? 'running' : proxy.status.state ?? 'not found'}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}
