"use client";
import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.scss';
import Link from 'next/link';
import { useRouter } from "next/navigation";
import { FaCopy, FaPlus, FaServer } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import dashboardBg from "@/public/dashboard-bg.png";

// Define servers interfaces for better type checking
interface MCServer {
    id: string;
    name: string;
    type: string;
    status: 'online' | 'offline';
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
    isOnline: 'online' | 'offline';
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
                    status: server.isOnline === 'online' ? 'online' : 'offline',
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

        const checkAuth = () => {
            const res = fetch('/api/auth/check', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            res.then(response => {
                if (!response.ok) {
                    router.push('/auth/login'); // Redirect to login if already logged in
                }
            }).catch(error => {
                console.error('Error checking authentication:', error);
            });
        }

        const interval = setInterval(() => {
            checkAuth();
            fetchServerTypes(); // Fetch server types every minute
        }, 60 * 1000); // Check every minute

        // Initial check on component mount
        checkAuth();
        fetchServerTypes();

        // Add event listener for cookies change
        window.addEventListener('cookies', checkAuth);

        return () => {
            window.removeEventListener('cookies', checkAuth);
            clearInterval(interval); // Clear the interval on component unmount
        };
    }, [router]);


    const setServerPower = async (id: string, action: 'start' | 'stop') => {
        const server = servers.find(candidate => candidate.id === id);
        if (!server || busyServerIds.has(id)) return;

        setBusyServerIds(current => new Set(current).add(id));
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
                    ? { ...candidate, status: action === 'start' ? 'online' : 'offline', players: action === 'stop' ? 0 : candidate.players }
                    : candidate
            ));
            showNotification({
                type: 'success',
                title: action === 'start' ? 'Server Started' : 'Server Stopped',
                message: `${server.name} was ${action === 'start' ? 'started' : 'stopped'}.`,
            });
        } catch (error) {
            console.error(`Error trying to ${action} server:`, error);
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
            setDeleteConfirmationInput(''); // Clear previous input
            setWantsDownload(false); // Reset download preference
        }
    };

    const handleDownloadServer = async () => {
        if (!serverToDelete) return;

        setIsDownloading(true);

        try {
            // Prepare download
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

            // Trigger download
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
            // If user wants to download first, do that before deletion
            if (wantsDownload && !isDownloading) {
                await handleDownloadServer();
            }

            setIsDeleting(true);
            setDeletionProgress(10);

            // Simulate progress updates
            const progressInterval = setInterval(() => {
                setDeletionProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return 90;
                    }
                    return prev + Math.random() * 20;
                });
            }, 400);

            try {
                // Make API call to delete the server
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
                    // Hide loading and show error
                    setIsDeleting(false);
                    showNotification({
                        type: 'error',
                        title: 'Deletion Failed',
                        message: `Failed to delete server: ${response.statusText}`
                    });
                    return;
                }

                // Show success
                setDeletionProgress(100);
                setTimeout(() => {
                    setDeletionSuccess(true);

                    // Refresh page after 5 seconds
                    setTimeout(() => {
                        window.location.reload();
                    }, 5000);
                }, 500);

                // Update local state
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

    const copyServerAddress = async (address: string) => {
        try {
            await navigator.clipboard.writeText(address);
            showNotification({ type: 'success', title: 'Copied', message: `${address} copied to your clipboard.`, duration: 2500 });
        } catch {
            showNotification({ type: 'error', title: 'Copy Failed', message: 'Could not copy the address. Select it and copy it manually.' });
        }
    };

    const onlineCount = servers.filter(server => server.status === 'online').length;

    return (
        <main className={styles.dashboard} style={{ backgroundImage: `url(${dashboardBg.src})` }}>
            <div className={styles.container} >
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.pageTitle}>Server Manager</h1>
                        {!loadingServers && servers.length > 0 && (
                            <p className={styles.summary}>
                                {servers.length} {servers.length === 1 ? 'server' : 'servers'} · {onlineCount} online
                            </p>
                        )}
                    </div>
                    <button
                        className={`${styles.button} ${styles.primary} ${styles.createButton}`}
                        onClick={() => router.push("/manager/servers/create")}
                    >
                        <FaPlus aria-hidden="true" /> Create New Server
                    </button>
                </div>

                <h2 className={styles.sectionTitle}>Your Servers</h2>
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
                        <FaServer className={styles.emptyIcon} aria-hidden="true" />
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
                        {servers.map(server => (
                            <div
                                key={server.id}
                                className={styles.serverCard}
                                onClick={() => router.push(`/manager/servers/${getServerSlug(server)}`)}
                            >
                                <div className={styles.cardClickIndicator}>
                                    <span>Click to manage →</span>
                                </div>
                                <span className={`${styles.serverStatus} ${styles[server.status]}`}>
                                    <span className={styles.statusDot} aria-hidden="true" />
                                    {server.status}
                                </span>
                                <h3 className={styles.serverName}>
                                    <Link
                                        href={`/manager/servers/${getServerSlug(server)}`}
                                        className={styles.serverLink}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {server.name}
                                    </Link>
                                </h3>
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
                                                copyServerAddress(server.subdomainName);
                                            }}
                                        >
                                            <FaCopy aria-hidden="true" />
                                        </button>
                                    )}
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
                                    {server.status === 'offline' ? (
                                        <button
                                            className={`${styles.button} ${styles.primary}`}
                                            disabled={busyServerIds.has(server.id)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartServer(server.id);
                                            }}
                                        >
                                            {busyServerIds.has(server.id) ? 'Starting…' : 'Start'}
                                        </button>
                                    ) : (
                                        <button
                                            className={`${styles.button} ${styles.secondary}`}
                                            disabled={busyServerIds.has(server.id)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStopServer(server.id);
                                            }}
                                        >
                                            {busyServerIds.has(server.id) ? 'Stopping…' : 'Stop'}
                                        </button>
                                    )}
                                    <button
                                        className={`${styles.button} ${styles.secondary}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/manager/servers/${getServerSlug(server)}`);
                                        }}
                                    >
                                        Settings
                                    </button>
                                    <button
                                        className={`${styles.button} ${styles.danger}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteServer(server.id);
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
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
                            // Confirmation State
                            <>
                                <h2 id="delete-dialog-title" className={styles.modalTitle}>⚠️ Delete Server</h2>
                                <div className={styles.modalWarning}>
                                    <p className={styles.modalText}>
                                        <strong>This action cannot be undone!</strong>
                                    </p>
                                    <p className={styles.modalText}>
                                        You are about to permanently delete the server:
                                    </p>
                                    <p className={styles.modalServerName}>
                                        &quot;{serverToDelete.name}&quot;
                                    </p>
                                    <p className={styles.modalText}>
                                        All server data, world files, and configurations will be lost forever.
                                    </p>
                                </div>

                                <div className={styles.modalConfirmation}>
                                    <p className={styles.modalPrompt}>
                                        To confirm deletion, please type the server IP address:
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
                                        placeholder="Enter server IP address"
                                        autoFocus
                                    />
                                    {deleteConfirmationInput && deleteConfirmationInput !== serverToDelete.subdomainName && (
                                        <p className={styles.errorText}>IP address does not match</p>
                                    )}
                                </div>

                                {/* Download Option */}
                                <div className={styles.downloadOption}>
                                    <h3 className={styles.downloadTitle}>📦 Backup Your Server</h3>
                                    <p className={styles.downloadDescription}>
                                        Before deleting your server, you can download a backup containing all your world files,
                                        configurations, and plugins/mods.
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
                                            {isDownloading ? 'Downloading...' : 'Download Now'}
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
                                        {isDownloading ? 'Downloading...' : 'Delete Server Forever'}
                                    </button>
                                </div>
                            </>
                        ) : !deletionSuccess ? (
                            // Deleting State
                            <>
                                <div className={styles.deletingIcon}>
                                    <div className={styles.spinner}></div>
                                </div>
                                <h2 id="delete-dialog-title" className={styles.modalTitle}>🗑️ Deleting Server</h2>
                                <p className={styles.modalText}>
                                    Please wait while we permanently delete &quot;{serverToDelete.name}&quot;...
                                </p>
                                <div className={styles.progressBar}>
                                    <div
                                        className={styles.progressFill}
                                        style={{ width: `${deletionProgress}%` }}
                                    ></div>
                                </div>
                                <p className={styles.progressText}>{Math.round(deletionProgress)}% Complete</p>
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
                            // Success State
                            <>
                                <div className={styles.successIcon}>
                                    <div className={styles.checkmark}>✓</div>
                                </div>
                                <h2 id="delete-dialog-title" className={styles.modalTitle}>Server Deleted Successfully!</h2>
                                <p className={styles.modalText}>
                                    The server &quot;{serverToDelete.name}&quot; has been permanently deleted.
                                </p>
                                <div className={styles.serverDetails}>
                                    <p><strong>Deleted Server:</strong> {serverToDelete.name}</p>
                                    <p><strong>IP Address:</strong> {serverToDelete.subdomainName}</p>
                                    <p><strong>Type:</strong> {serverToDelete.type}</p>
                                </div>
                                <p className={styles.redirectMessage}>
                                    Refreshing dashboard in 5 seconds...
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}