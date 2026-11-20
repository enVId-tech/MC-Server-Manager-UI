'use client';

import React from 'react';
import styles from '../admin.module.scss';
import { useAdminData } from './shared';

interface SystemStatus {
    counts: { servers: number; imported: number; users: number; pendingUsers: number };
    portainer: { connected: boolean; host?: string; environments?: number; error?: string };
    database: { connected: boolean };
    storage: { backend: 'local' | 'webdav'; path?: string };
}

interface ServerStats {
    stats?: { totalServers: number; onlineServers: number; offlineServers: number };
}

interface VelocityStatus {
    active: { configPath: string; source: string; containerName?: string } | null;
    config: { servers: Record<string, { address: string }> } | null;
}

interface PortReport {
    report?: { totalPorts: number; usedPorts: number; availablePorts: number };
}

export default function OverviewSection({ onNavigate }: { onNavigate: (section: string) => void }) {
    const system = useAdminData<SystemStatus>('/api/admin/system');
    const servers = useAdminData<ServerStats>('/api/admin/servers?limit=100');
    const velocity = useAdminData<VelocityStatus>('/api/admin/velocity');
    const ports = useAdminData<PortReport>('/api/admin/ports/manage');

    const loading = system.loading || servers.loading || velocity.loading || ports.loading;
    const reloadAll = () => Promise.all([system.reload(), servers.reload(), velocity.reload(), ports.reload()]);

    const stats = servers.data?.stats;
    const portReport = ports.data?.report;
    const proxiedServers = velocity.data?.config ? Object.keys(velocity.data.config.servers).length : 0;
    const portUse = portReport && portReport.totalPorts > 0 ? Math.round((portReport.usedPorts / portReport.totalPorts) * 100) : 0;

    const problems: string[] = [];
    if (system.data && !system.data.database.connected) problems.push('The database is not connected.');
    if (system.data && !system.data.portainer.connected) problems.push(`Portainer is not reachable${system.data.portainer.error ? `: ${system.data.portainer.error}` : '.'}`);
    if (velocity.data && !velocity.data.active) problems.push('No Velocity instance was found. Servers cannot be added to a proxy until one exists.');
    if (system.data && system.data.counts.pendingUsers > 0) problems.push(`${system.data.counts.pendingUsers} account${system.data.counts.pendingUsers === 1 ? ' is' : 's are'} waiting for approval.`);

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1>Overview</h1>
                    <p>The state of your servers, proxy and infrastructure at a glance.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void reloadAll()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
                </div>
            </div>

            {problems.length > 0 && (
                <div className={`${styles.notice} ${styles.warning}`}>
                    <strong>Needs attention</strong>
                    <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                        {problems.map(problem => <li key={problem}>{problem}</li>)}
                    </ul>
                </div>
            )}

            <div className={`${styles.grid} ${styles.stats}`}>
                <div className={`${styles.stat} ${stats && stats.onlineServers > 0 ? styles.good : ''}`}>
                    <span className={styles.statLabel}>Servers running</span>
                    <span className={styles.statValue}>{stats ? `${stats.onlineServers} / ${stats.totalServers}` : '—'}</span>
                    <span className={styles.statNote}>{system.data ? `${system.data.counts.imported} imported` : ' '}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Users</span>
                    <span className={styles.statValue}>{system.data?.counts.users ?? '—'}</span>
                    <span className={styles.statNote}>{system.data?.counts.pendingUsers ? `${system.data.counts.pendingUsers} pending` : 'none pending'}</span>
                </div>
                <div className={`${styles.stat} ${velocity.data?.active ? styles.good : styles.bad}`}>
                    <span className={styles.statLabel}>Velocity</span>
                    <span className={styles.statValue}>{velocity.data ? (velocity.data.active ? 'Found' : 'Missing') : '—'}</span>
                    <span className={styles.statNote}>{velocity.data?.active ? `${proxiedServers} server${proxiedServers === 1 ? '' : 's'} registered` : 'no velocity.toml'}</span>
                </div>
                <div className={`${styles.stat} ${portUse > 85 ? styles.bad : portUse > 65 ? styles.warn : ''}`}>
                    <span className={styles.statLabel}>Ports in use</span>
                    <span className={styles.statValue}>{portReport ? `${portUse}%` : '—'}</span>
                    <span className={styles.statNote}>{portReport ? `${portReport.availablePorts} free of ${portReport.totalPorts}` : ' '}</span>
                </div>
            </div>

            <div className={`${styles.grid} ${styles.cols2}`}>
                <section className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2>Infrastructure</h2>
                    </div>
                    <ul className={styles.list}>
                        <li>
                            <span>Database</span>
                            <span className={`${styles.badge} ${system.data?.database.connected ? styles.ok : styles.bad}`}>{system.data?.database.connected ? 'Connected' : 'Offline'}</span>
                        </li>
                        <li>
                            <span>Portainer{system.data?.portainer.host ? ` (${system.data.portainer.host})` : ''}</span>
                            <span className={`${styles.badge} ${system.data?.portainer.connected ? styles.ok : styles.bad}`}>
                                {system.data?.portainer.connected ? `${system.data.portainer.environments ?? 0} environment${system.data.portainer.environments === 1 ? '' : 's'}` : 'Unreachable'}
                            </span>
                        </li>
                        <li>
                            <span>Server files</span>
                            <span className={`${styles.badge} ${styles.info}`}>{system.data?.storage.backend === 'webdav' ? 'WebDAV' : 'Local folder'}</span>
                        </li>
                        <li>
                            <span>Velocity config</span>
                            <span className={styles.mono}>{velocity.data?.active?.configPath ?? 'not found'}</span>
                        </li>
                    </ul>
                </section>

                <section className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2>Quick actions</h2>
                    </div>
                    <ul className={styles.list}>
                        <li>
                            <span>Add servers that already exist on this machine</span>
                            <button className={`${styles.btn} ${styles.small}`} onClick={() => onNavigate('servers')}>Import</button>
                        </li>
                        <li>
                            <span>Check the Velocity proxy and reload it</span>
                            <button className={`${styles.btn} ${styles.small}`} onClick={() => onNavigate('velocity')}>Open</button>
                        </li>
                        <li>
                            <span>Approve new accounts</span>
                            <button className={`${styles.btn} ${styles.small}`} onClick={() => onNavigate('users')}>Users</button>
                        </li>
                        <li>
                            <span>Update server images</span>
                            <button className={`${styles.btn} ${styles.small}`} onClick={() => onNavigate('docker')}>Docker</button>
                        </li>
                    </ul>
                </section>
            </div>

            {portReport && (
                <section className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div>
                            <h2>Port range</h2>
                            <p className={styles.hint}>Game ports handed out to servers</p>
                        </div>
                        <span className={styles.mutedText}>{portReport.usedPorts} of {portReport.totalPorts} used</span>
                    </div>
                    <div className={styles.meter} role="progressbar" aria-valuenow={portUse} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: `${portUse}%` }} />
                    </div>
                </section>
            )}
        </>
    );
}
