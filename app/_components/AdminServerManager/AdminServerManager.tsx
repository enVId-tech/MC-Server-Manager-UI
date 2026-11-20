'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './AdminServerManager.module.scss';

interface Server {
  _id: string;
  uniqueId: string;
  serverName: string;
  email: string;
  subdomainName?: string;
  isOnline?: boolean;
  port?: number;
  serverConfig?: {
    serverType?: string;
    version?: string;
  };
  createdAt: string;
  // Live state from Portainer; missing when the container could not be queried
  containerStatus?: { state?: string; status?: string } | null;
  user?: { email: string; isActive: boolean; maxServers: number } | null;
}

interface ServersResponse {
  servers: Server[];
  pagination: {
    page: number;
    limit: number;
    totalServers: number;
    totalPages: number;
  };
}

interface BulkActionResult {
  success: boolean;
  results: Array<{
    serverId: string;
    serverName?: string;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export default function AdminServerManager() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalServers, setTotalServers] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkActionResult, setBulkActionResult] = useState<BulkActionResult | null>(null);

  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...(searchQuery && { search: searchQuery }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(userFilter && { userEmail: userFilter })
      });

      const response = await fetch(`/api/admin/servers?${queryParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load servers: ${response.statusText}`);
      }

      const data: ServersResponse = await response.json();
      setServers(data.servers);
      setTotalPages(Math.max(1, data.pagination.totalPages));
      setTotalServers(data.pagination.totalServers);
    } catch (error) {
      console.error('Error loading servers:', error);
      setError(error instanceof Error ? error.message : 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, statusFilter, userFilter]);

  const performServerAction = async (action: 'start' | 'stop' | 'restart' | 'delete', serverIds: string[]) => {
    if (serverIds.length === 0) return;

    setBulkActionLoading(true);
    setBulkActionResult(null);
    
    try {
      const response = await fetch('/api/admin/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: `bulk-${action}`,
          serverIds
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to perform bulk action: ${response.statusText}`);
      }

      const result: BulkActionResult = await response.json();
      setBulkActionResult(result);
      setSelectedServers(new Set());
      
      // Reload servers to update status
      await loadServers();
    } catch (error) {
      console.error('Error performing bulk action:', error);
      setError(error instanceof Error ? error.message : 'Failed to perform bulk action');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const performBulkAction = (action: 'start' | 'stop' | 'restart' | 'delete') =>
    performServerAction(action, Array.from(selectedServers));

  const handleSelectAll = () => {
    if (selectedServers.size === servers.length) {
      setSelectedServers(new Set());
    } else {
      setSelectedServers(new Set(servers.map(s => s.uniqueId)));
    }
  };

  const handleSelectServer = (serverId: string) => {
    const newSelected = new Set(selectedServers);
    if (newSelected.has(serverId)) {
      newSelected.delete(serverId);
    } else {
      newSelected.add(serverId);
    }
    setSelectedServers(newSelected);
  };

  // Prefer the live container state and fall back to what the database last recorded
  const getServerStatus = (server: Server) =>
    server.containerStatus?.state || (server.isOnline ? 'running' : 'stopped');

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running': return 'running';
      case 'exited':
      case 'stopped': return 'stopped';
      case 'restarting':
      case 'starting': return 'starting';
      case 'stopping': return 'stopping';
      case 'dead':
      case 'error': return 'error';
      default: return 'unknown';
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload whenever the page or a filter changes
    loadServers();
  }, [loadServers]);

  if (loading && servers.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading servers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Server Management</h1>
        <div className={styles.headerActions}>
          <button 
            className={styles.refreshBtn} 
            onClick={loadServers}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <h3>Total Servers</h3>
          <div className={styles.statValue}>{totalServers}</div>
        </div>
        <div className={styles.statCard}>
          <h3>Running</h3>
          <div className={styles.statValue}>
            {servers.filter(s => getServerStatus(s).toLowerCase() === 'running').length}
          </div>
        </div>
        <div className={styles.statCard}>
          <h3>Stopped</h3>
          <div className={styles.statValue}>
            {servers.filter(s => getServerStatus(s).toLowerCase() !== 'running').length}
          </div>
        </div>
        <div className={styles.statCard}>
          <h3>Selected</h3>
          <div className={styles.statValue}>{selectedServers.size}</div>
        </div>
      </div>

      <div className={styles.filtersSection}>
        <div className={styles.filtersGrid}>
          <div className={styles.filterGroup}>
            <label htmlFor="search">Search Servers</label>
            <input
              id="search"
              type="text"
              placeholder="Search by name or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.filterGroup}>
            <label htmlFor="status">Status Filter</label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="online">Running</option>
              <option value="offline">Stopped</option>
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label htmlFor="user">User Filter</label>
            <input
              id="user"
              type="text"
              placeholder="Filter by user email..."
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      {bulkActionResult && (
        <div className={`${styles.resultPanel} ${bulkActionResult.success ? styles.success : styles.error}`}>
          <h3>Bulk Action Results</h3>
          <div className={styles.resultStats}>
            <span>Total: {bulkActionResult.summary.total}</span>
            <span className={styles.success}>Successful: {bulkActionResult.summary.successful}</span>
            <span className={styles.error}>Failed: {bulkActionResult.summary.failed}</span>
          </div>
          {bulkActionResult.results.some(r => !r.success) && (
            <div className={styles.resultErrors}>
              <h4>Failed Operations:</h4>
              <ul>
                {bulkActionResult.results
                  .filter(r => !r.success)
                  .map((result, index) => (
                    <li key={index} className={styles.error}>
                      {result.serverName || result.serverId}: {result.error}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <button
            className={styles.dismissBtn}
            onClick={() => setBulkActionResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className={styles.serversSection}>
        <div className={styles.sectionHeader}>
          <h2>All Servers ({totalServers})</h2>
          {selectedServers.size > 0 && (
            <div className={styles.bulkActions}>
              <button
                className={styles.startBtn}
                onClick={() => performBulkAction('start')}
                disabled={bulkActionLoading}
              >
                Start Selected ({selectedServers.size})
              </button>
              <button
                className={styles.stopBtn}
                onClick={() => performBulkAction('stop')}
                disabled={bulkActionLoading}
              >
                Stop Selected ({selectedServers.size})
              </button>
              <button
                className={styles.restartBtn}
                onClick={() => performBulkAction('restart')}
                disabled={bulkActionLoading}
              >
                Restart Selected ({selectedServers.size})
              </button>
              <button
                className={styles.deleteBtn}
                onClick={() => {
                  if (confirm(`Are you sure you want to delete ${selectedServers.size} selected server(s)? This action cannot be undone.`)) {
                    performBulkAction('delete');
                  }
                }}
                disabled={bulkActionLoading}
              >
                Delete Selected ({selectedServers.size})
              </button>
            </div>
          )}
        </div>

        <div className={styles.serversTable}>
          <div className={styles.tableHeader}>
            <input
              type="checkbox"
              checked={servers.length > 0 && selectedServers.size === servers.length}
              onChange={handleSelectAll}
            />
            <span>Server Name</span>
            <span>Owner</span>
            <span>Version</span>
            <span>Port</span>
            <span>Status</span>
            <span>Created</span>
            <span>Actions</span>
          </div>
          {servers.map((server) => {
            const status = getServerStatus(server);
            const isRunning = status.toLowerCase() === 'running';
            return (
            <div key={server.uniqueId} className={styles.tableRow}>
              <input
                type="checkbox"
                checked={selectedServers.has(server.uniqueId)}
                onChange={() => handleSelectServer(server.uniqueId)}
                aria-label={`Select ${server.serverName}`}
              />
              <div className={styles.serverInfo}>
                <div className={styles.serverName}>{server.serverName}</div>
                <div className={styles.serverDetails}>
                  {server.serverConfig?.serverType || 'unknown'} • {server.subdomainName || 'no address'}
                </div>
              </div>
              <div className={styles.userInfo}>
                <div className={styles.userEmail}>{server.email}</div>
                {server.user && !server.user.isActive && (
                  <div className={styles.username}>deactivated</div>
                )}
              </div>
              <span className={styles.version}>{server.serverConfig?.version || 'unknown'}</span>
              <span className={styles.proxy}>{server.port ?? '—'}</span>
              <span className={`${styles.status} ${styles[getStatusColor(status)]}`}>
                {status}
              </span>
              <span className={styles.date}>{formatDate(server.createdAt)}</span>
              <div className={styles.serverActions}>
                <button
                  className={styles.actionBtn}
                  onClick={() => performServerAction('start', [server.uniqueId])}
                  disabled={bulkActionLoading || isRunning}
                  title="Start Server"
                  aria-label={`Start ${server.serverName}`}
                >
                  ▶️
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={() => performServerAction('stop', [server.uniqueId])}
                  disabled={bulkActionLoading || !isRunning}
                  title="Stop Server"
                  aria-label={`Stop ${server.serverName}`}
                >
                  ⏹️
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={() => performServerAction('restart', [server.uniqueId])}
                  disabled={bulkActionLoading}
                  title="Restart Server"
                  aria-label={`Restart ${server.serverName}`}
                >
                  🔄
                </button>
              </div>
            </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
            >
              Previous
            </button>
            <span className={styles.pageInfo}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || loading}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
