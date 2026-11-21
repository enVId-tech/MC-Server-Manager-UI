'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import EducationJoin from './EducationJoin';
import { CopyButton } from './OverviewTab';
import { postJson, type NetworkStatus, type ServerInfo } from './types';

const FORWARDING: Record<string, string> = { modern: 'Modern', bungeeguard: 'BungeeGuard', legacy: 'Legacy', none: 'None' };

export default function NetworkTab({ info, network, onChanged }: { info: ServerInfo; network: NetworkStatus | null; onChanged: () => void }) {
    const { showNotification } = useNotifications();
    const [busy, setBusy] = useState(false);
    const [addressDraft, setAddressDraft] = useState('');
    const hasEdu = Boolean(network?.joinAddresses.some(address => address.edugeyser));

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

    const saveAddress = async () => {
        setBusy(true);
        const { ok, body } = await postJson<{ subdomain?: string; details?: string[] }>('/api/server/network', { uniqueId: info.uniqueId, action: 'subdomain', subdomain: addressDraft });
        setBusy(false);
        showNotification({ type: ok ? 'success' : 'error', title: 'Address', message: ok ? [`The address is now ${body.subdomain}`, ...(body.details ?? [])].join('\n') : body.message ?? 'The address could not be saved.' });
        if (ok) { setAddressDraft(''); onChanged(); }
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
                    {!info.subdomain && (
                        <div className={`${styles.notice} ${styles.warning}`} style={{ display: 'block', marginBottom: '0.75rem' }}>
                            <p style={{ marginTop: 0 }}>This server has no address yet. No proxy has a forced host for it. Pick the name players will join with.</p>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <input className={styles.input} value={addressDraft} placeholder="survival" aria-label="Address" onChange={event => setAddressDraft(event.target.value.toLowerCase())} />
                                <button className={`${styles.btn} ${styles.primary}`} disabled={busy || !addressDraft} onClick={() => void saveAddress()}>{busy ? 'Saving…' : 'Set address'}</button>
                            </div>
                        </div>
                    )}
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
                    <p>The proxy runs EduGeyser. Education Edition players join with a code or link that the proxy prints. The same codes are on the Overview tab.</p>
                    <EducationJoin uniqueId={info.uniqueId} />
                </section>
            )}
        </>
    );
}
