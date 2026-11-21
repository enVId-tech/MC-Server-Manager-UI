'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FaCloudUploadAlt } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from './WorldUpload.module.scss';
import WorldVerdict from './WorldVerdict';

interface Judgement { status: 'ok' | 'upgrade' | 'downgrade' | 'blocked'; requiresAcknowledgement: boolean; message: string }
interface Check { judgement: Judgement; found?: boolean; levelName?: string; versionName?: string; downgradeWarning?: string }

/**
 * Replaces the world of a stopped server with an uploaded .zip. The file is checked first. A world from a NEWER
 * version is a downgrade, which Minecraft does not support: a large red warning has to be confirmed before the
 * import is possible. Worlds across 1.17 or 26.1 are refused outright.
 */
export default function WorldUpload({ uniqueId, version, running }: { uniqueId: string; version?: string; running: boolean }) {
    const { showNotification } = useNotifications();
    const [file, setFile] = useState<File | null>(null);
    const [check, setCheck] = useState<Check | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [accepted, setAccepted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [over, setOver] = useState(false);
    const [canUpload, setCanUpload] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    // Whether uploads are on for this server (administrators always may)
    useEffect(() => {
        void fetch(`/api/server/addons?server=${encodeURIComponent(uniqueId)}`).then(r => r.json()).then(b => setCanUpload(b.canUploadFiles === true)).catch(() => setCanUpload(false));
    }, [uniqueId]);

    const send = async (picked: File, extra: Record<string, string>) => {
        const form = new FormData();
        form.append('server', uniqueId);
        form.append('file', picked);
        Object.entries(extra).forEach(([key, value]) => form.append(key, value));
        const response = await fetch('/api/server/world', { method: 'POST', body: form });
        return { ok: response.ok, body: await response.json().catch(() => ({})) as Check & { message?: string; success?: boolean } };
    };

    const pick = async (picked: File | undefined) => {
        if (!picked) return;
        setFile(picked); setCheck(null); setError(null); setAccepted(false);
        if (!/\.zip$/i.test(picked.name)) { setError('Zip the world folder and upload the .zip file.'); return; }
        setBusy(true);
        try {
            const { ok, body } = await send(picked, { checkOnly: 'true' });
            if (!ok) setError(body.message ?? 'The world could not be read.'); else setCheck(body);
        } catch {
            setError('The world could not be checked.');
        } finally {
            setBusy(false);
        }
    };

    const install = async () => {
        if (!file) return;
        setBusy(true);
        try {
            const { ok, body } = await send(file, { acknowledgeDowngrade: accepted ? 'true' : 'false' });
            showNotification({ type: ok ? 'success' : 'error', title: ok ? 'World imported' : 'Not imported', message: body.message ?? '' });
            if (ok) { setFile(null); setCheck(null); setAccepted(false); }
        } catch {
            showNotification({ type: 'error', title: 'Not imported', message: 'The upload failed.' });
        } finally {
            setBusy(false);
        }
    };

    const status = check?.judgement.status;
    const ready = !!check && status !== 'blocked' && (status !== 'downgrade' || accepted) && !running && canUpload;

    return (
        <div className={styles.wrap}>
            <p className={styles.muted}>Upload a zipped world to replace the current one{version ? ` (this server runs ${version})` : ''}. The old world is kept in the backups folder. Worlds from before 1.17, from 1.17 to 1.21 and from 26.1 on are different formats, and a world can only be used by a server of the same group.</p>
            {running && <div className={`${styles.notice} ${styles.error}`}>Stop the server before replacing its world.</div>}
            <div
                className={`${styles.drop} ${over ? styles.over : ''} ${canUpload ? '' : styles.locked}`}
                onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={event => { event.preventDefault(); setOver(false); if (canUpload) void pick(event.dataTransfer.files[0]); }}
                onClick={() => canUpload && input.current?.click()}
            >
                <FaCloudUploadAlt /> {canUpload ? (file ? file.name : 'Drop a world .zip here, or click to pick it') : 'Uploading is switched off for this server. Turn it on in the Files tab.'}
                <input ref={input} type="file" accept=".zip" hidden onChange={event => { void pick(event.target.files?.[0]); event.target.value = ''; }} />
            </div>

            {busy && <div className={styles.muted}>Working…</div>}
            {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}

            {check && <WorldVerdict judgement={check.judgement} levelName={check.levelName} accepted={accepted} onAccept={setAccepted} />}

            <div className={styles.row}>
                <button className={`${styles.btn} ${status === 'downgrade' ? styles.red : styles.primary}`} disabled={!ready || busy} onClick={() => void install()}>
                    {status === 'downgrade' ? 'Import anyway' : 'Import world'}
                </button>
            </div>
        </div>
    );
}
