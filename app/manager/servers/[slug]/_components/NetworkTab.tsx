'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { CopyButton } from './OverviewTab';
import { postJson, type NetworkStatus, type ServerInfo } from './types';

interface EduInfo {
    links: string[];
    lines: string[];
    proxyName?: string;
    error?: string;
}

const FORWARDING: Record<string, string> = { modern: 'Modern', bungeeguard: 'BungeeGuard', legacy: 'Legacy', none: 'None' };

export default function NetworkTab({ info, network, onChanged }: { info: ServerInfo; network: NetworkStatus | null; onChanged: () => void }) {
    const { showNotification } = useNotifications();
    const [busy, setBusy] = useState(false);
    const [edu, setEdu] = useState<EduInfo | null>(null);
    const [eduLoading, setEduLoading] = useState(false);
    const hasEdu = Boolean(network?.joinAddresses.some(address => address.edugeyser));

    const loadEdu = useCallback(async (refresh: boolean) => {
        setEduLoading(true);
        try {
            const response = await fetch(`/api/server/network?uniqueId=${encodeURIComponent(info.uniqueId)}&edu=${refresh ? 'refresh' : '1'}`);
            setEdu(await response.json());
        } finally {
            setEduLoading(false);
        }
    }, [info.uniqueId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once the tab knows the proxy runs EduGeyser
        if (hasEdu) void loadEdu(false);
    }, [hasEdu, loadEdu]);

    const dismiss = async (code: string) => {
        await postJson('/api/server/network', { uniqueId: info.uniqueId, action: 'dismiss', code });
        onChanged();
    };

    const recheck = async (restart: boolean) => {
        setBusy(true);
        const { ok, body } = await postJson<{ details?: string[]; restartNeeded?: boolean }>('/api/server/network', { uniqueId: info.uniqueId, action: 'sync', restart });
        setBusy(false);
        showNotification({
            type: ok ? 'success' : 'error',
            title: 'Network',
            message: ok ? [body.restartNeeded && !restart ? 'The server has to restart for the changes to apply.' : 'The network settings are up to date.', ...(body.details ?? [])].join('\n') : body.message ?? 'The check failed.',
        });
        onChanged();
    };

    if (!network) return <div className={styles.loading}>Loading…</div>;

    return (
        <>
            {network.warnings.map(warning => (
                <div key={warning.code} className={`${styles.notice} ${styles.warning}`} style={{ marginBottom: '0.75rem' }}>
                    <span>{warning.message}</span>
                    <button className={`${styles.btn} ${styles.small}`} onClick={() => void dismiss(warning.code)}>Dismiss</button>
                </div>
            ))}

            <div className={`${styles.grid} ${styles.cols2}`}>
                <section className={styles.card}>
                    <h2>Proxy network</h2>
                    {network.connected ? (
                        <>
                            {info.isAdmin && network.links && network.forwarding ? (
                                <p>
                                    This server is behind {network.links.map(link => link.proxyName).join(', ')} using {FORWARDING[network.forwarding] ?? network.forwarding} forwarding. When it stops, players are disconnected instead of being sent to another server.
                                </p>
                            ) : (
                                <p>This server is connected to the network. When it stops, players are disconnected instead of being sent to another server.</p>
                            )}
                            {network.locked && <p>The network settings of this server are managed by the administrators and cannot be changed.</p>}
                        </>
                    ) : (
                        <p>This server is not behind a proxy. It is checked again whenever it is deployed or an administrator changes the network, or you can check it now.</p>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {info.isAdmin && <button className={styles.btn} disabled={busy} onClick={() => void recheck(false)}>{busy ? 'Checking…' : 'Check again'}</button>}
                        {info.isAdmin && <button className={styles.btn} disabled={busy} onClick={() => void recheck(true)}>Check and restart</button>}
                    </div>
                    {network.syncedAt && <p className={styles.muted} style={{ marginTop: '0.75rem' }}>Last checked {new Date(network.syncedAt).toLocaleString()}</p>}
                </section>

                <section className={styles.card}>
                    <h2>Addresses</h2>
                    {network.joinAddresses.length === 0 && network.port !== undefined && (
                        <div className={styles.addressRow}>
                            <div><span className={styles.addressLabel}>Direct port (Java)</span><span className={styles.mono}>{network.port}</span></div>
                            <CopyButton value={String(network.port)} />
                        </div>
                    )}
                    {network.joinAddresses.map(address => (
                        <div key={address.proxyId}>
                            <div className={styles.addressRow}>
                                <div><span className={styles.addressLabel}>Java{address.proxyName ? ` via ${address.proxyName}` : ''}</span><span className={styles.mono}>{address.java}</span></div>
                                <CopyButton value={address.java} />
                            </div>
                            {address.bedrock && (
                                <div className={styles.addressRow}>
                                    <div><span className={styles.addressLabel}>Bedrock{address.proxyName ? ` via ${address.proxyName}` : ''}</span><span className={styles.mono}>{address.bedrock.host} : {address.bedrock.port}</span></div>
                                    <CopyButton value={`${address.bedrock.host}:${address.bedrock.port}`} />
                                </div>
                            )}
                        </div>
                    ))}
                </section>
            </div>

            {hasEdu && (
                <section className={styles.card} style={{ marginTop: '1rem' }}>
                    <h2>Education Edition</h2>
                    <p>The proxy runs EduGeyser. Education Edition players join with a code or link that the proxy prints.</p>
                    {edu?.error && <div className={`${styles.notice} ${styles.error}`}>{edu.error}</div>}
                    {edu && edu.links.length === 0 && edu.lines.length === 0 && !edu.error && <p className={styles.muted}>No join code was found yet. The proxy has to be running.</p>}
                    {edu?.links.map(link => (
                        <div key={link} className={styles.addressRow}><span className={styles.mono} style={{ wordBreak: 'break-all' }}>{link}</span><CopyButton value={link} /></div>
                    ))}
                    {edu?.lines.map(line => (
                        <div key={line} className={styles.addressRow}><span className={styles.mono}>{line}</span><CopyButton value={line} /></div>
                    ))}
                    <button className={styles.btn} disabled={eduLoading} onClick={() => void loadEdu(true)}>{eduLoading ? 'Reading…' : 'Refresh codes'}</button>
                </section>
            )}
        </>
    );
}
