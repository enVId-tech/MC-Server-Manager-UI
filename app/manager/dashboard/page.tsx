"use client";
import React, { useEffect, useRef, useState } from 'react';
import styles from './dashboard.module.scss';
import Link from 'next/link';
import { useRouter } from "next/navigation";
import {
    FaArrowRight,
    FaCheck,
    FaCog,
    FaCopy,
    FaDownload,
    FaExclamationTriangle,
    FaNetworkWired,
    FaPen,
    FaPlay,
    FaPlus,
    FaSearch,
    FaServer,
    FaShieldAlt,
    FaSignal,
    FaStop,
    FaTimes,
    FaTrash,
    FaUsers,
} from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import dashboardBg from "@/public/dashboard-bg.png";

// What a server is doing: starting and stopping are shown as such instead of offline
type ServerState = 'online' | 'offline' | 'starting' | 'stopping' | 'crashed' | 'unhealthy' | 'paused';

// Define servers interfaces for better type checking
interface MCServer {
    id: string;
    name: string;
    type: string;
    status: ServerState;
    players: number;
    maxPlayers: number;
    version: string;
    subdomainName: string;
}

interface ServerConfig {
    serverName: string;
    serverType: string;
    players: number;
    maxPlayers: number;
    version: string;
    subdomainName: string;
    id: string;
    // The API reports the state as text
    isOnline: ServerState;
}

