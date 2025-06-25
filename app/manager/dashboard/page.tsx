"use client";
import React, { useState } from 'react';
import styles from './dashboard.module.scss';

// Define server interfaces for better type checking
interface Server {
    id: number;
    name: string;
    type: string;
    status: 'online' | 'offline';
    players: number;
    maxPlayers: number;
    version: string;
}

interface ServerType {
    id: string;
    name: string;
}

// Mock data for demonstration
const initialServers: Server[] = [
    { id: 1, name: 'Survival Server', type: 'survival', status: 'online', players: 8, maxPlayers: 20, version: '1.19.2' },
    { id: 2, name: 'Creative Build', type: 'creative', status: 'online', players: 3, maxPlayers: 10, version: '1.19.2' },
    { id: 3, name: 'Modded Adventure', type: 'modded', status: 'offline', players: 0, maxPlayers: 15, version: '1.18.2' },
];

const serverTypes: ServerType[] = [
    { id: 'survival', name: 'Survival' },
    { id: 'creative', name: 'Creative' },
    { id: 'minigames', name: 'Minigames' },
    { id: 'modded', name: 'Modded' },
    { id: 'custom', name: 'Custom' },
];

const versions = ['1.19.3', '1.19.2', '1.18.2', '1.17.1', '1.16.5'];

export default function Dashboard() {
    const [servers, setServers] = useState<Server[]>(initialServers);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newServer, setNewServer] = useState({
        name: '',
        type: 'survival',
        version: '1.19.3',
        maxPlayers: 20,
    });

    const handleCreateServer = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const server: Server = {
            id: Date.now(),
            name: newServer.name,
            type: newServer.type,
            status: 'offline',
            players: 0,
            maxPlayers: newServer.maxPlayers,
            version: newServer.version,
        };

        setServers([...servers, server]);
        setNewServer({ name: '', type: 'survival', version: '1.19.3', maxPlayers: 20 });
        setShowCreateForm(false);
    };

    const handleStartServer = (id: number) => {
        setServers(servers.map(server =>
            server.id === id ? { ...server, status: 'online' } : server
        ));
    };

    const handleStopServer = (id: number) => {
        setServers(servers.map(server =>
            server.id === id ? { ...server, status: 'offline', players: 0 } : server
        ));
    };

    const handleDeleteServer = (id: number) => {
        if (window.confirm('Are you sure you want to delete this server? This action cannot be undone.')) {
            setServers(servers.filter(server => server.id !== id));
        }
    };

    return (
        <main className={styles.dashboard}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.pageTitle}>Server Manager</h1>
                    <button
                        className={`${styles.button} ${styles.primary}`}
                        onClick={() => setShowCreateForm(!showCreateForm)}
                    >
                        {showCreateForm ? 'Cancel' : 'Create New Server'}
                    </button>
                </div>

                {showCreateForm && (
                    <div className={styles.createServerForm}>
                        <h2 className={styles.formTitle}>Create New Server</h2>
                        <form onSubmit={handleCreateServer}>
                            <div className={styles.formGroup}>
                                <label htmlFor="serverName">Server Name</label>
                                <input
                                    id="serverName"
                                    type="text"
                                    value={newServer.name}
                                    onChange={(e) => setNewServer({...newServer, name: e.target.value})}
                                    required
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="serverType">Server Type</label>
                                <select
                                    id="serverType"
                                    value={newServer.type}
                                    onChange={(e) => setNewServer({...newServer, type: e.target.value})}
                                >
                                    {serverTypes.map(type => (
                                        <option key={type.id} value={type.id}>{type.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="serverVersion">Minecraft Version</label>
                                <select
                                    id="serverVersion"
                                    value={newServer.version}
                                    onChange={(e) => setNewServer({...newServer, version: e.target.value})}
                                >
                                    {versions.map(version => (
                                        <option key={version} value={version}>{version}</option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="maxPlayers">Max Players</label>
                                <input
                                    id="maxPlayers"
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={newServer.maxPlayers}
                                    onChange={(e) => setNewServer({...newServer, maxPlayers: parseInt(e.target.value)})}
                                    required
                                />
                            </div>

                            <div className={styles.formActions}>
                                <button
                                    type="button"
                                    className={`${styles.button} ${styles.secondary}`}
                                    onClick={() => setShowCreateForm(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className={`${styles.button} ${styles.primary}`}>
                                    Create Server
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <h2 className={styles.sectionTitle}>Your Servers</h2>
                {servers.length === 0 ? (
                    <p className={styles.emptyState}>You don&apos;t have any servers yet. Create one to get started!</p>
                ) : (
                    <div className={styles.serverGrid}>
                        {servers.map(server => (
                            <div key={server.id} className={styles.serverCard}>
                <span className={`${styles.serverStatus} ${styles[server.status]}`}>
                  {server.status}
                </span>
                                <h3 className={styles.serverName}>{server.name}</h3>
                                <div className={styles.serverDetails}>
                                    <p>Type: {serverTypes.find(t => t.id === server.type)?.name || server.type}</p>
                                    <p>Version: {server.version}</p>
                                    <p>Players: {server.players}/{server.maxPlayers}</p>
                                </div>

                                <div className={styles.actions}>
                                    {server.status === 'offline' ? (
                                        <button
                                            className={`${styles.button} ${styles.primary}`}
                                            onClick={() => handleStartServer(server.id)}
                                        >
                                            Start
                                        </button>
                                    ) : (
                                        <button
                                            className={`${styles.button} ${styles.secondary}`}
                                            onClick={() => handleStopServer(server.id)}
                                        >
                                            Stop
                                        </button>
                                    )}
                                    <button
                                        className={`${styles.button} ${styles.secondary}`}
                                        onClick={() => alert('Server settings functionality would go here')}
                                    >
                                        Settings
                                    </button>
                                    <button
                                        className={`${styles.button} ${styles.danger}`}
                                        onClick={() => handleDeleteServer(server.id)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}