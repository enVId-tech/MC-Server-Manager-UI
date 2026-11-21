'use client';

import React from 'react';
import { FaCopy } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import type { NetworkStatus, ServerInfo, ServerStats } from './types';

function percent(value: number, max: number): number {
    return max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
    const { showNotification } = useNotifications();
    return (
        <button
            type="button"
            className={`${styles.btn} ${styles.small}`}
            onClick={() => {
                void navigator.clipboard?.writeText(value).then(
                    () => showNotification({ type: 'success', title: 'Copied', message: value }),
                    () => showNotification({ type: 'error', title: 'Copy failed', message: 'Copy it by hand.' })
                );
            }}
        >
            <FaCopy /> {label}
        </button>
    );
}

interface Props {
    info: ServerInfo;
    stats: ServerStats;
    network: NetworkStatus | null;
    onOpenNetwork: () => void;
}

export default function OverviewTab({ info, stats, network, onOpenNetwork }: Props) {
    const ramPercent = percent(stats.ramUsage, stats.maxRam);
    const first = network?.joinAddresses[0];

    return (
        <>
            <div className={`${styles.grid} ${styles.stats}`}>
                <div className={styles.stat}>
                    <span className={styles.label}>Players</span>
                    <span className={styles.value}>{stats.playersOnline} / {stats.maxPlayers}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.label}>Memory</span>
                    <span className={styles.value}>{ramPercent}%</span>
                    <div className={styles.meter}><span style={{ width: `${ramPercent}%` }} /></div>
                    <span className={styles.note}>{stats.ramUsage} of {stats.maxRam} MB</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.label}>CPU</span>
                    <span className={styles.value}>{stats.cpuUsage}%</span>
                    <div className={styles.meter}><span style={{ width: `${Math.min(100, stats.cpuUsage)}%` }} /></div>
                </div>
                <div className={styles.stat}>
                    <span className={styles.label}>Traffic</span>
                    <span className={styles.value}>{stats.networkRx} / {stats.networkTx} MB</span>
                    <span className={styles.note}>received / sent</span>
                </div>
            </div>

            <div className={`${styles.grid} ${styles.cols2}`} style={{ marginTop: '1rem' }}>
                <section className={styles.card}>
                    <h2>How to join</h2>
                    {first ? (
                        <>
                            {network?.joinAddresses.map(address => (
                                <div key={address.proxyId}>
                                    <div className={styles.addressRow}>
                                        <div>
                                            <span className={styles.addressLabel}>Java Edition{network.joinAddresses.length > 1 ? ` via ${address.proxyName}` : ''}</span>
                                            <span className={styles.mono}>{address.java}</span>
                                        </div>
                                        <CopyButton value={address.java} />
                                    </div>
                                    {address.bedrock && (
                                        <div className={styles.addressRow}>
                                            <div>
                                                <span className={styles.addressLabel}>Bedrock Edition (address and port)</span>
                                                <span className={styles.mono}>{address.bedrock.host} : {address.bedrock.port}</span>
                                            </div>
                                            <CopyButton value={`${address.bedrock.host}:${address.bedrock.port}`} />
                                        </div>
                                    )}
                                    {address.edugeyser && (
                                        <p>Education Edition join codes are shown in the Network tab.</p>
                                    )}
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            <p>This server is not behind a proxy, so players have to use its own port.</p>
                            <div className={styles.addressRow}>
                                <div>
                                    <span className={styles.addressLabel}>Direct port</span>
                                    <span className={styles.mono}>{network?.port ?? info.port}</span>
                                </div>
                                <CopyButton value={String(network?.port ?? info.port)} />
                            </div>
                        </>
                    )}
                </section>

                <section className={styles.card}>
                    <h2>Details</h2>
                    <div className={styles.addressRow}><span className={styles.muted}>Type</span><span>{info.serverType ?? 'unknown'}</span></div>
                    {info.version && <div className={styles.addressRow}><span className={styles.muted}>Version</span><span>{info.version}</span></div>}
                    <div className={styles.addressRow}><span className={styles.muted}>Port</span><span className={styles.mono}>{info.port}</span></div>
                    {info.isAdmin && <div className={styles.addressRow}><span className={styles.muted}>Owner</span><span>{info.owner}</span></div>}
                    {network && (
                        <div className={styles.addressRow}>
                            <span className={styles.muted}>Network</span>
                            <span>{network.connected ? network.links.map(link => link.proxyName).join(', ') : 'not connected'}</span>
                        </div>
                    )}
                </section>
            </div>

            {network && network.warnings.length > 0 && (
                <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: '1rem' }}>
                    <span>{network.warnings[0].message}</span>
                    <button className={`${styles.btn} ${styles.small}`} onClick={onOpenNetwork}>Details</button>
                </div>
            )}

            {stats.recommendations.length > 0 && (
                <section className={styles.card} style={{ marginTop: '1rem' }}>
                    <h2>Suggestions</h2>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {stats.recommendations.map(text => <li key={text} className={styles.muted}>{text}</li>)}
                    </ul>
                </section>
            )}
            {stats.error && <div className={`${styles.notice} ${styles.error}`} style={{ marginTop: '1rem' }}>{stats.error}</div>}
        </>
    );
}
