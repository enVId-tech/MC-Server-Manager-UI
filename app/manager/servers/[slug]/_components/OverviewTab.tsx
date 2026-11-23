'use client';

import React, { useState } from 'react';
import {
    FaCheck,
    FaCopy,
    FaExchangeAlt,
    FaExclamationTriangle,
    FaGlobe,
    FaInfoCircle,
    FaLightbulb,
    FaMemory,
    FaMicrochip,
    FaUsers,
} from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import EducationJoin from './EducationJoin';
import type { NetworkStatus, ServerInfo, ServerStats } from './types';

function percent(value: number, max: number): number {
    return max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
}

function meterTone(pct: number): string {
    if (pct >= 90) return styles.meterHigh;
    if (pct >= 70) return styles.meterWarn;
    return styles.meterOk;
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
    const { showNotification } = useNotifications();
    const [copied, setCopied] = useState(false);

    return (
        <button
            type="button"
            className={`${styles.btn} ${styles.small}`}
            onClick={() => {
                void navigator.clipboard?.writeText(value).then(
                    () => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                        showNotification({ type: 'success', title: 'Copied', message: value });
                    },
                    () => showNotification({ type: 'error', title: 'Copy failed', message: 'Copy it by hand.' })
                );
            }}
        >
            {copied ? <FaCheck aria-hidden="true" /> : <FaCopy aria-hidden="true" />} {copied ? 'Copied' : label}
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
    const playersPercent = percent(stats.playersOnline, stats.maxPlayers);
    const cpuPercent = Math.min(100, Math.max(0, stats.cpuUsage));
    const first = network?.joinAddresses[0];

    return (
        <>
            <div className={`${styles.grid} ${styles.stats}`}>
                <div className={styles.stat}>
                    <div className={styles.statTop}>
                        <span className={styles.label}>Players</span>
                        <span className={styles.cardIcon}><FaUsers aria-hidden="true" /></span>
                    </div>
                    <span className={styles.value}>{stats.playersOnline} / {stats.maxPlayers}</span>
                    <div className={styles.meter}><span className={styles.meterOk} style={{ width: `${playersPercent}%` }} /></div>
                    <span className={styles.note}>{playersPercent}% capacity</span>
                </div>

                <div className={styles.stat}>
                    <div className={styles.statTop}>
                        <span className={styles.label}>Memory</span>
                        <span className={styles.cardIcon}><FaMemory aria-hidden="true" /></span>
                    </div>
                    <span className={styles.value}>{ramPercent}%</span>
                    <div className={styles.meter}><span className={meterTone(ramPercent)} style={{ width: `${ramPercent}%` }} /></div>
                    <span className={styles.note}>{stats.ramUsage} of {stats.maxRam} MB</span>
                </div>

                <div className={styles.stat}>
                    <div className={styles.statTop}>
                        <span className={styles.label}>CPU</span>
                        <span className={styles.cardIcon}><FaMicrochip aria-hidden="true" /></span>
                    </div>
                    <span className={styles.value}>{stats.cpuUsage}%</span>
                    <div className={styles.meter}><span className={meterTone(cpuPercent)} style={{ width: `${cpuPercent}%` }} /></div>
                    <span className={styles.note}>Container load</span>
                </div>

                <div className={styles.stat}>
                    <div className={styles.statTop}>
                        <span className={styles.label}>Traffic</span>
                        <span className={styles.cardIcon}><FaExchangeAlt aria-hidden="true" /></span>
                    </div>
                    <span className={styles.value}>{stats.networkRx} / {stats.networkTx} MB</span>
                    <span className={styles.note}>received / sent</span>
                </div>
            </div>

            <div className={`${styles.grid} ${styles.cols2}`} style={{ marginTop: '1rem' }}>
                <section className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2><span className={styles.cardIcon}><FaGlobe aria-hidden="true" /></span> How to join</h2>
                    </div>
                    {first ? (
                        <>
                            {network?.joinAddresses.map(address => (
                                <div key={address.proxyId} style={{ marginBottom: '0.65rem' }}>
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
                                    {address.edugeyser && address === network?.joinAddresses.find(item => item.edugeyser) && (
                                        <EducationJoin uniqueId={info.uniqueId} />
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
                    <div className={styles.cardHeader}>
                        <h2><span className={styles.cardIcon}><FaInfoCircle aria-hidden="true" /></span> Details</h2>
                    </div>
                    <div className={styles.kvList}>
                        <div className={styles.kvRow}>
                            <span className={styles.kvKey}>Type</span>
                            <span className={styles.kvValue}>{info.serverType ?? 'unknown'}</span>
                        </div>
                        {info.version && (
                            <div className={styles.kvRow}>
                                <span className={styles.kvKey}>Version</span>
                                <span className={`${styles.kvValue} ${styles.mono}`}>{info.version}</span>
                            </div>
                        )}
                        {info.isAdmin && (
                            <div className={styles.kvRow}>
                                <span className={styles.kvKey}>Port</span>
                                <span className={`${styles.kvValue} ${styles.mono}`}>{info.port}</span>
                            </div>
                        )}
                        {info.isAdmin && (
                            <div className={styles.kvRow}>
                                <span className={styles.kvKey}>Owner</span>
                                <span className={styles.kvValue}>{info.owner}</span>
                            </div>
                        )}
                        {network && (
                            <div className={styles.kvRow}>
                                <span className={styles.kvKey}>Network</span>
                                <span className={styles.kvValue}>
                                    <span className={`${styles.badge} ${network.connected ? styles.ok : styles.warn}`}>
                                        {network.connected ? (info.isAdmin ? (network.links ?? []).map(link => link.proxyName).join(', ') : 'connected') : 'not connected'}
                                    </span>
                                </span>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {network && network.warnings.length > 0 && (
                <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: '1rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FaExclamationTriangle aria-hidden="true" /> {network.warnings[0].message}
                    </span>
                    <button className={`${styles.btn} ${styles.small}`} onClick={onOpenNetwork}>Details</button>
                </div>
            )}

            {stats.recommendations.length > 0 && (
                <section className={styles.card} style={{ marginTop: '1rem' }}>
                    <div className={styles.cardHeader}>
                        <h2><span className={styles.cardIcon}><FaLightbulb aria-hidden="true" /></span> Suggestions</h2>
                    </div>
                    <ul className={styles.suggestionsList}>
                        {stats.recommendations.map(text => <li key={text}>{text}</li>)}
                    </ul>
                </section>
            )}
            {stats.error && <div className={`${styles.notice} ${styles.error}`} style={{ marginTop: '1rem' }}>{stats.error}</div>}
        </>
    );
}
