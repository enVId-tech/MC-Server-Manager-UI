'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../admin.module.scss';
import ImportPanel from './ImportPanel';
import { adminSend } from './shared';

interface AdminServer {
    uniqueId: string;
    serverName: string;
    email: string;
    subdomainName?: string;
    isOnline?: boolean;
    port?: number;
    imported?: boolean;
    containerName?: string;
    serverConfig?: { serverType?: string; version?: string };
    createdAt: string;
    containerStatus?: { state?: string } | null;
    user?: { isActive: boolean } | null;
}

interface Pagination {
    page: number;
    totalPages: number;
    totalServers: number;
}

type BulkAction = 'start' | 'stop' | 'restart' | 'delete';

function statusOf(server: AdminServer): string {
    return server.containerStatus?.state || (server.isOnline ? 'running' : 'stopped');
}

function statusClass(status: string): string {
    switch (status.toLowerCase()) {
        case 'running': return styles.ok;
        case 'restarting':
        case 'starting':
        case 'paused': return styles.warn;
        case 'dead':
        case 'error': return styles.bad;
        default: return '';
    }
}

export default function ServersSection() {
    const { showNotification, showConfirmDialog } = useNotifications();
    const [servers, setServers] = useState<AdminServer[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, totalServers: 0 });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [owner, setOwner] = useState('');
    const [ownerTerm, setOwnerTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), limit: '20' });
            if (searchTerm) params.set('search', searchTerm);
            if (ownerTerm) params.set('userEmail', ownerTerm);
            const response = await fetch(`/api/admin/servers?${params}`);
            const body = await response.json();
            if (!response.ok) throw new Error(body.message || body.error || 'Failed to load servers');
            setServers(body.servers);
            setPagination({ page: body.pagination.page, totalPages: Math.max(1, body.pagination.totalPages), totalServers: body.pagination.totalServers });
            setError(null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to load servers');
        } finally {
            setLoading(false);
        }
    }, [page, searchTerm, ownerTerm]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the page or a filter changes
        void load();
    }, [load]);

    // Typing in the filters waits a moment so every keystroke is not a request
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchTerm(search.trim());
            setOwnerTerm(owner.trim());
            setPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [search, owner]);

    const run = async (action: BulkAction, ids: string[]) => {
        if (ids.length === 0) return;
        setBusy(true);
        const { ok, body } = await adminSend<{ summary?: { successful: number; failed: number }; results?: Array<{ serverName?: string; success: boolean; error?: string }> }>(
            '/api/admin/servers', 'POST', { action: `bulk-${action}`, serverIds: ids }
        );
        setBusy(false);

        const failed = body.results?.filter(result => !result.success) ?? [];
        showNotification({
            type: ok && failed.length === 0 ? 'success' : 'error',
            title: ok && failed.length === 0 ? 'Done' : 'Some actions failed',
            message: failed.length > 0
                ? failed.map(result => `${result.serverName ?? 'server'}: ${result.error ?? 'failed'}`).join('\n')
                : `${action} finished for ${ids.length} server${ids.length === 1 ? '' : 's'}.`,
        });
        setSelected(new Set());
        await load();
    };

    const confirmDelete = (ids: string[]) => {
        const importedCount = servers.filter(server => ids.includes(server.uniqueId) && server.imported).length;
        showConfirmDialog({
            title: 'Delete servers',
            message: `Delete ${ids.length} server${ids.length === 1 ? '' : 's'}? Containers and dashboard entries are removed.${importedCount > 0 ? ` The files of ${importedCount} imported server${importedCount === 1 ? '' : 's'} stay where they are.` : ''} This cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger',
            requireText: 'delete',
            requireTextPrompt: 'To confirm, type the word:',
            onConfirm: () => void run('delete', ids),
        });
    };

    const allSelected = servers.length > 0 && selected.size === servers.length;
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(servers.map(server => server.uniqueId)));
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
                    <h1>Servers</h1>
                    <p>Every server on this installation, whoever owns it.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void load()} disabled={loading}>Refresh</button>
                </div>
            </div>

            <ImportPanel onImported={() => void load()} />

            <section className={`${styles.card} ${styles.flush}`}>
                <div className={styles.cardHeader}>
                    <h2>All servers ({pagination.totalServers})</h2>
                </div>

                <div className={styles.toolbar}>
                    <label className={`${styles.field} ${styles.grow}`}>
                        Search
                        <input className={styles.input} value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, address or id" />
                    </label>
                    <label className={`${styles.field} ${styles.grow}`}>
                        Owner
                        <input className={styles.input} value={owner} onChange={event => setOwner(event.target.value)} placeholder="Email" />
                    </label>
                </div>

                {selected.size > 0 && (
                    <div className={styles.bulkBar}>
                        <strong>{selected.size} selected</strong>
                        <button className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => void run('start', [...selected])}>Start</button>
                        <button className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => void run('stop', [...selected])}>Stop</button>
                        <button className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => void run('restart', [...selected])}>Restart</button>
                        <button className={`${styles.btn} ${styles.small} ${styles.danger}`} disabled={busy} onClick={() => confirmDelete([...selected])}>Delete</button>
                    </div>
                )}

                {error && <div className={`${styles.notice} ${styles.error}`} style={{ margin: '1rem 1.25rem' }}>{error}</div>}

                {loading && servers.length === 0 ? (
                    <div className={styles.loading}><span className={styles.spinner} /> Loading servers…</div>
                ) : servers.length === 0 ? (
                    <div className={styles.empty}>No servers match.</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.checkCell}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all servers" /></th>
                                    <th>Server</th>
                                    <th>Owner</th>
                                    <th>Type</th>
                                    <th>Port</th>
                                    <th>Status</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {servers.map(server => {
                                    const status = statusOf(server);
                                    const running = status.toLowerCase() === 'running';
                                    return (
                                        <tr key={server.uniqueId}>
                                            <td className={styles.checkCell}>
                                                <input type="checkbox" checked={selected.has(server.uniqueId)} onChange={() => toggle(server.uniqueId)} aria-label={`Select ${server.serverName}`} />
                                            </td>
                                            <td>
                                                <div className={styles.primaryText}>
                                                    {server.serverName}{' '}
                                                    {server.imported && <span className={`${styles.badge} ${styles.info}`}>imported</span>}
                                                </div>
                                                <div className={styles.mutedText}>{server.subdomainName ?? 'no address'}</div>
                                            </td>
                                            <td>
                                                <div>{server.email}</div>
                                                {server.user && !server.user.isActive && <span className={`${styles.badge} ${styles.warn}`}>deactivated</span>}
                                            </td>
                                            <td>
                                                <div>{server.serverConfig?.serverType ?? 'unknown'}</div>
                                                <div className={styles.mutedText}>{server.serverConfig?.version ?? ''}</div>
                                            </td>
                                            <td className={`${styles.mono} ${styles.nowrap}`}>{server.port ?? '—'}</td>
                                            <td><span className={`${styles.badge} ${statusClass(status)}`}><span className={`${styles.dot} ${running ? styles.ok : ''}`} />{status}</span></td>
                                            <td>
                                                <div className={styles.rowActions}>
                                                    <button className={`${styles.btn} ${styles.small}`} disabled={busy || running} onClick={() => void run('start', [server.uniqueId])}>Start</button>
                                                    <button className={`${styles.btn} ${styles.small}`} disabled={busy || !running} onClick={() => void run('stop', [server.uniqueId])}>Stop</button>
                                                    <button className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => void run('restart', [server.uniqueId])}>Restart</button>
                                                    <Link className={`${styles.btn} ${styles.small}`} href={`/manager/servers/${encodeURIComponent(server.subdomainName ?? server.uniqueId)}`}>Open</Link>
                                                    <button className={`${styles.btn} ${styles.small} ${styles.danger}`} disabled={busy} onClick={() => confirmDelete([server.uniqueId])}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {pagination.totalPages > 1 && (
                    <div className={styles.pagination}>
                        <button className={`${styles.btn} ${styles.small}`} onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1 || loading}>Previous</button>
                        <span>Page {pagination.page} of {pagination.totalPages}</span>
                        <button className={`${styles.btn} ${styles.small}`} onClick={() => setPage(current => Math.min(pagination.totalPages, current + 1))} disabled={page === pagination.totalPages || loading}>Next</button>
                    </div>
                )}
            </section>
        </>
    );
}
