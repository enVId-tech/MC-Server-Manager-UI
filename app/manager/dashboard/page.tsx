"use client";
import React, {useEffect, useState} from 'react';
import styles from './dashboard.module.scss';
import {useRouter} from "next/navigation";
import dashboardBg from "@/public/dashboard-bg.png";

// Define servers interfaces for better type checking
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

export default function Dashboard() {
    const [servers, setServers] = useState<Server[]>(initialServers);
    const router = useRouter();

    useEffect(() => {
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
        }, 60 * 1000); // Check every minute

        // Initial check on component mount
        checkAuth();
        window.addEventListener('cookies', checkAuth);

        return () => {
            window.removeEventListener('cookies', checkAuth);
            clearInterval(interval); // Clear the interval on component unmount
        };
    }, [router]);


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
        if (window.confirm('Are you sure you want to delete this servers? This action cannot be undone.')) {
            setServers(servers.filter(server => server.id !== id));
        }
    };

    return (
        <main className={styles.dashboard} style={{ backgroundImage: `url(${dashboardBg.src})` }}>
            <div className={styles.container} >
                <div className={styles.header}>
                    <h1 className={styles.pageTitle}>Server Manager</h1>
                    <button
                        className={`${styles.button} ${styles.primary}`}
                        onClick={() => window.location.href = "/manager/servers/create"}
                    >
                        Create New Server
                    </button>
                </div>

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