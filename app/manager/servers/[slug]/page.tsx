'use client';

import React, { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaArrowLeft, FaPlay, FaRedo, FaStop, FaSkull, FaDownload, FaTrash } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import ServerSettings from '@/app/_components/ServerSettings/ServerSettings';
import styles from './dashboard.module.scss';
import OverviewTab from './_components/OverviewTab';
import ConsoleTab from './_components/ConsoleTab';
import FilesTab from './_components/FilesTab';
import NetworkTab from './_components/NetworkTab';
import AdminTab from './_components/AdminTab';
import { postJson, type NetworkStatus, type ServerInfo, type ServerStats, type ServerStatus, type TabId } from './_components/types';

const EMPTY_STATS: ServerStats = {
    status: 'loading', playersOnline: 0, maxPlayers: 0, ramUsage: 0, maxRam: 0, cpuUsage: 0, networkRx: 0, networkTx: 0, recommendations: [],
};

const STATUS_BADGE: Record<ServerStatus, { label: string; tone: string }> = {
    online: { label: 'Online', tone: styles.ok },
    offline: { label: 'Offline', tone: styles.bad },
    starting: { label: 'Starting', tone: styles.warn },
    crashed: { label: 'Crashed', tone: styles.bad },
    paused: { label: 'Paused', tone: styles.warn },
    unhealthy: { label: 'Unhealthy', tone: styles.warn },
    loading: { label: 'Checking', tone: '' },
};

