'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../admin.module.scss';
import { adminSend } from './shared';

interface Candidate {
    key: string;
    name: string;
    source: 'docker' | 'folder' | 'both';
    containerName?: string;
    state?: string;
    folderPath?: string;
    hostPath?: string;
    reachable: boolean;
    type: string;
    version: string;
    port?: number;
    memory?: string;
    networks: string[];
    velocityCompatible: boolean;
    notes: string[];
}

interface ImportResult {
    key: string;
    success: boolean;
    subdomain?: string;
    error?: string;
    notes: string[];
}

const SOURCE_LABEL: Record<Candidate['source'], string> = {
    docker: 'Container',
    folder: 'Folder',
    both: 'Container + folder',
};

export default function ImportPanel({ onImported }: { onImported: () => void }) {
    const { showNotification } = useNotifications();
    const [candidates, setCandidates] = useState<Candidate[] | null>(null);
    const [scanFolders, setScanFolders] = useState<string[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [scanning, setScanning] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ownerEmail, setOwnerEmail] = useState('');
    const [results, setResults] = useState<ImportResult[]>([]);

    const scan = async () => {
        setScanning(true);
        setError(null);
        setResults([]);
        try {
            const response = await fetch('/api/admin/import');
            const body = await response.json();
            if (!response.ok) throw new Error(body.message || 'The search failed');
            setCandidates(body.candidates as Candidate[]);
            setScanFolders(body.scanFolders as string[]);
            // Everything that can be managed is pre-selected
            setSelected(new Set((body.candidates as Candidate[]).filter(candidate => candidate.reachable).map(candidate => candidate.key)));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'The search failed');
        } finally {
            setScanning(false);
        }
    };

    const toggle = (key: string) => {
        setSelected(previous => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const runImport = async () => {
        setImporting(true);
        setError(null);
        const { ok, body } = await adminSend<{ results?: ImportResult[] }>('/api/admin/import', 'POST', {
            keys: [...selected],
            ownerEmail: ownerEmail.trim() || undefined,
        });
        setImporting(false);

        const imported = body.results ?? [];
        setResults(imported);
        if (!ok && imported.length === 0) {
            setError(body.message || 'The import failed');
            return;
        }

        const succeeded = imported.filter(result => result.success).length;
        showNotification({
            type: succeeded > 0 ? 'success' : 'error',
            title: 'Import finished',
            message: body.message || `Imported ${succeeded} server${succeeded === 1 ? '' : 's'}.`,
        });
        if (succeeded > 0) {
            onImported();
            await scan();
        }
    };

    return (
        <section className={`${styles.card} ${styles.flush}`}>
            <div className={styles.cardHeader}>
                <div>
                    <h2>Import existing servers</h2>
                    <p className={styles.hint}>
                        Finds Minecraft containers and server folders that are not in the dashboard yet. Their files and containers are not changed.
                    </p>
                </div>
                <button className={`${styles.btn} ${styles.primary}`} onClick={() => void scan()} disabled={scanning}>
                    {scanning ? 'Searching…' : candidates ? 'Search again' : 'Find servers'}
                </button>
            </div>

            {error && <div className={`${styles.notice} ${styles.error}`} style={{ margin: '1rem 1.25rem' }}>{error}</div>}

            {candidates && candidates.length === 0 && !error && (
                <div className={styles.empty}>
                    Nothing new was found{scanFolders.length > 0 ? ` in the storage folder and ${scanFolders.join(', ')}` : ' in the storage folder'}.
                    <br />
                    Folders outside the storage folder are searched when they are listed in <span className={styles.mono}>IMPORT_SCAN_PATHS</span>.
                </div>
            )}

            {candidates && candidates.length > 0 && (
                <>
                    {candidates.map(candidate => (
                        <div key={candidate.key} className={styles.importRow}>
                            <input
                                type="checkbox"
                                checked={selected.has(candidate.key)}
                                disabled={!candidate.reachable}
                                onChange={() => toggle(candidate.key)}
                                aria-label={`Import ${candidate.name}`}
                            />
                            <div>
                                <div className={styles.primaryText}>{candidate.name}</div>
                                <div className={styles.mutedText}>
                                    <span className={styles.mono}>{candidate.folderPath ?? candidate.hostPath ?? 'folder not reachable'}</span>
                                </div>
                                <div className={styles.importMeta}>
                                    <span className={`${styles.badge} ${styles.info}`}>{SOURCE_LABEL[candidate.source]}</span>
                                    <span className={styles.badge}>{candidate.type} {candidate.version}</span>
                                    {candidate.state && <span className={`${styles.badge} ${candidate.state === 'running' ? styles.ok : ''}`}>{candidate.state}</span>}
                                    {candidate.port && <span className={styles.badge}>port {candidate.port}</span>}
                                    {!candidate.velocityCompatible && <span className={`${styles.badge} ${styles.warn}`}>no Velocity hookup</span>}
                                    {!candidate.reachable && <span className={`${styles.badge} ${styles.bad}`}>files not reachable</span>}
                                </div>
                                {candidate.notes.length > 0 && (
                                    <ul className={styles.importNotes}>
                                        {candidate.notes.map(note => <li key={note}>{note}</li>)}
                                    </ul>
                                )}
                                {results.filter(result => result.key === candidate.key).map(result => (
                                    <div key={result.key} className={`${styles.notice} ${result.success ? styles.success : styles.error}`} style={{ marginTop: '0.5rem' }}>
                                        {result.success ? `Imported as ${result.subdomain}` : result.error}
                                    </div>
                                ))}
                            </div>
                            <span className={styles.mutedText}>{candidate.containerName ?? ''}</span>
                        </div>
                    ))}

                    <div className={styles.toolbar} style={{ borderTop: '1px solid #4a5568', borderBottom: 'none' }}>
                        <label className={`${styles.field} ${styles.grow}`}>
                            Owner (email, defaults to you)
                            <input className={styles.input} value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} placeholder="owner@example.com" />
                        </label>
                        <button className={`${styles.btn} ${styles.primary}`} onClick={() => void runImport()} disabled={importing || selected.size === 0}>
                            {importing ? 'Importing…' : `Import ${selected.size} server${selected.size === 1 ? '' : 's'}`}
                        </button>
                    </div>
                </>
            )}
        </section>
    );
}
