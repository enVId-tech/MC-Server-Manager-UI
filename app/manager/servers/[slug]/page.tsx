'use client';

import React, { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    FaArchive,
    FaArrowLeft,
    FaChartPie,
    FaCheck,
    FaDownload,
    FaFolderOpen,
    FaGlobe,
    FaMicrochip,
    FaNetworkWired,
    FaPen,
    FaPlay,
    FaPuzzlePiece,
    FaRedo,
    FaSkull,
    FaSlidersH,
    FaStop,
    FaSyncAlt,
    FaTerminal,
    FaTimes,
    FaTrash,
    FaUsers,
} from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import ServerSettings from '@/app/_components/ServerSettings/ServerSettings';
import styles from './dashboard.module.scss';
import OverviewTab from './_components/OverviewTab';
import BackupsTab from './_components/BackupsTab';
import ConsoleTab from './_components/ConsoleTab';
import FilesTab from './_components/FilesTab';
import NetworkTab from './_components/NetworkTab';
import AdminTab from './_components/AdminTab';
import AddonManager from '@/app/_components/AddonManager/AddonManager';
import WorldUpload from '@/app/_components/WorldUpload/WorldUpload';
import { postJson, type NetworkStatus, type ServerInfo, type ServerStats, type ServerStatus, type TabId } from './_components/types';

const EMPTY_STATS: ServerStats = {
    status: 'loading', playersOnline: 0, maxPlayers: 0, ramUsage: 0, maxRam: 0, cpuUsage: 0, networkRx: 0, networkTx: 0, recommendations: [],
};

const STATUS_BADGE: Record<ServerStatus, { label: string; tone: string }> = {
    online: { label: 'Online', tone: styles.ok },
    offline: { label: 'Offline', tone: styles.bad },
    starting: { label: 'Starting', tone: styles.warn },
    stopping: { label: 'Stopping', tone: styles.warn },
    crashed: { label: 'Crashed', tone: styles.bad },
    paused: { label: 'Paused', tone: styles.warn },
    unhealthy: { label: 'Unhealthy', tone: styles.warn },
    loading: { label: 'Checking', tone: '' },
};

