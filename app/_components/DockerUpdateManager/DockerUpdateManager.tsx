/**
 * Docker Update Manager Component
 * 
 * Admin interface for managing Docker image updates:
 * - View current update status and configuration
 * - Trigger manual updates
 * - Configure automatic update schedules
 * - View update history and logs
 */

'use client';

import React, { useState, useEffect } from 'react';
import styles from './DockerUpdateManager.module.scss';

interface UpdateStatus {
    config: {
        enabled: boolean;
        schedule: 'daily' | 'weekly' | 'monthly' | 'manual';
        maintenanceWindow?: {
            startHour: number;
            endHour: number;
            timezone: string;
        };
        autoRestart: boolean;
        cleanupOldImages: boolean;
        maxImageAge: number;
        notifyUsers: boolean;
        rollbackOnFailure: boolean;
    };
    isUpdating: boolean;
    queueSize: number;
}

interface UpdateCheck {
    updatesAvailable: boolean;
    containers: Array<{
        serverId: string;
        serverName: string;
        containerName: string;
        currentImage: string;
        targetImage: string;
        status: string;
    }>;
}

interface UpdateResult {
    success: boolean;
    updatedContainers: string[];
    failedContainers: string[];
    cleanedImages: string[];
    errors: string[];
    rollbackPerformed: boolean;
    details: string[];
}

