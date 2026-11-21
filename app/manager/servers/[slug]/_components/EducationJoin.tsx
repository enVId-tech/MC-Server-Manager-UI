'use client';

import React, { useCallback, useEffect, useState } from 'react';
import styles from '../dashboard.module.scss';
import { CopyButton } from './OverviewTab';

interface EduInfo {
    links: string[];
    lines: string[];
    connectionIds?: Array<{ label: string; value: string }>;
    serverList?: { name: string; host: string; port: string };
    notice?: string;
    proxyName?: string;
    error?: string;
}

/** Education Edition join codes and links of the proxy's EduGeyser, with a button to read them again */
export default function EducationJoin({ uniqueId }: { uniqueId: string }) {
    const [edu, setEdu] = useState<EduInfo | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (refresh: boolean) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/server/network?uniqueId=${encodeURIComponent(uniqueId)}&edu=${refresh ? 'refresh' : '1'}`);
            setEdu(await response.json());
        } catch {
            setEdu({ links: [], lines: [], error: 'The join codes could not be read.' });
        } finally {
            setLoading(false);
        }
    }, [uniqueId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the codes when the card opens
        void load(false);
    }, [load]);

    return (
        <div>
            <p className={styles.addressLabel}>Education Edition</p>
            {!edu && loading && <p className={styles.muted}>Reading the join codes…</p>}
            {edu?.error && <div className={`${styles.notice} ${styles.error}`}>{edu.error}</div>}
            {edu?.connectionIds?.map(item => (
                <div key={item.label} className={styles.addressRow}>
                    <div><span className={styles.addressLabel}>{item.label}</span><span className={styles.mono}>{item.value}</span></div>
                    <CopyButton value={item.value} />
                </div>
            ))}
            {edu?.links.map(link => (
                <div key={link} className={styles.addressRow}><span className={styles.mono} style={{ wordBreak: 'break-all' }}>{link}</span><CopyButton value={link} /></div>
            ))}
            {edu?.lines.map(line => (
                <div key={line} className={styles.addressRow}><span className={styles.mono}>{line}</span><CopyButton value={line} /></div>
            ))}
            {edu?.serverList && (edu.serverList.host || edu.serverList.name) && (
                <p className={styles.muted}>Server list entry: {edu.serverList.name || 'unnamed'}{edu.serverList.host ? ` at ${edu.serverList.host}${edu.serverList.port ? `:${edu.serverList.port}` : ''}` : ' (address detected by EduGeyser)'}</p>
            )}
            {edu?.notice && <div className={`${styles.notice} ${styles.warning}`}>{edu.notice}</div>}
            <button className={styles.btn} disabled={loading} onClick={() => void load(true)}>{loading ? 'Reading…' : 'Refresh codes'}</button>
        </div>
    );
}
