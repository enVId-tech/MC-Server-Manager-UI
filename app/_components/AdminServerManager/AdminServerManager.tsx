'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './AdminServerManager.module.scss';

interface User {
  email: string;
  username: string;
  isAdmin: boolean;
  lastLogin?: Date;
}

interface Server {
  _id: string;
  name: string;
  serverJar: string;
  serverVersion: string;
  userEmail: string;
  portainerStackName: string;
  portainerStackId?: string;
  portainerEndpointId: number;
  containerId?: string;
  status: string;
  allocatedPorts: number[];
  proxyPort?: number;
  proxyType?: string;
  createdAt: Date;
  updatedAt: Date;
  lastBackup?: Date;
  user?: User;
}

interface ServersResponse {
  servers: Server[];
  totalServers: number;
  totalPages: number;
  currentPage: number;
}

interface BulkActionResult {
  success: boolean;
  results: Array<{
    serverId: string;
    serverName: string;
    success: boolean;
    error?: string;
  }>;
  stats: {
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
      setTotalPages(data.totalPages);
      setTotalServers(data.totalServers);
    } catch (error) {
      console.error('Error loading servers:', error);
      setError(error instanceof Error ? error.message : 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, statusFilter, userFilter]);

  const performBulkAction = async (action: 'start' | 'stop' | 'restart' | 'delete') => {
    if (selectedServers.size === 0) return;

    setBulkActionLoading(true);
    setBulkActionResult(null);
    
    try {
      const response = await fetch('/api/admin/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          serverIds: Array.from(selectedServers)
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

  const handleSelectAll = () => {
    if (selectedServers.size === servers.length) {
      setSelectedServers(new Set());
    } else {
      setSelectedServers(new Set(servers.map(s => s._id)));
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

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running': return 'running';
      case 'stopped': return 'stopped';
      case 'starting': return 'starting';
      case 'stopping': return 'stopping';
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

  const getProxyDisplayName = (proxyType?: string) => {
    if (!proxyType) return 'None';
    return proxyType.charAt(0).toUpperCase() + proxyType.slice(1);
  };

  useEffect(() => {
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
            {servers.filter(s => s.status.toLowerCase() === 'running').length}
          </div>
        </div>
        <div className={styles.statCard}>
          <h3>Stopped</h3>
          <div className={styles.statValue}>
            {servers.filter(s => s.status.toLowerCase() === 'stopped').length}
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
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="starting">Starting</option>
              <option value="stopping">Stopping</option>
              <option value="error">Error</option>
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
            <span>Total: {bulkActionResult.stats.total}</span>
            <span className={styles.success}>Successful: {bulkActionResult.stats.successful}</span>
            <span className={styles.error}>Failed: {bulkActionResult.stats.failed}</span>
          </div>
          {bulkActionResult.results.some(r => !r.success) && (
            <div className={styles.resultErrors}>
              <h4>Failed Operations:</h4>
              <ul>
                {bulkActionResult.results
                  .filter(r => !r.success)
                  .map((result, index) => (
                    <li key={index} className={styles.error}>
                      {result.serverName}: {result.error}
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
            <span>Proxy</span>
            <span>Status</span>
            <span>Created</span>
            <span>Actions</span>
          </div>
          {servers.map((server) => (
            <div key={server._id} className={styles.tableRow}>
              <input
                type="checkbox"
                checked={selectedServers.has(server._id)}
                onChange={() => handleSelectServer(server._id)}
              />
              <div className={styles.serverInfo}>
                <div className={styles.serverName}>{server.name}</div>
                <div className={styles.serverDetails}>
                  {server.serverJar} • Ports: {server.allocatedPorts.join(', ')}
                </div>
              </div>
              <div className={styles.userInfo}>
                <div className={styles.userEmail}>{server.userEmail}</div>
                {server.user?.username && (
                  <div className={styles.username}>@{server.user.username}</div>
                )}
              </div>
              <span className={styles.version}>{server.serverVersion}</span>
              <span className={styles.proxy}>{getProxyDisplayName(server.proxyType)}</span>
              <span className={`${styles.status} ${styles[getStatusColor(server.status)]}`}>
                {server.status}
              </span>
              <span className={styles.date}>{formatDate(server.createdAt)}</span>
              <div className={styles.serverActions}>
                <button
                  className={styles.actionBtn}
                  onClick={() => performBulkAction('start')}
                  disabled={bulkActionLoading || server.status.toLowerCase() === 'running'}
                  title="Start Server"
                >
                  ▶️
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={() => performBulkAction('stop')}
                  disabled={bulkActionLoading || server.status.toLowerCase() === 'stopped'}
                  title="Stop Server"
                >
                  ⏹️
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={() => performBulkAction('restart')}
                  disabled={bulkActionLoading}
                  title="Restart Server"
                >
                  🔄
                </button>
              </div>
            </div>
          ))}
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
