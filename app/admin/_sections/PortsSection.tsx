'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../admin.module.scss';
import { adminSend, useAdminData } from './shared';

interface PortsData {
    report: {
        totalPorts: number;
        usedPorts: number;
        availablePorts: number;
        importantPorts: number;
        containerUsedPorts: number[];
        databaseUsedPorts: number[];
        importantPortsList: number[];
    };
    usersWithReservations: Array<{
        email: string;
        reservedPorts?: number[];
        reservedPortRanges?: Array<{ start: number; end: number; description?: string }>;
    }>;
}

interface PortCheck {
    port: number;
    available: boolean;
    reason?: string;
    conflictType?: string;
}

function PortChips({ ports, empty }: { ports: number[]; empty: string }) {
    if (ports.length === 0) return <span className={styles.mutedText}>{empty}</span>;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {[...ports].sort((a, b) => a - b).map(port => <span key={port} className={`${styles.badge} ${styles.mono}`}>{port}</span>)}
        </div>
    );
}

export default function PortsSection() {
    const { showNotification } = useNotifications();
    const ports = useAdminData<PortsData>('/api/admin/ports/manage');
    const [portInput, setPortInput] = useState('');
    const [check, setCheck] = useState<PortCheck | null>(null);
    const [checking, setChecking] = useState(false);
    const [reserveEmail, setReserveEmail] = useState('');
    const [reservePort, setReservePort] = useState('');

    const checkPort = async (event: React.FormEvent) => {
        event.preventDefault();
        const port = Number(portInput);
        if (!Number.isInteger(port) || port < 1024 || port > 65535) {
            showNotification({ type: 'error', title: 'Port', message: 'Enter a port between 1024 and 65535.' });
            return;
        }
        setChecking(true);
        try {
            const response = await fetch(`/api/admin/ports/manage?port=${port}`);
            const body = await response.json();
            if (!response.ok) throw new Error(body.message || body.error || 'The check failed');
            setCheck(body as PortCheck);
        } catch (caught) {
            showNotification({ type: 'error', title: 'Port check', message: caught instanceof Error ? caught.message : 'The check failed' });
        } finally {
            setChecking(false);
        }
    };

    const reserve = async (event: React.FormEvent) => {
        event.preventDefault();
        const port = Number(reservePort);
        if (!reserveEmail.trim() || !Number.isInteger(port)) {
            showNotification({ type: 'error', title: 'Reserve a port', message: 'Enter the user email and a port number.' });
            return;
        }
        const { ok, body } = await adminSend('/api/admin/ports/manage', 'POST', { targetUserEmail: reserveEmail.trim(), ports: [port], action: 'add' });
        showNotification({ type: ok ? 'success' : 'error', title: 'Reserve a port', message: body.message || body.error || (ok ? 'Reserved.' : 'Failed.') });
        if (ok) {
            setReservePort('');
            await ports.reload();
        }
    };

    const release = async (email: string, port: number) => {
        const { ok, body } = await adminSend('/api/admin/ports/manage', 'POST', { targetUserEmail: email, ports: [port], action: 'remove' });
        showNotification({ type: ok ? 'success' : 'error', title: 'Release a port', message: body.message || body.error || (ok ? 'Released.' : 'Failed.') });
        if (ok) await ports.reload();
    };

    const report = ports.data?.report;
    const usePercent = report && report.totalPorts > 0 ? Math.round((report.usedPorts / report.totalPorts) * 100) : 0;

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1>Ports</h1>
                    <p>Game ports are handed out from a range. The manager also checks the network, so a port that something else uses is skipped.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void ports.reload()} disabled={ports.loading}>Refresh</button>
                </div>
            </div>

            {ports.error && <div className={`${styles.notice} ${styles.error}`}>{ports.error}</div>}

            {report && (
                <>
                    <div className={`${styles.grid} ${styles.stats}`}>
                        <div className={styles.stat}><span className={styles.statLabel}>In range</span><span className={styles.statValue}>{report.totalPorts}</span></div>
                        <div className={`${styles.stat} ${usePercent > 85 ? styles.bad : usePercent > 65 ? styles.warn : ''}`}><span className={styles.statLabel}>Used</span><span className={styles.statValue}>{report.usedPorts}</span><span className={styles.statNote}>{usePercent}% of the range</span></div>
                        <div className={`${styles.stat} ${styles.good}`}><span className={styles.statLabel}>Free</span><span className={styles.statValue}>{report.availablePorts}</span></div>
                        <div className={styles.stat}><span className={styles.statLabel}>Protected</span><span className={styles.statValue}>{report.importantPorts}</span><span className={styles.statNote}>never handed out</span></div>
                    </div>

                    <div className={`${styles.grid} ${styles.cols2}`}>
                        <section className={styles.card}>
                            <div className={styles.cardHeader}><h2>Check a port</h2></div>
                            <form onSubmit={checkPort} style={{ display: 'flex', gap: '0.5rem' }}>
                                <input className={styles.input} style={{ flex: 1 }} inputMode="numeric" value={portInput} onChange={event => setPortInput(event.target.value)} placeholder="25570" aria-label="Port to check" />
                                <button className={`${styles.btn} ${styles.primary}`} type="submit" disabled={checking}>{checking ? 'Checking…' : 'Check'}</button>
                            </form>
                            {check && (
                                <div className={`${styles.notice} ${check.available ? styles.success : styles.error}`} style={{ marginTop: '0.75rem' }}>
                                    Port {check.port} is {check.available ? 'free' : 'not available'}{check.reason ? `: ${check.reason}` : ''}
                                </div>
                            )}
                        </section>

                        <section className={styles.card}>
                            <div className={styles.cardHeader}><h2>Reserve a port for a user</h2></div>
                            <form onSubmit={reserve} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <input className={styles.input} style={{ flex: '2 1 160px' }} value={reserveEmail} onChange={event => setReserveEmail(event.target.value)} placeholder="user@example.com" aria-label="User email" />
                                <input className={styles.input} style={{ flex: '1 1 90px' }} inputMode="numeric" value={reservePort} onChange={event => setReservePort(event.target.value)} placeholder="Port" aria-label="Port to reserve" />
                                <button className={styles.btn} type="submit">Reserve</button>
                            </form>
                        </section>
                    </div>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Where ports are used</h2></div>
                        <dl className={styles.kv}>
                            <dt>Containers</dt>
                            <dd><PortChips ports={report.containerUsedPorts} empty="none" /></dd>
                            <dt>Dashboard records</dt>
                            <dd><PortChips ports={report.databaseUsedPorts} empty="none" /></dd>
                            <dt>Protected</dt>
                            <dd><PortChips ports={report.importantPortsList} empty="none" /></dd>
                        </dl>
                    </section>

                    <section className={`${styles.card} ${styles.flush}`}>
                        <div className={styles.cardHeader}><h2>Reservations</h2></div>
                        {ports.data!.usersWithReservations.length === 0 ? (
                            <div className={styles.empty}>No user has reserved ports.</div>
                        ) : (
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead><tr><th>User</th><th>Ports</th><th>Ranges</th></tr></thead>
                                    <tbody>
                                        {ports.data!.usersWithReservations.map(user => (
                                            <tr key={user.email}>
                                                <td className={styles.primaryText}>{user.email}</td>
                                                <td>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                        {(user.reservedPorts ?? []).map(port => (
                                                            <button key={port} className={`${styles.badge} ${styles.mono}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => void release(user.email, port)} title="Release this port">{port} ✕</button>
                                                        ))}
                                                        {(user.reservedPorts ?? []).length === 0 && <span className={styles.mutedText}>none</span>}
                                                    </div>
                                                </td>
                                                <td className={styles.mono}>{(user.reservedPortRanges ?? []).map(range => `${range.start}–${range.end}`).join(', ') || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}

            {ports.loading && !report && <div className={styles.loading}><span className={styles.spinner} /> Reading ports…</div>}
        </>
    );
}