export default function ServerDashboard({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params);
    const router = useRouter();
    const { showNotification, showConfirmDialog } = useNotifications();

    const [info, setInfo] = useState<ServerInfo | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [stats, setStats] = useState<ServerStats>(EMPTY_STATS);
    const [network, setNetwork] = useState<NetworkStatus | null>(null);
    const [tab, setTab] = useState<TabId>('overview');
    const [busy, setBusy] = useState<string | null>(null);

    const isProxy = info?.kind === 'proxy';

    // What the server is. A missing or foreign server ends here with a message instead of an empty dashboard
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const response = await fetch(`/api/server/info?server=${encodeURIComponent(slug)}`);
            const data = await response.json().catch(() => ({}));
            // Not signed in: the API answers 'User not found.'
            if (response.status === 401 || data.message === 'User not found.') {
                router.push('/auth/login');
                return;
            }
            if (cancelled) return;
            if (!response.ok) setLoadError(data.message ?? 'The server could not be loaded.');
            else setInfo(data as ServerInfo);
        })();
        return () => { cancelled = true; };
    }, [slug, router]);

    const loadStats = useCallback(async () => {
        if (!info) return;
        try {
            const response = await fetch(`/api/server/status?uniqueId=${encodeURIComponent(info.uniqueId)}&includeResources=true`);
            if (!response.ok) throw new Error('status');
            const data = await response.json();
            const resources = data.resources ?? {};
            setStats({
                status: (data.status as ServerStatus) ?? 'offline',
                playersOnline: resources.playersOnline ?? 0,
                maxPlayers: resources.maxPlayers ?? 0,
                ramUsage: resources.memoryUsage ?? 0,
                maxRam: resources.memoryLimit ?? 0,
                cpuUsage: Math.round(resources.cpuUsage ?? 0),
                networkRx: resources.networkRx ?? 0,
                networkTx: resources.networkTx ?? 0,
                recommendations: resources.recommendations ?? [],
                error: resources.error,
            });
        } catch {
            setStats(previous => ({ ...previous, status: 'offline' }));
        }
    }, [info]);

    const loadNetwork = useCallback(async () => {
        if (!info || isProxy) return;
        try {
            const response = await fetch(`/api/server/network?uniqueId=${encodeURIComponent(info.uniqueId)}`);
            if (response.ok) setNetwork(await response.json());
        } catch {
            // The tab shows what it has
        }
    }, [info, isProxy]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the server is known and then keeps polling
        void loadStats();
        void loadNetwork();
        const timer = setInterval(() => void loadStats(), 10000);
        return () => clearInterval(timer);
    }, [loadStats, loadNetwork]);

    const power = async (action: 'start' | 'stop' | 'restart' | 'kill') => {
        if (!info) return;
        setBusy(action);
        setStats(previous => ({ ...previous, status: 'loading' }));
        const { ok, body } = await postJson(`/api/server/manage/${action}`, { uniqueId: info.uniqueId });
        setBusy(null);
        showNotification({ type: ok ? 'success' : 'error', title: ok ? 'Done' : 'Failed', message: body.message ?? (ok ? `${action} sent.` : 'The action failed.') });
        setTimeout(() => void loadStats(), 1500);
    };

    const download = async () => {
        if (!info) return;
        const { ok, body } = await postJson('/api/server/manage/download', { uniqueId: info.uniqueId });
        showNotification({ type: ok ? 'success' : 'error', title: ok ? 'Backup' : 'Backup failed', message: body.message ?? (ok ? 'The backup is ready.' : 'It could not be prepared.') });
    };

    const remove = () => {
        if (!info) return;
        showConfirmDialog({
            title: `Delete ${info.name}`,
            message: isProxy
                ? 'The proxy is removed and every server behind it is taken out of its configuration. This cannot be undone.'
                : 'The container, its entry in the proxies and all of its data are removed. This cannot be undone.',
            confirmText: 'Delete forever',
            cancelText: 'Cancel',
            variant: 'danger',
            requireText: slug,
            requireTextPrompt: 'To confirm, type the server address:',
            onConfirm: async () => {
                const { ok, body } = await postJson('/api/server/delete', { serverId: info.uniqueId, reason: 'manual-deletion' }, 'DELETE');
                showNotification({ type: ok ? 'success' : 'error', title: ok ? 'Deleted' : 'Delete failed', message: body.message ?? '' });
                if (ok) router.push(info.isAdmin && isProxy ? '/admin#proxies' : '/manager/dashboard');
            },
        });
    };

    const tabs = useMemo(() => {
        const list: Array<{ id: TabId; label: string; dot?: boolean }> = [
            { id: 'overview', label: 'Overview' },
            { id: 'console', label: 'Console' },
            { id: 'files', label: 'Files' },
        ];
        if (!isProxy) {
            list.push({ id: 'settings', label: 'Settings' });
            list.push({ id: 'network', label: 'Network', dot: (network?.warnings.length ?? 0) > 0 });
        }
        if (info?.isAdmin && !isProxy) list.push({ id: 'admin', label: 'Updates' });
        return list;
    }, [info, isProxy, network]);

    if (loadError) {
        return (
            <div className={styles.page}><div className={styles.shell}>
                <button className={styles.back} onClick={() => router.push('/manager/dashboard')}><FaArrowLeft /> Back to your servers</button>
                <div className={`${styles.notice} ${styles.error}`}>{loadError}</div>
            </div></div>
        );
    }
    if (!info) return <div className={styles.page}><div className={styles.shell}><div className={styles.loading}>Loading…</div></div></div>;

    const badge = STATUS_BADGE[stats.status];
    const running = stats.status === 'online' || stats.status === 'starting' || stats.status === 'paused' || stats.status === 'unhealthy';

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <header className={styles.header}>
                    <div>
                        <button className={styles.back} onClick={() => router.push(info.isAdmin && isProxy ? '/admin#proxies' : '/manager/dashboard')}>
                            <FaArrowLeft /> {isProxy ? 'Back to proxies' : 'Back to your servers'}
                        </button>
                        <h1 className={styles.title}>
                            {info.name}
                            <span className={`${styles.badge} ${badge.tone}`}>{badge.label}</span>
                            {isProxy && <span className={`${styles.badge} ${styles.info}`}>{info.proxy?.type} proxy</span>}
                            <small>{slug}</small>
                        </h1>
                    </div>
                    <div className={styles.power}>
                        <button className={`${styles.btn} ${styles.primary}`} disabled={busy !== null || running} onClick={() => void power('start')}><FaPlay /> Start</button>
                        <button className={styles.btn} disabled={busy !== null || !running} onClick={() => void power('restart')}><FaRedo /> Restart</button>
                        <button className={styles.btn} disabled={busy !== null || !running} onClick={() => void power('stop')}><FaStop /> Stop</button>
                        <button className={`${styles.btn} ${styles.danger}`} disabled={busy !== null || !running} onClick={() => void power('kill')}><FaSkull /> Kill</button>
                        {!isProxy && <button className={styles.btn} onClick={() => void download()}><FaDownload /> Backup</button>}
                        <button className={`${styles.btn} ${styles.danger}`} onClick={remove}><FaTrash /> Delete</button>
                    </div>
                </header>

                {isProxy && (
                    <div className={`${styles.notice} ${styles.info}`}>
                        This is a proxy. Its forwarding, plugins, image and the servers behind it are managed in the admin panel; the files tab opens its configuration.
                    </div>
                )}

                <nav className={styles.tabs} role="tablist" aria-label="Server sections">
                    {tabs.map(item => (
                        <button key={item.id} role="tab" aria-selected={tab === item.id} className={`${styles.tab} ${tab === item.id ? styles.active : ''}`} onClick={() => setTab(item.id)}>
                            {item.label}
                            {item.dot && <span className={styles.tabDot} aria-label="has a warning" />}
                        </button>
                    ))}
                </nav>

                <main>
                    {tab === 'overview' && <OverviewTab info={info} stats={stats} network={network} onOpenNetwork={() => setTab('network')} />}
                    {tab === 'console' && <ConsoleTab uniqueId={info.uniqueId} status={stats.status} />}
                    {tab === 'files' && <FilesTab slug={slug} uniqueId={info.uniqueId} version={info.version} />}
                    {tab === 'settings' && !isProxy && <ServerSettings serverSlug={slug} />}
                    {tab === 'network' && !isProxy && <NetworkTab info={info} network={network} onChanged={() => void loadNetwork()} />}
                    {tab === 'admin' && info.isAdmin && <AdminTab info={info} onChanged={() => void loadStats()} />}
                </main>
            </div>
        </div>
    );
}
