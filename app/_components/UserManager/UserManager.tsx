'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from './UserManager.module.scss';

interface ManagedUser {
    id: string;
    email: string;
    isActive: boolean;
    isAdmin: boolean;
    maxServers: number;
    serverCount: number;
    createdAt?: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

type StatusFilter = 'all' | 'pending' | 'active';

export default function UserManager() {
    const { showNotification, showConfirmDialog } = useNotifications();

    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [busyUserId, setBusyUserId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);
    const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});

    const loadUsers = useCallback(() => {
        const params = new URLSearchParams({ page: String(page), limit: '20', status });
        if (searchTerm) {
            params.set('search', searchTerm);
        }

        return fetch(`/api/admin/users?${params.toString()}`)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to load users');
                }
                setUsers(data.users);
                setPagination(data.pagination);
                setLimitDrafts({});
            })
            .catch((error) => {
                showNotification({
                    type: 'error',
                    title: 'Could not load users',
                    message: error instanceof Error ? error.message : 'Failed to load users'
                });
            })
            .finally(() => setLoading(false));
    }, [page, searchTerm, status, showNotification]);

    useEffect(() => {
        // Loading is an effect of the filters changing, the state is set once the request finishes
        void loadUsers();
    }, [loadUsers]);

    const updateUser = async (user: ManagedUser, changes: Partial<Pick<ManagedUser, 'isActive' | 'isAdmin' | 'maxServers'>>, successMessage: string) => {
        setBusyUserId(user.id);
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, ...changes })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to update user');
            }

            showNotification({ type: 'success', title: 'User updated', message: `${user.email}: ${successMessage}` });
            await loadUsers();
        } catch (error) {
            showNotification({
                type: 'error',
                title: 'Update failed',
                message: error instanceof Error ? error.message : 'Failed to update user'
            });
        } finally {
            setBusyUserId(null);
        }
    };

    const saveServerLimit = (user: ManagedUser) => {
        const draft = limitDrafts[user.id];
        if (draft === undefined) {
            return;
        }

        const value = Number(draft);
        if (!Number.isInteger(value) || value < 0 || value > 100) {
            showNotification({ type: 'error', title: 'Invalid limit', message: 'The server limit must be a whole number between 0 and 100.' });
            return;
        }

        void updateUser(user, { maxServers: value }, `server limit set to ${value}`);
    };

    const impersonate = async (mode: 'preview' | 'user' | 'admin', user?: ManagedUser) => {
        const response = await fetch('/api/admin/impersonate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, userId: user?.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showNotification({ type: 'error', title: 'Cannot switch', message: data.message ?? 'Switching failed.' });
            return;
        }
        window.location.assign('/manager/dashboard');
    };

    const deleteUser = (user: ManagedUser) => {
        showConfirmDialog({
            title: 'Delete user',
            message: `Delete ${user.email} and their ${user.serverCount} server${user.serverCount === 1 ? '' : 's'}? Their containers and files are removed too. This can not be undone.`,
            confirmText: 'Delete user',
            cancelText: 'Cancel',
            variant: 'danger',
            onConfirm: async () => {
                setBusyUserId(user.id);
                try {
                    const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.message || 'Failed to delete user');
                    }

                    showNotification({ type: 'success', title: 'User deleted', message: `${user.email} was deleted` });
                    await loadUsers();
                } catch (error) {
                    showNotification({
                        type: 'error',
                        title: 'Deletion failed',
                        message: error instanceof Error ? error.message : 'Failed to delete user'
                    });
                } finally {
                    setBusyUserId(null);
                }
            }
        });
    };

    const applySearch = (event: React.FormEvent) => {
        event.preventDefault();
        setPage(1);
        setSearchTerm(search.trim());
    };

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                <form className={styles.searchForm} onSubmit={applySearch}>
                    <input
                        type="search"
                        placeholder="Search by email"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <button type="submit">Search</button>
                </form>
                <button onClick={() => void impersonate('preview')} title="Use the site exactly as a regular user does, with your own account">Preview as regular user</button>

                <div className={styles.filters} role="group" aria-label="Filter users">
                    {(['all', 'pending', 'active'] as StatusFilter[]).map((option) => (
                        <button
                            key={option}
                            className={status === option ? styles.activeFilter : ''}
                            onClick={() => { setStatus(option); setPage(1); }}
                        >
                            {option === 'all' ? 'All' : option === 'pending' ? 'Waiting for activation' : 'Active'}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <p className={styles.message}>Loading users...</p>
            ) : users.length === 0 ? (
                <p className={styles.message}>No users found.</p>
            ) : (
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Servers</th>
                                <th>Server limit</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => {
                                const busy = busyUserId === user.id;
                                return (
                                    <tr key={user.id}>
                                        <td>
                                            {user.email}
                                            {user.isAdmin && <span className={styles.adminBadge}>Admin</span>}
                                        </td>
                                        <td>
                                            <span className={user.isActive ? styles.activeBadge : styles.pendingBadge}>
                                                {user.isActive ? 'Active' : 'Pending'}
                                            </span>
                                        </td>
                                        <td>{user.serverCount}</td>
                                        <td>
                                            <input
                                                className={styles.limitInput}
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={limitDrafts[user.id] ?? String(user.maxServers)}
                                                onChange={(event) => setLimitDrafts(prev => ({ ...prev, [user.id]: event.target.value }))}
                                                onBlur={() => saveServerLimit(user)}
                                                onKeyDown={(event) => { if (event.key === 'Enter') { event.currentTarget.blur(); } }}
                                                disabled={busy}
                                                aria-label={`Server limit for ${user.email}`}
                                            />
                                        </td>
                                        <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</td>
                                        <td className={styles.actions}>
                                            <button
                                                disabled={busy}
                                                onClick={() => updateUser(user, { isActive: !user.isActive }, user.isActive ? 'deactivated' : 'activated')}
                                            >
                                                {user.isActive ? 'Deactivate' : 'Activate'}
                                            </button>
                                            <button
                                                disabled={busy}
                                                onClick={() => updateUser(user, { isAdmin: !user.isAdmin }, user.isAdmin ? 'administrator rights removed' : 'promoted to administrator')}
                                            >
                                                {user.isAdmin ? 'Remove admin' : 'Make admin'}
                                            </button>
                                            {user.isActive && (
                                                <>
                                                    <button disabled={busy} title="See what this user sees, with their permissions" onClick={() => void impersonate('user', user)}>View as</button>
                                                    <button disabled={busy} title="Act on their behalf while keeping administrator rights" onClick={() => void impersonate('admin', user)}>Act as</button>
                                                </>
                                            )}
                                            <button className={styles.dangerButton} disabled={busy} onClick={() => deleteUser(user)}>
                                                Delete
                                            </button>
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
                    <button disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>Previous</button>
                    <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} users)</span>
                    <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>Next</button>
                </div>
            )}
        </div>
    );
}
