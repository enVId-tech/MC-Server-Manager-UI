'use client';

import React from 'react';
import styles from '../admin.module.scss';
import { useAdminData } from './shared';

interface SystemStatus {
    counts: { servers: number; imported: number; users: number; pendingUsers: number };
    portainer: { connected: boolean; host?: string; environments?: number; error?: string };
    database: { connected: boolean };
    storage: {
        backend: 'local' | 'webdav';
        path?: string;
        hostPath: string | null;
        importFolders: Array<{ appPath: string; hostPath: string }>;
    };
    settings: {
        serverDomain: string;
        containerUser: string;
        containerDns: string | null;
        velocityReloadFallback: string;
        velocityConfigPath: string | null;
        deleteServerFolders: boolean;
    };
    runtime: { node: string; uptimeSeconds: number };
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ');
}

export default function SettingsSection() {
    const system = useAdminData<SystemStatus>('/api/admin/system');
    const data = system.data;

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1>Settings</h1>
                    <p>How this installation is set up. These values come from environment variables, so they are changed in the .env file or the container configuration.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void system.reload()} disabled={system.loading}>Refresh</button>
                </div>
            </div>

            {system.error && <div className={`${styles.notice} ${styles.error}`}>{system.error}</div>}
            {system.loading && !data && <div className={styles.loading}><span className={styles.spinner} /> Reading settings…</div>}

            {data && (
                <>
                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Server files</h2></div>
                        <dl className={styles.kv}>
                            <dt>Storage</dt>
                            <dd>{data.storage.backend === 'local' ? 'A folder on this machine' : 'A WebDAV server'}</dd>
                            <dt>{data.storage.backend === 'local' ? 'Folder (LOCAL_STORAGE_PATH)' : 'Base path'}</dt>
                            <dd className={styles.mono}>{data.storage.path ?? '—'}</dd>
                            {data.storage.hostPath && (<><dt>Same folder for Docker</dt><dd className={styles.mono}>{data.storage.hostPath}</dd></>)}
                            <dt>Delete folders with servers</dt>
                            <dd>{data.settings.deleteServerFolders ? 'Yes' : 'No, they are renamed instead'}</dd>
                        </dl>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div>
                                <h2>Import folders</h2>
                                <p className={styles.hint}>Servers and a Velocity proxy in these folders are found and can be managed. Set IMPORT_SCAN_PATHS, with <span className={styles.mono}>app=host</span> when Docker sees a folder under another path.</p>
                            </div>
                        </div>
                        {data.storage.importFolders.length === 0 ? (
                            <div className={styles.mutedText}>None. Only the storage folder is searched.</div>
                        ) : (
                            <ul className={styles.list}>
                                {data.storage.importFolders.map(folder => (
                                    <li key={folder.appPath}>
                                        <span className={styles.mono}>{folder.appPath}</span>
                                        <span className={styles.mutedText}>Docker: <span className={styles.mono}>{folder.hostPath}</span></span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Containers and network</h2></div>
                        <dl className={styles.kv}>
                            <dt>Server domain</dt>
                            <dd className={styles.mono}>{data.settings.serverDomain}</dd>
                            <dt>Containers run as</dt>
                            <dd className={styles.mono}>{data.settings.containerUser} <span className={styles.mutedText}>(CONTAINER_UID, CONTAINER_GID)</span></dd>
                            <dt>Container DNS</dt>
                            <dd className={styles.mono}>{data.settings.containerDns ?? 'Docker default'}</dd>
                            <dt>Portainer</dt>
                            <dd>
                                <span className={`${styles.badge} ${data.portainer.connected ? styles.ok : styles.bad}`}>{data.portainer.connected ? 'Connected' : 'Unreachable'}</span>{' '}
                                <span className={styles.mutedText}>{data.portainer.host}</span>
                            </dd>
                        </dl>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Velocity</h2></div>
                        <dl className={styles.kv}>
                            <dt>Configuration file</dt>
                            <dd className={styles.mono}>{data.settings.velocityConfigPath ?? 'Found automatically'}</dd>
                            <dt>If a reload fails</dt>
                            <dd>{data.settings.velocityReloadFallback === 'restart' ? 'Restart Velocity (players are disconnected)' : 'Leave it until the next restart'} <span className={styles.mutedText}>(VELOCITY_RELOAD_FALLBACK)</span></dd>
                        </dl>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Application</h2></div>
                        <dl className={styles.kv}>
                            <dt>Node.js</dt>
                            <dd className={styles.mono}>{data.runtime.node}</dd>
                            <dt>Running for</dt>
                            <dd>{formatUptime(data.runtime.uptimeSeconds)}</dd>
                            <dt>Database</dt>
                            <dd><span className={`${styles.badge} ${data.database.connected ? styles.ok : styles.bad}`}>{data.database.connected ? 'Connected' : 'Offline'}</span></dd>
                        </dl>
                    </section>
                </>
            )}
        </>
    );
}
