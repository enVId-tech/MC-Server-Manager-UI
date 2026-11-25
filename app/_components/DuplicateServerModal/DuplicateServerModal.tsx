'use client';

import React, { useEffect, useState } from 'react';
import { FaClone, FaSpinner } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from './DuplicateServerModal.module.scss';

export interface DuplicatedServerSummary {
    id: string;
    uniqueId: string;
    serverName: string;
    subdomainName: string;
    folderPath: string;
    port: number;
    rconPort?: number;
    serverType: string;
    version: string;
    maxPlayers: number;
    isOnline: string;
}

interface DuplicateServerModalProps {
    open: boolean;
    sourceId: string | null;
    sourceName: string;
    sourceAddress?: string;
    onClose: () => void;
    onDuplicated: (server: DuplicatedServerSummary) => void;
}

const SUBDOMAIN_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default function DuplicateServerModal({
    open,
    sourceId,
    sourceName,
    sourceAddress,
    onClose,
    onDuplicated,
}: DuplicateServerModalProps) {
    if (!open || !sourceId) return null;

    return (
        <DuplicateServerForm
            key={sourceId}
            sourceId={sourceId}
            sourceName={sourceName}
            sourceAddress={sourceAddress}
            onClose={onClose}
            onDuplicated={onDuplicated}
        />
    );
}

function DuplicateServerForm({
    sourceId,
    sourceName,
    sourceAddress,
    onClose,
    onDuplicated,
}: Omit<DuplicateServerModalProps, 'open' | 'sourceId'> & { sourceId: string }) {
    const { showNotification } = useNotifications();
    const [name, setName] = useState(`${sourceName} (Copy)`.slice(0, 50));
    const [subdomain, setSubdomain] = useState('');
    const [serverDomain, setServerDomain] = useState('');
    const [resolvedSourceAddress, setResolvedSourceAddress] = useState(sourceAddress ?? '');
    const [startAfterCreate, setStartAfterCreate] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch(`/api/server/duplicate?source=${encodeURIComponent(sourceId)}`)
            .then(async response => {
                const body = await response.json().catch(() => ({}));
                if (cancelled) return;
                if (response.ok) {
                    setName(body.suggestedName ?? `${sourceName} (Copy)`.slice(0, 50));
                    setSubdomain(body.suggestedSubdomain ?? '');
                    setServerDomain(body.serverDomain ?? '');
                    if (typeof body.sourceAddress === 'string') {
                        setResolvedSourceAddress(body.sourceAddress);
                    }
                } else {
                    setError(body.message ?? 'Could not load duplicate defaults.');
                }
            })
            .catch(() => undefined)
            .finally(() => {
                if (!cancelled) setLoadingSuggestions(false);
            });

        return () => {
            cancelled = true;
        };
    }, [sourceId, sourceName]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !submitting) onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [submitting, onClose]);

    const fullPreviewAddress = serverDomain && subdomain
        ? `${subdomain.trim().toLowerCase()}.${serverDomain}`
        : subdomain.trim().toLowerCase();

    const matchesOriginalAddress = Boolean(
        resolvedSourceAddress &&
        fullPreviewAddress &&
        fullPreviewAddress.toLowerCase() === resolvedSourceAddress.toLowerCase()
    );

    const matchesOriginalName = name.trim().toLowerCase() === sourceName.trim().toLowerCase();

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting) return;

        const trimmedName = name.trim();
        const cleanedSubdomain = subdomain.trim().toLowerCase();

        if (!trimmedName) {
            setError('Please enter a name for the duplicated server.');
            return;
        }
        if (matchesOriginalName) {
            setError('The duplicated server must have a different name than the original server.');
            return;
        }
        if (!cleanedSubdomain || !SUBDOMAIN_PATTERN.test(cleanedSubdomain)) {
            setError('Subdomain can only contain lowercase letters, numbers, and hyphens.');
            return;
        }
        if (matchesOriginalAddress) {
            setError('The duplicated server must use a different IP/address than the original server.');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/server/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceId,
                    name: trimmedName,
                    subdomain: cleanedSubdomain,
                    startAfterCreate,
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = body.message || 'Could not duplicate the server.';
                setError(message);
                showNotification({ type: 'error', title: 'Duplicate Failed', message });
                return;
            }

            showNotification({
                type: 'success',
                title: 'Server Duplicated',
                message: `"${trimmedName}" was created at ${body.server?.subdomainName ?? fullPreviewAddress}.`,
            });
            onDuplicated(body.server as DuplicatedServerSummary);
            onClose();
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : 'Network error while duplicating server.';
            setError(message);
            showNotification({ type: 'error', title: 'Duplicate Failed', message });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={() => { if (!submitting) onClose(); }}>
            <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="duplicate-server-title"
                onClick={event => event.stopPropagation()}
            >
                <div className={styles.header}>
                    <span className={styles.icon}><FaClone aria-hidden="true" /></span>
                    <h2 id="duplicate-server-title" className={styles.title}>Duplicate Server</h2>
                </div>

                <div className={styles.sourceBox}>
                    <span>Source: <strong>{sourceName}</strong></span>
                    {resolvedSourceAddress && resolvedSourceAddress !== 'N/A' && (
                        <span>IP: <code>{resolvedSourceAddress}</code></span>
                    )}
                </div>

                <form className={styles.form} onSubmit={submit}>
                    <label className={styles.field}>
                        <span className={styles.label}>New server name</span>
                        <input
                            type="text"
                            className={styles.input}
                            value={name}
                            maxLength={50}
                            disabled={loadingSuggestions || submitting}
                            onChange={event => {
                                setName(event.target.value);
                                if (error) setError(null);
                            }}
                            placeholder="e.g. Survival (Copy)"
                            autoFocus
                        />
                        <p className={styles.hint}>Must be unique across server display names and folder names.</p>
                    </label>

                    <label className={styles.field}>
                        <span className={styles.label}>New server IP / address</span>
                        <div className={styles.addressWrap}>
                            <input
                                type="text"
                                className={styles.addressInput}
                                value={subdomain}
                                disabled={loadingSuggestions || submitting}
                                onChange={event => {
                                    setSubdomain(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                    if (error) setError(null);
                                }}
                                placeholder="e.g. survival-copy"
                            />
                            {serverDomain && <span className={styles.addressSuffix}>.{serverDomain}</span>}
                        </div>
                        <p className={styles.hint}>
                            Must differ from other servers. A separate container port and IP will also be allocated automatically.
                        </p>
                    </label>

                    <label className={styles.checkboxRow}>
                        <input
                            type="checkbox"
                            checked={startAfterCreate}
                            disabled={submitting}
                            onChange={event => setStartAfterCreate(event.target.checked)}
                        />
                        <span>Start duplicated server immediately</span>
                    </label>

                    {submitting && (
                        <div className={styles.progressNote}>
                            <FaSpinner className="fa-spin" aria-hidden="true" />
                            <span>Copying world, configs, and files to a new server container…</span>
                        </div>
                    )}

                    {error && <div className={styles.errorBox}>{error}</div>}

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={`${styles.button} ${styles.secondary}`}
                            disabled={submitting}
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className={`${styles.button} ${styles.primary}`}
                            disabled={loadingSuggestions || submitting || !name.trim() || !subdomain.trim()}
                        >
                            <FaClone aria-hidden="true" /> {submitting ? 'Duplicating…' : 'Duplicate Server'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