const TAB_ICONS: Record<TabId, React.ReactNode> = {
    overview: <FaChartPie aria-hidden="true" />,
    console: <FaTerminal aria-hidden="true" />,
    files: <FaFolderOpen aria-hidden="true" />,
    backups: <FaArchive aria-hidden="true" />,
    addons: <FaPuzzlePiece aria-hidden="true" />,
    world: <FaGlobe aria-hidden="true" />,
    settings: <FaSlidersH aria-hidden="true" />,
    network: <FaNetworkWired aria-hidden="true" />,
    admin: <FaSyncAlt aria-hidden="true" />,
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
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [savingName, setSavingName] = useState(false);

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

    // Starting and stopping change within seconds, so look more often until it settles
    const changing = stats.status === 'starting' || stats.status === 'stopping';
    useEffect(() => {
        if (!changing) return;
        const timer = setInterval(() => void loadStats(), 3000);
        return () => clearInterval(timer);
    }, [changing, loadStats]);

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
        if (ok && typeof body.downloadUrl === 'string') {
            const link = document.createElement('a');
            link.href = body.downloadUrl;
            link.download = '';
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    };

    const saveRename = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!info || savingName) return;
        const trimmed = nameDraft.trim();
        if (!trimmed) {
            showNotification({ type: 'warning', title: 'Invalid name', message: 'Server name cannot be empty.' });
            return;
        }
        if (trimmed === info.name) {
            setRenaming(false);
            return;
        }
        setSavingName(true);
        const { ok, body } = await postJson<{ name?: string }>('/api/server/info', { uniqueId: info.uniqueId, name: trimmed }, 'PATCH');
        setSavingName(false);
        if (!ok) {
            showNotification({ type: 'error', title: 'Rename failed', message: body.message ?? 'Could not rename the server.' });
            return;
        }
        const nextName = body.name ?? trimmed;
        setInfo(previous => previous ? { ...previous, name: nextName } : previous);
        setRenaming(false);
        showNotification({ type: 'success', title: 'Server renamed', message: `Display name updated to "${nextName}".` });
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
            list.push({ id: 'backups', label: 'Backups' });
            list.push({ id: 'addons', label: 'Plugins & mods' });
            list.push({ id: 'world', label: 'World' });
            list.push({ id: 'settings', label: 'Settings' });
            list.push({ id: 'network', label: 'Network', dot: (network?.warnings.length ?? 0) > 0 });
        }
        if (info?.isAdmin && !isProxy) list.push({ id: 'admin', label: 'Updates' });
        return list;
    }, [info, isProxy, network]);

    if (loadError) {
        return (
            <div className={styles.page}><div className={styles.shell}>
                <button className={styles.back} onClick={() => router.push('/manager/dashboard')}><FaArrowLeft aria-hidden="true" /> Back to your servers</button>
                <div className={`${styles.notice} ${styles.error}`}>{loadError}</div>
            </div></div>
        );
    }
    if (!info) {
        return (
            <div className={styles.page}>
                <div className={styles.shell}>
                    <div className={styles.card}>
                        <div className={styles.loading}>Loading server control panel…</div>
                    </div>
                </div>
            </div>
        );
    }

    const badge = STATUS_BADGE[stats.status];
    const running = stats.status === 'online' || stats.status === 'starting' || stats.status === 'stopping' || stats.status === 'paused' || stats.status === 'unhealthy';
    const ramPct = stats.maxRam > 0 ? Math.min(100, Math.round((stats.ramUsage / stats.maxRam) * 100)) : 0;

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <header className={styles.header}>
                    <div className={styles.headerMain}>
                        <button className={styles.back} onClick={() => router.push(info.isAdmin && isProxy ? '/admin#proxies' : '/manager/dashboard')}>
                            <FaArrowLeft aria-hidden="true" /> {isProxy ? 'Back to proxies' : 'Back to your servers'}
                        </button>
                        <div className={styles.title}>
                            {renaming ? (
                                <form className={styles.renameForm} onSubmit={saveRename}>
                                    <input
                                        className={styles.renameInput}
                                        value={nameDraft}
                                        maxLength={50}
                                        onChange={event => setNameDraft(event.target.value)}
                                        onKeyDown={event => { if (event.key === 'Escape') setRenaming(false); }}
                                        aria-label="Server name"
                                        autoFocus
                                        disabled={savingName}
                                    />
                                    <button type="submit" className={`${styles.btn} ${styles.small} ${styles.primary}`} disabled={savingName || !nameDraft.trim()} aria-label="Save server name">
                                        <FaCheck aria-hidden="true" /> Save
                                    </button>
                                    <button type="button" className={`${styles.btn} ${styles.small}`} disabled={savingName} onClick={() => setRenaming(false)} aria-label="Cancel rename">
                                        <FaTimes aria-hidden="true" />
                                    </button>
                                </form>
                            ) : (
                                <>
                                    <h1 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit' }}>{info.name}</h1>
                                    <button
                                        type="button"
                                        className={styles.renameTrigger}
                                        title="Rename server"
                                        aria-label="Rename server"
                                        onClick={() => { setNameDraft(info.name); setRenaming(true); }}
                                    >
                                        <FaPen aria-hidden="true" />
                                    </button>
                                </>
                            )}
                            <span className={`${styles.badge} ${badge.tone}`}>
                                <span className={styles.statusDot} aria-hidden="true" />
                                {badge.label}
                            </span>
                            {isProxy && <span className={`${styles.badge} ${styles.info}`}>{info.proxy?.type} proxy</span>}
                            <small>{slug}</small>
                        </div>
                        <div className={styles.headerMetaRow}>
                            {info.serverType && (
                                <span className={styles.metaPill}>
                                    Type: <strong>{info.serverType}{info.version ? ` ${info.version}` : ''}</strong>
                                </span>
                            )}
                            <span className={styles.metaPill}>
                                <FaUsers aria-hidden="true" /> <strong>{stats.playersOnline}/{stats.maxPlayers}</strong> players
                            </span>
                            <span className={styles.metaPill}>
                                <FaMicrochip aria-hidden="true" /> CPU <strong>{stats.cpuUsage}%</strong> · RAM <strong>{ramPct}%</strong>
                            </span>
                        </div>
                    </div>
                    <div className={styles.power}>
                        <div className={styles.powerGroup}>
                            <button className={`${styles.btn} ${styles.success}`} disabled={busy !== null || running} onClick={() => void power('start')}>
                                <FaPlay aria-hidden="true" /> Start
                            </button>
                            <button className={styles.btn} disabled={busy !== null || !running} onClick={() => void power('restart')}>
                                <FaRedo aria-hidden="true" /> Restart
                            </button>
                            <button className={styles.btn} disabled={busy !== null || !running} onClick={() => void power('stop')}>
                                <FaStop aria-hidden="true" /> Stop
                            </button>
                            <button className={`${styles.btn} ${styles.danger}`} disabled={busy !== null || !running} onClick={() => void power('kill')}>
                                <FaSkull aria-hidden="true" /> Kill
                            </button>
                        </div>
                        <span className={styles.powerDivider} aria-hidden="true" />
                        <div className={styles.powerGroup}>
                            {!isProxy && (
                                <button className={styles.btn} onClick={() => void download()}>
                                    <FaDownload aria-hidden="true" /> Backup
                                </button>
                            )}
                            <button className={`${styles.btn} ${styles.danger}`} onClick={remove}>
                                <FaTrash aria-hidden="true" /> Delete
                            </button>
                        </div>
                    </div>
                </header>

                {info.startGuard && (
                    <div className={`${styles.notice} ${styles.error}`}>
                        <span>
                            This server was stopped after {info.startGuard.failures} failed starts in a row, so it does not keep restarting. Check the console and the settings, then start it again.
                            {info.startGuard.lastLog && <pre className={styles.mono} style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0' }}>{info.startGuard.lastLog}</pre>}
                        </span>
                    </div>
                )}

                {isProxy && (
                    <div className={`${styles.notice} ${styles.info}`}>
                        This is a proxy. Its forwarding, plugins, image and the servers behind it are managed in the admin panel; the files tab opens its configuration.
                    </div>
                )}

                <nav className={styles.tabs} role="tablist" aria-label="Server sections">
                    {tabs.map(item => (
                        <button
                            key={item.id}
                            role="tab"
                            aria-selected={tab === item.id}
                            className={`${styles.tab} ${tab === item.id ? styles.active : ''}`}
                            onClick={() => setTab(item.id)}
                        >
                            {TAB_ICONS[item.id]}
                            <span>{item.label}</span>
                            {item.dot && <span className={styles.tabDot} aria-label="has a warning" />}
                        </button>
                    ))}
                </nav>

                <main>
                    {tab === 'overview' && <OverviewTab info={info} stats={stats} network={network} onOpenNetwork={() => setTab('network')} />}
                    {tab === 'console' && <ConsoleTab uniqueId={info.uniqueId} status={stats.status} kind={info.kind} serverType={info.serverType} version={info.version} />}
                    {tab === 'files' && <FilesTab slug={slug} uniqueId={info.uniqueId} version={info.version} />}
                    {tab === 'backups' && !isProxy && <BackupsTab uniqueId={info.uniqueId} />}
                    {tab === 'addons' && !isProxy && <div className={styles.card}><AddonManager uniqueId={info.uniqueId} /></div>}
                    {tab === 'world' && !isProxy && (
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h2><span className={styles.cardIcon}><FaGlobe aria-hidden="true" /></span> World</h2>
                            </div>
                            <WorldUpload uniqueId={info.uniqueId} version={info.version} running={running} />
                        </div>
                    )}
                    {tab === 'settings' && !isProxy && <ServerSettings serverSlug={slug} />}
                    {tab === 'network' && !isProxy && <NetworkTab info={info} network={network} onChanged={() => void loadNetwork()} />}
                    {tab === 'admin' && info.isAdmin && <AdminTab info={info} onChanged={() => void loadStats()} />}
                </main>
            </div>
        </div>
    );
}