export default function Dashboard() {
    const { showNotification } = useNotifications();
    const [servers, setServers] = useState<MCServer[]>([]);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [serverToDelete, setServerToDelete] = useState<MCServer | null>(null);
    const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
    const [wantsDownload, setWantsDownload] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletionSuccess, setDeletionSuccess] = useState(false);
    const [deletionProgress, setDeletionProgress] = useState(0);
    const [loadingServers, setLoadingServers] = useState(true);
    const [section, setSection] = useState<'servers' | 'network'>('servers');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
    const [sortBy, setSortBy] = useState<'name' | 'status' | 'players'>('name');
    const [isAdmin, setIsAdmin] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [renamingServerId, setRenamingServerId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState('');
    const [savingRenameId, setSavingRenameId] = useState<string | null>(null);
    const refreshServers = useRef<() => void>(() => undefined);
    const [proxies, setProxies] = useState<Array<{ id: string; name: string; kind: string; port: number; baseSubdomain?: string; running: boolean; linkedServers: number; issues: string[] }>>([]);
    const [busyServerIds, setBusyServerIds] = useState<Set<string>>(new Set());
    const router = useRouter();

    useEffect(() => {
        // Fetch server types from the API
        const fetchServerTypes = async () => {
            try {
                const response = await fetch('/api/server', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch server types');
                }

                const data = await response.json();
                const servers: MCServer[] = data.servers.map((server: ServerConfig) => ({
                    id: server.id,
                    name: server.serverName,
                    type: server.serverType,
                    status: server.isOnline ?? 'offline',
                    players: server.players,
                    maxPlayers: server.maxPlayers,
                    version: server.version,
                    subdomainName: server.subdomainName || 'N/A',
                }));
                setServers(servers);
            } catch (error) {
                console.error('Error fetching server types:', error);
            } finally {
                setLoadingServers(false);
            }
        };

        refreshServers.current = fetchServerTypes;

        const checkAuth = () => {
            const res = fetch('/api/auth/check', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            res.then(async response => {
                if (!response.ok) {
                    router.push('/auth/login');
                    return;
                }
                const body = await response.json().catch(() => ({}));
                setIsAdmin(body.isAdmin === true);
            }).catch(error => {
                console.error('Error checking authentication:', error);
            });
        };

        const interval = setInterval(() => {
            checkAuth();
            fetchServerTypes();
        }, 60 * 1000);

        checkAuth();
        fetchServerTypes();

        window.addEventListener('cookies', checkAuth);

        return () => {
            window.removeEventListener('cookies', checkAuth);
            clearInterval(interval);
        };
    }, [router]);

    // While a server starts or stops its state changes within seconds, so look more often
    const inTransition = servers.some(server => server.status === 'starting' || server.status === 'stopping');
    useEffect(() => {
        if (!inTransition) return;
        const timer = setInterval(() => refreshServers.current(), 4000);
        return () => clearInterval(timer);
    }, [inTransition]);

    const setServerPower = async (id: string, action: 'start' | 'stop') => {
        const server = servers.find(candidate => candidate.id === id);
        if (!server || busyServerIds.has(id)) return;

        setBusyServerIds(current => new Set(current).add(id));
        setServers(current => current.map(candidate => candidate.id === id ? { ...candidate, status: action === 'start' ? 'starting' : 'stopping' } : candidate));
        try {
            const response = await fetch(`/api/server/manage/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uniqueId: id }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || `Failed to ${action} the server.`);
            }

            setServers(current => current.map(candidate =>
                candidate.id === id
                    ? { ...candidate, status: action === 'start' ? 'starting' : 'offline', players: action === 'stop' ? 0 : candidate.players }
                    : candidate
            ));
            showNotification({
                type: 'success',
                title: action === 'start' ? 'Server Started' : 'Server Stopped',
                message: `${server.name} was ${action === 'start' ? 'started' : 'stopped'}.`,
            });
        } catch (error) {
            console.error(`Error trying to ${action} server:`, error);
            refreshServers.current();
            showNotification({
                type: 'error',
                title: action === 'start' ? 'Could Not Start Server' : 'Could Not Stop Server',
                message: error instanceof Error ? error.message : `Failed to ${action} the server.`,
            });
        } finally {
            setBusyServerIds(current => {
                const next = new Set(current);
                next.delete(id);
                return next;
            });
        }
    };

    const handleStartServer = (id: string) => setServerPower(id, 'start');
    const handleStopServer = (id: string) => setServerPower(id, 'stop');

    const handleDeleteServer = (id: string) => {
        const serverToSet = servers.find(server => server.id === id);
        if (serverToSet) {
            setServerToDelete(serverToSet);
            setShowDeleteModal(true);
            setDeleteConfirmationInput('');
            setWantsDownload(false);
        }
    };

    const handleDownloadServer = async () => {
        if (!serverToDelete) return;

        setIsDownloading(true);

        try {
            const response = await fetch('/api/server/manage/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uniqueId: serverToDelete.id }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to prepare download');
            }

            const data = await response.json();
            const downloadUrl = data.downloadInfo.downloadUrl;

            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `${serverToDelete.name}-${serverToDelete.id}.tar`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            showNotification({
                type: 'success',
                title: 'Download Started',
                message: 'Your server files are being downloaded.'
            });
        } catch (error) {
            console.error('Error downloading server:', error);
            showNotification({
                type: 'error',
                title: 'Download Failed',
                message: 'Failed to download server. Please try again.'
            });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (serverToDelete && deleteConfirmationInput === serverToDelete.subdomainName) {
            if (wantsDownload && !isDownloading) {
                await handleDownloadServer();
            }

            setIsDeleting(true);
            setDeletionProgress(10);

            const progressInterval = setInterval(() => {
                // Never past 90% until the server answered: the step can overshoot, so the result is capped
                setDeletionProgress(prev => Math.min(90, prev + Math.random() * 20));
            }, 400);

            try {
                const response = await fetch('/api/server/delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        serverId: serverToDelete.id,
                        reason: 'manual-deletion'
                    }),
                });

                clearInterval(progressInterval);

                if (!response.ok) {
                    setIsDeleting(false);
                    showNotification({
                        type: 'error',
                        title: 'Deletion Failed',
                        message: `Failed to delete server: ${response.statusText}`
                    });
                    return;
                }

                setDeletionProgress(100);
                setTimeout(() => {
                    setDeletionSuccess(true);
                    setTimeout(() => {
                        window.location.reload();
                    }, 5000);
                }, 500);

                setServers(servers.filter(server => server.id !== serverToDelete.id));
            } catch (error) {
                clearInterval(progressInterval);
                setIsDeleting(false);
                console.error('Error deleting server:', error);
                showNotification({
                    type: 'error',
                    title: 'Network Error',
                    message: 'Network error occurred while deleting server. Please try again.'
                });
            }
        } else {
            showNotification({
                type: 'warning',
                title: 'Invalid Input',
                message: 'The subdomain name you entered does not match. Please try again.'
            });
        }
    };

    const handleCancelDelete = () => {
        setShowDeleteModal(false);
        setServerToDelete(null);
        setDeleteConfirmationInput('');
        setWantsDownload(false);
        setIsDownloading(false);
        setIsDeleting(false);
        setDeletionSuccess(false);
        setDeletionProgress(0);
    };

    // Let Escape close the delete dialog unless a deletion is already running
    useEffect(() => {
        if (!showDeleteModal) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !isDeleting && !isDownloading) {
                handleCancelDelete();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [showDeleteModal, isDeleting, isDownloading]);

    const formatServerType = (type: string) =>
        type ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() : 'Unknown';

    const getServerSlug = (server: MCServer) =>
        server.subdomainName && server.subdomainName !== 'N/A' ? server.subdomainName : server.id;

    const loadProxies = async () => {
        try {
            const response = await fetch('/api/admin/network');
            if (!response.ok) return;
            const body = await response.json();
            setProxies(body.proxies ?? []);
        } catch {
            // The list stays as it was
        }
    };

    const saveServerRename = async (event: React.FormEvent, server: MCServer) => {
        event.preventDefault();
        event.stopPropagation();
        if (savingRenameId) return;

        const trimmed = renameDraft.trim();
        if (!trimmed) {
            showNotification({ type: 'warning', title: 'Invalid Name', message: 'Server name cannot be empty.' });
            return;
        }
        if (trimmed === server.name) {
            setRenamingServerId(null);
            return;
        }

        setSavingRenameId(server.id);
        try {
            const response = await fetch('/api/server/info', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uniqueId: server.id, name: trimmed }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.message || 'Could not rename the server.');
            }
            const nextName = body.name ?? trimmed;
            setServers(current => current.map(item => item.id === server.id ? { ...item, name: nextName } : item));
            setRenamingServerId(null);
            showNotification({ type: 'success', title: 'Server Renamed', message: `Display name updated to "${nextName}".` });
        } catch (error) {
            showNotification({ type: 'error', title: 'Rename Failed', message: error instanceof Error ? error.message : 'Could not rename the server.' });
        } finally {
            setSavingRenameId(null);
        }
    };

    const copyServerAddress = async (serverId: string, address: string) => {
        try {
            await navigator.clipboard.writeText(address);
            setCopiedId(serverId);
            setTimeout(() => setCopiedId(current => (current === serverId ? null : current)), 1800);
            showNotification({ type: 'success', title: 'Copied', message: `${address} copied to your clipboard.`, duration: 2500 });
        } catch {
            showNotification({ type: 'error', title: 'Copy Failed', message: 'Could not copy the address. Select it and copy it manually.' });
        }
    };

    const onlineCount = servers.filter(server => server.status === 'online').length;
    const offlineCount = servers.filter(server => server.status === 'offline' || server.status === 'crashed').length;
    const playersNow = servers.reduce((sum, server) => sum + (Number(server.players) || 0), 0);
    const playerCapacity = servers.reduce((sum, server) => sum + (Number(server.maxPlayers) || 0), 0);
    const capacityPercent = playerCapacity > 0 ? Math.min(100, Math.round((playersNow / playerCapacity) * 100)) : 0;

    const visibleServers = servers
        .filter(server => (statusFilter === 'all' || server.status === statusFilter)
            && (query.trim() === '' || `${server.name} ${server.subdomainName} ${server.type} ${server.version}`.toLowerCase().includes(query.trim().toLowerCase())))
        .sort((a, b) => sortBy === 'players' ? (Number(b.players) || 0) - (Number(a.players) || 0)
            : sortBy === 'status' ? a.status.localeCompare(b.status) || a.name.localeCompare(b.name)
                : a.name.localeCompare(b.name));

    return (
        <main className={styles.dashboard} style={{ backgroundImage: `url(${dashboardBg.src})` }}>
            <div className={styles.container}>
                <header className={styles.header}>
                    <div className={styles.headerMeta}>
                        <span className={styles.eyebrow}>
                            <FaServer aria-hidden="true" /> Control Center
                        </span>
                        <h1 className={styles.pageTitle}>Server Manager</h1>
                        <p className={styles.summary}>
                            {loadingServers
                                ? 'Checking your Minecraft containers and live player counts…'
                                : servers.length === 0
                                    ? 'Deploy and manage isolated Minecraft servers in seconds.'
                                    : `${servers.length} ${servers.length === 1 ? 'server' : 'servers'} deployed · ${onlineCount} online · ${playersNow} active ${playersNow === 1 ? 'player' : 'players'}`}
                        </p>
                    </div>
                    <button
                        className={`${styles.button} ${styles.primary} ${styles.createButton}`}
                        onClick={() => router.push("/manager/servers/create")}
                    >
                        <FaPlus aria-hidden="true" /> Create New Server
                    </button>
                </header>

                <section className={styles.statRow} aria-label="Fleet summary">
                    <div className={styles.stat}>
                        <div className={styles.statTop}>
                            <span>Servers</span>
                            <span className={styles.statIcon}><FaServer aria-hidden="true" /></span>
                        </div>
                        <div className={styles.statValueRow}>
                            <strong>{servers.length}</strong>
                            <span className={styles.statSub}>{offlineCount} offline</span>
                        </div>
                    </div>

                    <div className={styles.stat}>
                        <div className={styles.statTop}>
                            <span>Online Now</span>
                            <span className={`${styles.statIcon} ${styles.onlineIcon}`}><FaSignal aria-hidden="true" /></span>
                        </div>
                        <div className={styles.statValueRow}>
                            <strong>{onlineCount}<small>/{servers.length}</small></strong>
                            <span className={styles.statSub}>{inTransition ? 'Transitioning…' : 'Healthy'}</span>
                        </div>
                    </div>

                    <div className={styles.stat}>
                        <div className={styles.statTop}>
                            <span>Players Connected</span>
                            <span className={`${styles.statIcon} ${styles.playersIcon}`}><FaUsers aria-hidden="true" /></span>
                        </div>
                        <div className={styles.statValueRow}>
                            <strong>{playersNow}<small>/{playerCapacity}</small></strong>
                            <span className={styles.statSub}>{capacityPercent}% capacity</span>
                        </div>
                        <div className={styles.statMeter} aria-hidden="true">
                            <span style={{ width: `${capacityPercent}%` }} />
                        </div>
                    </div>
                </section>

                <div className={styles.controlsBar}>
                    <nav className={styles.sectionNav} aria-label="Sections">
                        <button
                            type="button"
                            className={`${styles.sectionTab} ${section === 'servers' ? styles.sectionActive : ''}`}
                            onClick={() => setSection('servers')}
                        >
                            <FaServer aria-hidden="true" />
                            <span>Servers</span>
                            <span className={styles.tabBadge}>{servers.length}</span>
                        </button>
                        {isAdmin && (
                            <button
                                type="button"
                                className={`${styles.sectionTab} ${section === 'network' ? styles.sectionActive : ''}`}
                                onClick={() => { setSection('network'); void loadProxies(); }}
                            >
                                <FaNetworkWired aria-hidden="true" />
                                <span>Network</span>
                                {proxies.length > 0 && <span className={styles.tabBadge}>{proxies.length}</span>}
                            </button>
                        )}
                        {isAdmin && (
                            <Link href="/admin" className={styles.sectionTab}>
                                <FaShieldAlt aria-hidden="true" />
                                <span>Admin panel</span>
                            </Link>
                        )}
                    </nav>

                    {section === 'servers' && servers.length > 0 && (
                        <div className={styles.toolbar}>
                            <div className={styles.searchWrap}>
                                <FaSearch className={styles.searchIcon} aria-hidden="true" />
                                <input
                                    className={styles.search}
                                    type="search"
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    placeholder="Search by name, address, type, or version…"
                                    aria-label="Search servers"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        className={styles.clearSearch}
                                        aria-label="Clear search"
                                        onClick={() => setQuery('')}
                                    >
                                        <FaTimes aria-hidden="true" />
                                    </button>
                                )}
                            </div>

                            <div className={styles.filterPills} role="group" aria-label="Filter by status">
                                {(['all', 'online', 'offline'] as const).map(option => (
                                    <button
                                        key={option}
                                        type="button"
                                        className={`${styles.filterPill} ${statusFilter === option ? styles.filterPillActive : ''}`}
                                        onClick={() => setStatusFilter(option)}
                                    >
                                        {option === 'all' ? 'All' : option === 'online' ? 'Online' : 'Offline'}
                                    </button>
                                ))}
                            </div>

                            <label className={styles.sortWrap}>
                                <span>Sort</span>
                                <select
                                    className={styles.filter}
                                    value={sortBy}
                                    onChange={event => setSortBy(event.target.value as 'name' | 'status' | 'players')}
                                    aria-label="Sort servers"
                                >
                                    <option value="name">Name</option>
                                    <option value="status">Status</option>
                                    <option value="players">Players</option>
                                </select>
                            </label>
                        </div>
                    )}
                </div>

                {section === 'network' && isAdmin && (
                    <>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>Network Proxies</h2>
                            <span className={styles.resultCount}>{proxies.length} {proxies.length === 1 ? 'proxy' : 'proxies'}</span>
                        </div>
                        <div className={styles.serverGrid}>
                            {proxies.length === 0 && (
                                <div className={styles.emptyState}>
                                    <span className={styles.emptyIcon}><FaNetworkWired aria-hidden="true" /></span>
                                    <p className={styles.emptyTitle}>No proxies yet</p>
                                    <p>Create one from the create page (Proxy tab). Servers connect to it automatically.</p>
                                </div>
                            )}
                            {proxies.map(proxy => (
                                <div key={proxy.id} className={styles.serverCard} onClick={() => router.push('/admin#proxies')}>
                                    <div className={styles.cardTop}>
                                        <span className={`${styles.serverStatus} ${proxy.running ? styles.online : styles.offline}`}>
                                            <span className={styles.statusDot} aria-hidden="true" />
                                            {proxy.running ? 'running' : 'stopped'}
                                        </span>
                                        <span className={styles.typeChip}>{proxy.kind}</span>
                                    </div>
                                    <div className={styles.cardIdentity}>
                                        <h3 className={styles.serverName}>{proxy.name}</h3>
                                        {proxy.baseSubdomain && (
                                            <div className={styles.addressRow}>
                                                <code className={styles.address}>*.{proxy.baseSubdomain}</code>
                                            </div>
                                        )}
                                    </div>
                                    <dl className={styles.serverDetails}>
                                        <div><dt>Type</dt><dd>{proxy.kind}</dd></div>
                                        <div><dt>Port</dt><dd>{proxy.port}</dd></div>
                                        <div><dt>Servers</dt><dd>{proxy.linkedServers}</dd></div>
                                    </dl>
                                    {proxy.issues.length > 0 && <p className={styles.errorText}>{proxy.issues[0]}</p>}
                                    <div className={styles.actions}>
                                        <Link
                                            href="/admin#proxies"
                                            className={`${styles.button} ${styles.secondary}`}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <FaCog aria-hidden="true" /> Manage in Admin
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {section === 'servers' && (
                    <>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>Your Servers</h2>
                            {!loadingServers && servers.length > 0 && (
                                <span className={styles.resultCount}>
                                    Showing {visibleServers.length} of {servers.length}
                                </span>
                            )}
                        </div>

                        {loadingServers ? (
                            <div className={styles.serverGrid} aria-busy="true" aria-label="Loading servers">
                                {[0, 1, 2].map(index => (
                                    <div key={index} className={`${styles.serverCard} ${styles.skeletonCard}`} aria-hidden="true">
                                        <span className={`${styles.skeleton} ${styles.skeletonBadge}`} />
                                        <span className={`${styles.skeleton} ${styles.skeletonTitle}`} />
                                        <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
                                        <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
                                        <span className={`${styles.skeleton} ${styles.skeletonButtons}`} />
                                    </div>
                                ))}
                            </div>
                        ) : servers.length === 0 ? (
                            <div className={styles.emptyState}>
                                <span className={styles.emptyIcon}><FaServer aria-hidden="true" /></span>
                                <p className={styles.emptyTitle}>No servers yet</p>
                                <p>Create your first Minecraft server and it will show up here.</p>
                                <button
                                    className={`${styles.button} ${styles.primary} ${styles.createButton}`}
                                    onClick={() => router.push("/manager/servers/create")}
                                >
                                    <FaPlus aria-hidden="true" /> Create your first server
                                </button>
                            </div>
                        ) : (
                            <div className={styles.serverGrid}>
                                {visibleServers.length === 0 && (
                                    <div className={styles.emptyState}>
                                        <span className={styles.emptyIcon}><FaSearch aria-hidden="true" /></span>
                                        <p className={styles.emptyTitle}>No servers match</p>
                                        <p>Try clearing your search or switching the status filter.</p>
                                        <button
                                            type="button"
                                            className={`${styles.button} ${styles.secondary}`}
                                            onClick={() => { setQuery(''); setStatusFilter('all'); }}
                                        >
                                            Reset filters
                                        </button>
                                    </div>
                                )}
                                {visibleServers.map(server => (
                                    <article
                                        key={server.id}
                                        className={styles.serverCard}
                                        onClick={() => router.push(`/manager/servers/${getServerSlug(server)}`)}
                                    >
                                        <div className={styles.cardTop}>
                                            <span className={`${styles.serverStatus} ${styles[server.status]}`}>
                                                <span className={styles.statusDot} aria-hidden="true" />
                                                {server.status}
                                            </span>
                                            <div className={styles.cardTopRight}>
                                                <span className={styles.cardClickIndicator}>
                                                    Open <FaArrowRight aria-hidden="true" />
                                                </span>
                                                <span className={styles.typeChip}>{formatServerType(server.type)}</span>
                                            </div>
                                        </div>

                                        <div className={styles.cardIdentity}>
                                            {renamingServerId === server.id ? (
                                                <form
                                                    className={styles.renameForm}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onSubmit={(e) => void saveServerRename(e, server)}
                                                >
                                                    <input
                                                        className={styles.renameInput}
                                                        value={renameDraft}
                                                        maxLength={50}
                                                        aria-label={`New name for ${server.name}`}
                                                        onChange={(e) => setRenameDraft(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Escape') {
                                                                e.stopPropagation();
                                                                setRenamingServerId(null);
                                                            }
                                                        }}
                                                        autoFocus
                                                        disabled={savingRenameId === server.id}
                                                    />
                                                    <button
                                                        type="submit"
                                                        className={`${styles.button} ${styles.primary}`}
                                                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                                                        disabled={savingRenameId === server.id || !renameDraft.trim()}
                                                        aria-label="Save server name"
                                                    >
                                                        <FaCheck aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.button} ${styles.secondary}`}
                                                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
                                                        disabled={savingRenameId === server.id}
                                                        aria-label="Cancel rename"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRenamingServerId(null);
                                                        }}
                                                    >
                                                        <FaTimes aria-hidden="true" />
                                                    </button>
                                                </form>
                                            ) : (
                                                <div className={styles.serverNameRow}>
                                                    <h3 className={styles.serverName}>
                                                        <Link
                                                            href={`/manager/servers/${getServerSlug(server)}`}
                                                            className={styles.serverLink}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {server.name}
                                                        </Link>
                                                    </h3>
                                                    <button
                                                        type="button"
                                                        className={styles.renameButton}
                                                        title="Rename server"
                                                        aria-label={`Rename ${server.name}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRenamingServerId(server.id);
                                                            setRenameDraft(server.name);
                                                        }}
                                                    >
                                                        <FaPen aria-hidden="true" />
                                                    </button>
                                                </div>
                                            )}
                                            <div className={styles.addressRow}>
                                                <code className={styles.address}>{server.subdomainName || 'N/A'}</code>
                                                {server.subdomainName && server.subdomainName !== 'N/A' && (
                                                    <button
                                                        type="button"
                                                        className={styles.copyButton}
                                                        aria-label={`Copy ${server.subdomainName}`}
                                                        title="Copy server address"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void copyServerAddress(server.id, server.subdomainName);
                                                        }}
                                                    >
                                                        {copiedId === server.id ? <FaCheck aria-hidden="true" /> : <FaCopy aria-hidden="true" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <dl className={styles.serverDetails}>
                                            <div>
                                                <dt>Type</dt>
                                                <dd>{formatServerType(server.type)}</dd>
                                            </div>
                                            <div>
                                                <dt>Version</dt>
                                                <dd>{server.version}</dd>
                                            </div>
                                            <div>
                                                <dt>Players</dt>
                                                <dd>{server.players}/{server.maxPlayers}</dd>
                                            </div>
                                        </dl>

                                        <div className={styles.actions}>
                                            {server.status === 'starting' || server.status === 'stopping' ? (
                                                <button className={`${styles.button} ${styles.secondary}`} disabled onClick={(e) => e.stopPropagation()}>
                                                    {server.status === 'starting' ? 'Starting…' : 'Stopping…'}
                                                </button>
                                            ) : server.status === 'offline' || server.status === 'crashed' ? (
                                                <button
                                                    className={`${styles.button} ${styles.successBtn}`}
                                                    disabled={busyServerIds.has(server.id)}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void handleStartServer(server.id);
                                                    }}
                                                >
                                                    <FaPlay aria-hidden="true" /> {busyServerIds.has(server.id) ? 'Starting…' : 'Start'}
                                                </button>
                                            ) : (
                                                <button
                                                    className={`${styles.button} ${styles.secondary}`}
                                                    disabled={busyServerIds.has(server.id)}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void handleStopServer(server.id);
                                                    }}
                                                >
                                                    <FaStop aria-hidden="true" /> {busyServerIds.has(server.id) ? 'Stopping…' : 'Stop'}
                                                </button>
                                            )}
                                            <button
                                                className={`${styles.button} ${styles.secondary}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/manager/servers/${getServerSlug(server)}`);
                                                }}
                                            >
                                                <FaCog aria-hidden="true" /> Manage
                                            </button>
                                            <button
                                                className={`${styles.button} ${styles.danger} ${styles.deletePush}`}
                                                aria-label={`Delete ${server.name}`}
                                                title="Delete server"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteServer(server.id);
                                                }}
                                            >
                                                <FaTrash aria-hidden="true" /> Delete
                                            </button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && serverToDelete && (
                <div className={styles.modalOverlay}>
                    <div
                        className={styles.modalContent}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-dialog-title"
                    >
                        {!isDeleting && !deletionSuccess ? (
                            <>
                                <div className={styles.modalHeader}>
                                    <span className={styles.modalIcon}><FaExclamationTriangle aria-hidden="true" /></span>
                                    <h2 id="delete-dialog-title" className={styles.modalTitle}>Delete Server</h2>
                                </div>

                                <div className={styles.modalWarning}>
                                    <p className={styles.modalText}>
                                        <strong>This action cannot be undone.</strong> You are about to permanently delete:
                                    </p>
                                    <p className={styles.modalServerName}>{serverToDelete.name}</p>
                                    <p className={styles.modalText}>
                                        All server data, world files, and configurations will be removed forever.
                                    </p>
                                </div>

                                <div className={styles.modalConfirmation}>
                                    <p className={styles.modalPrompt}>
                                        To confirm deletion, type the server address:
                                    </p>
                                    <p className={styles.modalIpDisplay}>
                                        <strong>{serverToDelete.subdomainName}</strong>
                                    </p>
                                    <input
                                        type="text"
                                        className={`${styles.modalInput} ${deleteConfirmationInput && deleteConfirmationInput !== serverToDelete.subdomainName
                                            ? styles.inputError
                                            : ''
                                            }`}
                                        value={deleteConfirmationInput}
                                        onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                                        placeholder="Enter server address"
                                        autoFocus
                                    />
                                    {deleteConfirmationInput && deleteConfirmationInput !== serverToDelete.subdomainName && (
                                        <p className={styles.errorText}>Server address does not match</p>
                                    )}
                                </div>

                                <div className={styles.downloadOption}>
                                    <h3 className={styles.downloadTitle}>
                                        <FaDownload aria-hidden="true" /> Backup Before Deleting
                                    </h3>
                                    <p className={styles.downloadDescription}>
                                        Download an archive containing your world files, configurations, and plugins/mods before deletion.
                                    </p>
                                    <label className={styles.downloadCheckbox}>
                                        <input
                                            type="checkbox"
                                            checked={wantsDownload}
                                            onChange={(e) => setWantsDownload(e.target.checked)}
                                        />
                                        <span className={styles.checkboxText}>
                                            Download server backup before deletion
                                        </span>
                                    </label>
                                    {wantsDownload && (
                                        <button
                                            type="button"
                                            className={`${styles.button} ${styles.download}`}
                                            onClick={handleDownloadServer}
                                            disabled={isDownloading}
                                        >
                                            <FaDownload aria-hidden="true" /> {isDownloading ? 'Downloading…' : 'Download Now'}
                                        </button>
                                    )}
                                </div>

                                <div className={styles.modalActions}>
                                    <button
                                        className={`${styles.button} ${styles.secondary}`}
                                        onClick={handleCancelDelete}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className={`${styles.button} ${styles.danger}`}
                                        onClick={handleConfirmDelete}
                                        disabled={deleteConfirmationInput !== serverToDelete.subdomainName || (wantsDownload && isDownloading)}
                                    >
                                        <FaTrash aria-hidden="true" /> {isDownloading ? 'Downloading…' : 'Delete Server Forever'}
                                    </button>
                                </div>
                            </>
                        ) : !deletionSuccess ? (
                            <>
                                <div className={styles.deletingIcon}>
                                    <div className={styles.spinner}></div>
                                </div>
                                <h2 id="delete-dialog-title" className={styles.modalTitle} style={{ textAlign: 'center' }}>Deleting Server</h2>
                                <p className={styles.modalText} style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                                    Removing &quot;{serverToDelete.name}&quot; and its container data…
                                </p>
                                <div className={styles.progressBar}>
                                    <div
                                        className={styles.progressFill}
                                        style={{ width: `${Math.min(100, Math.max(0, deletionProgress))}%` }}
                                    ></div>
                                </div>
                                <p className={styles.progressText}>{Math.min(100, Math.max(0, Math.round(deletionProgress)))}% Complete</p>
                                <div className={styles.deletionSteps}>
                                    <div className={`${styles.step} ${deletionProgress >= 20 ? styles.completed : ''}`}>
                                        ✓ Stopping server containers
                                    </div>
                                    <div className={`${styles.step} ${deletionProgress >= 40 ? styles.completed : ''}`}>
                                        ✓ Removing server files
                                    </div>
                                    <div className={`${styles.step} ${deletionProgress >= 60 ? styles.completed : ''}`}>
                                        ✓ Removing from database
                                    </div>
                                    <div className={`${styles.step} ${deletionProgress >= 100 ? styles.completed : ''}`}>
                                        ✓ Deletion complete
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.successIcon}>
                                    <div className={styles.checkmark}><FaCheck aria-hidden="true" /></div>
                                </div>
                                <h2 id="delete-dialog-title" className={styles.modalTitle} style={{ textAlign: 'center' }}>Server Deleted</h2>
                                <p className={styles.modalText} style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                                    &quot;{serverToDelete.name}&quot; has been permanently removed.
                                </p>
                                <div className={styles.deletionSteps}>
                                    <p className={styles.modalText}><strong>Deleted Server:</strong> {serverToDelete.name}</p>
                                    <p className={styles.modalText}><strong>Address:</strong> {serverToDelete.subdomainName}</p>
                                    <p className={styles.modalText}><strong>Type:</strong> {serverToDelete.type}</p>
                                </div>
                                <p className={styles.redirectMessage}>
                                    Refreshing dashboard in 5 seconds…
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