export default function DockerUpdateManager() {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [lastResult, setLastResult] = useState<UpdateResult | null>(null);
    const [selectedServers, setSelectedServers] = useState<string[]>([]);
    const [showConfig, setShowConfig] = useState(false);

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/admin/docker-updates');
            const data = await response.json();

            if (data.success) {
                setStatus(data.status);
                setUpdateCheck(data.updateCheck);
            } else {
                console.error('Failed to fetch status:', data.error);
            }
        } catch (error) {
            console.error('Error fetching status:', error);
        } finally {
            setLoading(false);
        }
    };

    const triggerManualUpdate = async (serverIds?: string[]) => {
        try {
            setUpdating(true);
            const response = await fetch('/api/admin/docker-updates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'manual-update',
                    serverIds: serverIds || selectedServers
                })
            });

            const data = await response.json();
            setLastResult(data.result);
            
            if (data.success) {
                await fetchStatus(); // Refresh status
            }
        } catch (error) {
            console.error('Error triggering update:', error);
        } finally {
            setUpdating(false);
        }
    };

    const updateConfig = async (newConfig: Partial<UpdateStatus['config']>) => {
        try {
            const response = await fetch('/api/admin/docker-updates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'update-config',
                    config: newConfig
                })
            });

            const data = await response.json();
            
            if (data.success) {
                await fetchStatus(); // Refresh status
            }
        } catch (error) {
            console.error('Error updating config:', error);
        }
    };

    const checkForUpdates = async () => {
        try {
            const response = await fetch('/api/admin/docker-updates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'check-updates'
                })
            });

            const data = await response.json();
            
            if (data.success) {
                setUpdateCheck(data.updateCheck);
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
        }
    };

    const cancelUpdate = async () => {
        try {
            const response = await fetch('/api/admin/docker-updates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'cancel-update'
                })
            });

            const data = await response.json();
            
            if (data.success) {
                await fetchStatus(); // Refresh status
            }
        } catch (error) {
            console.error('Error cancelling update:', error);
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    <p>Loading Docker update status...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Docker Update Manager</h1>
                <div className={styles.headerActions}>
                    <button
                        className={styles.refreshBtn}
                        onClick={fetchStatus}
                        disabled={loading}
                    >
                        🔄 Refresh
                    </button>
                    <button
                        className={styles.configBtn}
                        onClick={() => setShowConfig(!showConfig)}
                    >
                        ⚙️ Configure
                    </button>
                </div>
            </div>

            {/* Status Overview */}
            <div className={styles.statusGrid}>
                <div className={`${styles.statusCard} ${status?.config.enabled ? styles.enabled : styles.disabled}`}>
                    <h3>🔄 Auto Updates</h3>
                    <p className={styles.statusValue}>
                        {status?.config.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                    <p className={styles.statusDetail}>
                        Schedule: {status?.config.schedule || 'Manual'}
                    </p>
                </div>

                <div className={`${styles.statusCard} ${status?.isUpdating ? styles.updating : ''}`}>
                    <h3>📊 Current Status</h3>
                    <p className={styles.statusValue}>
                        {status?.isUpdating ? 'Updating...' : 'Idle'}
                    </p>
                    <p className={styles.statusDetail}>
                        Queue: {status?.queueSize || 0} servers
                    </p>
                </div>

                <div className={styles.statusCard}>
                    <h3>🔍 Available Updates</h3>
                    <p className={styles.statusValue}>
                        {updateCheck?.containers.length || 0}
                    </p>
                    <p className={styles.statusDetail}>
                        Servers need updating
                    </p>
                </div>

                <div className={styles.statusCard}>
                    <h3>🕒 Maintenance Window</h3>
                    <p className={styles.statusValue}>
                        {status?.config.maintenanceWindow ? 
                            `${status.config.maintenanceWindow.startHour}:00 - ${status.config.maintenanceWindow.endHour}:00` :
                            'Not configured'
                        }
                    </p>
                    <p className={styles.statusDetail}>
                        {status?.config.maintenanceWindow?.timezone || 'UTC'}
                    </p>
                </div>
            </div>

            {/* Configuration Panel */}
            {showConfig && (
                <div className={styles.configPanel}>
                    <h2>Update Configuration</h2>
                    <div className={styles.configGrid}>
                        <div className={styles.configGroup}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={status?.config.enabled || false}
                                    onChange={(e) => updateConfig({ enabled: e.target.checked })}
                                />
                                Enable automatic updates
                            </label>
                        </div>

                        <div className={styles.configGroup}>
                            <label>Update Schedule:</label>
                            <select
                                value={status?.config.schedule || 'manual'}
                                onChange={(e) => updateConfig({ schedule: e.target.value as 'manual' | 'daily' | 'weekly' | 'monthly' })}
                            >
                                <option value="manual">Manual only</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>

                        <div className={styles.configGroup}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={status?.config.autoRestart || false}
                                    onChange={(e) => updateConfig({ autoRestart: e.target.checked })}
                                />
                                Auto-restart servers after update
                            </label>
                        </div>

                        <div className={styles.configGroup}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={status?.config.cleanupOldImages || false}
                                    onChange={(e) => updateConfig({ cleanupOldImages: e.target.checked })}
                                />
                                Cleanup old images
                            </label>
                        </div>

                        <div className={styles.configGroup}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={status?.config.notifyUsers || false}
                                    onChange={(e) => updateConfig({ notifyUsers: e.target.checked })}
                                />
                                Notify users before updates
                            </label>
                        </div>

                        <div className={styles.configGroup}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={status?.config.rollbackOnFailure || false}
                                    onChange={(e) => updateConfig({ rollbackOnFailure: e.target.checked })}
                                />
                                Rollback on failure
                            </label>
                        </div>

                        <div className={styles.configGroup}>
                            <label>Max image age (days):</label>
                            <input
                                type="number"
                                value={status?.config.maxImageAge || 30}
                                onChange={(e) => updateConfig({ maxImageAge: parseInt(e.target.value) })}
                                min="1"
                                max="365"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Available Updates */}
            {updateCheck && updateCheck.containers.length > 0 && (
                <div className={styles.updatesSection}>
                    <div className={styles.sectionHeader}>
                        <h2>Available Updates ({updateCheck.containers.length})</h2>
                        <div className={styles.updateActions}>
                            <button
                                className={styles.checkBtn}
                                onClick={checkForUpdates}
                            >
                                🔍 Check for Updates
                            </button>
                            <button
                                className={styles.updateBtn}
                                onClick={() => triggerManualUpdate()}
                                disabled={updating || status?.isUpdating}
                            >
                                {updating ? '⏳ Updating...' : '🚀 Update All'}
                            </button>
                        </div>
                    </div>

                    <div className={styles.serversTable}>
                        <div className={styles.tableHeader}>
                            <input
                                type="checkbox"
                                checked={selectedServers.length === updateCheck.containers.length}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSelectedServers(updateCheck.containers.map(c => c.serverId));
                                    } else {
                                        setSelectedServers([]);
                                    }
                                }}
                            />
                            <span>Server Name</span>
                            <span>Current Image</span>
                            <span>Target Image</span>
                            <span>Status</span>
                            <span>Actions</span>
                        </div>

                        {updateCheck.containers.map((container) => (
                            <div key={container.serverId} className={styles.tableRow}>
                                <input
                                    type="checkbox"
                                    checked={selectedServers.includes(container.serverId)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedServers([...selectedServers, container.serverId]);
                                        } else {
                                            setSelectedServers(selectedServers.filter(id => id !== container.serverId));
                                        }
                                    }}
                                />
                                <span className={styles.serverName}>{container.serverName}</span>
                                <span className={styles.imageTag}>{container.currentImage}</span>
                                <span className={styles.imageTag}>{container.targetImage}</span>
                                <span className={`${styles.status} ${styles[container.status]}`}>
                                    {container.status}
                                </span>
                                <button
                                    className={styles.updateSingleBtn}
                                    onClick={() => triggerManualUpdate([container.serverId])}
                                    disabled={updating || status?.isUpdating}
                                >
                                    Update
                                </button>
                            </div>
                        ))}
                    </div>

                    {selectedServers.length > 0 && (
                        <div className={styles.bulkActions}>
                            <button
                                className={styles.updateSelectedBtn}
                                onClick={() => triggerManualUpdate(selectedServers)}
                                disabled={updating || status?.isUpdating}
                            >
                                Update Selected ({selectedServers.length})
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Update in Progress */}
            {status?.isUpdating && (
                <div className={styles.updateProgress}>
                    <div className={styles.progressHeader}>
                        <h3>🔄 Update in Progress</h3>
                        <button
                            className={styles.cancelBtn}
                            onClick={cancelUpdate}
                        >
                            ❌ Cancel Update
                        </button>
                    </div>
                    <div className={styles.progressInfo}>
                        <p>Queue: {status.queueSize} servers remaining</p>
                        <div className={styles.progressBar}>
                            <div className={styles.progressFill}></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Last Update Result */}
            {lastResult && (
                <div className={`${styles.resultPanel} ${lastResult.success ? styles.success : styles.error}`}>
                    <h3>🔧 Last Update Result</h3>
                    <div className={styles.resultStats}>
                        <span>✅ Updated: {lastResult.updatedContainers.length}</span>
                        <span>❌ Failed: {lastResult.failedContainers.length}</span>
                        <span>🗑️ Cleaned: {lastResult.cleanedImages.length}</span>
                        {lastResult.rollbackPerformed && <span>↩️ Rollback: Yes</span>}
                    </div>
                    
                    {lastResult.details.length > 0 && (
                        <div className={styles.resultDetails}>
                            <h4>Details:</h4>
                            <ul>
                                {lastResult.details.map((detail, index) => (
                                    <li key={index}>{detail}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {lastResult.errors.length > 0 && (
                        <div className={styles.resultErrors}>
                            <h4>Errors:</h4>
                            <ul>
                                {lastResult.errors.map((error, index) => (
                                    <li key={index} className={styles.error}>{error}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
