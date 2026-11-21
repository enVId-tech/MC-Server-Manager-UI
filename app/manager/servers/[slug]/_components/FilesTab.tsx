'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FaFile, FaFolder, FaTrash } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import ConfigEditor from '@/app/_components/ConfigEditor/ConfigEditor';
import { detectConfigFormat } from '@/lib/data/configFiles';
import styles from '../dashboard.module.scss';
import { postJson } from './types';

interface FileItem {
    name: string;
    type: 'file' | 'folder';
    path: string;
    size?: number;
}

function formatSize(bytes?: number): string {
    if (bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilesTab({ slug, uniqueId, version }: { slug: string; uniqueId: string; version?: string }) {
    const { showNotification, showConfirmDialog } = useNotifications();
    const [path, setPath] = useState('/');
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const [selected, setSelected] = useState<FileItem | null>(null);
    const [content, setContent] = useState('');
    const [original, setOriginal] = useState('');
    const [form, setForm] = useState(true);
    const [saving, setSaving] = useState(false);
    const dirty = content !== original;

    const list = useCallback(async (target: string) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/server/files?domainName=${encodeURIComponent(slug)}&path=${encodeURIComponent(target)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'The files could not be listed.');
            setFiles(data.files ?? []);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'The files could not be listed.');
        } finally {
            setLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the tab opens or the folder changes
        void list(path);
    }, [list, path]);

    const confirmLeave = (action: () => void) => {
        if (!dirty) return action();
        showConfirmDialog({
            title: 'Unsaved changes',
            message: 'The changes to this file will be lost.',
            confirmText: 'Discard',
            cancelText: 'Keep editing',
            variant: 'danger',
            onConfirm: action,
        });
    };

    const open = (file: FileItem) => confirmLeave(async () => {
        if (file.type === 'folder') {
            setSelected(null);
            setPath(file.path);
            return;
        }
        setSelected(file);
        setForm(true);
        try {
            const response = await fetch(`/api/server/file?server=${encodeURIComponent(slug)}&file=${encodeURIComponent(file.path)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'The file could not be opened.');
            setContent(data.content ?? '');
            setOriginal(data.content ?? '');
        } catch (caught) {
            setSelected(null);
            showNotification({ type: 'error', title: 'Cannot open the file', message: caught instanceof Error ? caught.message : 'Unknown error' });
        }
    });

    const save = async () => {
        if (!selected) return;
        setSaving(true);
        const { ok, body } = await postJson('/api/server/file', { uniqueId, filePath: selected.path, content });
        setSaving(false);
        if (!ok) {
            showNotification({ type: 'error', title: 'Not saved', message: body.message ?? 'The file could not be saved.' });
            return;
        }
        setOriginal(content);
        showNotification({ type: 'success', title: 'Saved', message: selected.name });
    };

    const create = (type: 'file' | 'folder') => {
        const name = window.prompt(type === 'file' ? 'Name of the new file' : 'Name of the new folder')?.trim();
        if (!name) return;
        void (async () => {
            const { ok, body } = await postJson('/api/server/file-manager', { serverSlug: slug, path, name, type, content: type === 'file' ? '' : undefined });
            if (!ok) showNotification({ type: 'error', title: 'Not created', message: body.message ?? 'Failed.' });
            await list(path);
        })();
    };

    const remove = (file: FileItem) => showConfirmDialog({
        title: `Delete ${file.name}`,
        message: `${file.type === 'folder' ? 'The folder and everything in it' : 'The file'} will be deleted. This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'danger',
        onConfirm: async () => {
            const { ok, body } = await postJson('/api/server/file-manager', { serverSlug: slug, path: file.path, type: file.type }, 'DELETE');
            if (!ok) showNotification({ type: 'error', title: 'Not deleted', message: body.message ?? 'Failed.' });
            if (selected?.path === file.path) {
                setSelected(null);
                setContent('');
                setOriginal('');
            }
            await list(path);
        },
    });

    const crumbs = path.split('/').filter(Boolean);
    const shown = files
        .filter(file => file.name.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
    const format = selected ? detectConfigFormat(selected.name) : null;

    return (
        <div className={styles.files}>
            <section className={styles.card}>
                <div className={styles.crumbs}>
                    <button onClick={() => confirmLeave(() => setPath('/'))}>root</button>
                    {crumbs.map((part, index) => (
                        <React.Fragment key={index}>
                            <span className={styles.muted}>/</span>
                            <button onClick={() => confirmLeave(() => setPath('/' + crumbs.slice(0, index + 1).join('/')))}>{part}</button>
                        </React.Fragment>
                    ))}
                </div>
                <div className={styles.toolbar}>
                    <input className={styles.input} placeholder="Filter" value={filter} onChange={event => setFilter(event.target.value)} style={{ flex: 1 }} aria-label="Filter files" />
                    <button className={`${styles.btn} ${styles.small}`} onClick={() => create('file')}><FaFile /> New</button>
                    <button className={`${styles.btn} ${styles.small}`} onClick={() => create('folder')}><FaFolder /> New</button>
                </div>
                {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
                <div className={styles.fileList}>
                    {loading && <div className={styles.loading}>Loading…</div>}
                    {!loading && shown.length === 0 && !error && <div className={styles.empty}>This folder is empty.</div>}
                    {!loading && shown.map(file => (
                        <div key={file.path} className={`${styles.fileRow} ${selected?.path === file.path ? styles.selected : ''}`} onClick={() => open(file)}>
                            <span className={styles.name}>
                                {file.type === 'folder' ? <FaFolder color="#ecc94b" /> : <FaFile color="#a0aec0" />}
                                <span>{file.name}</span>
                            </span>
                            <span className={styles.muted} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                                {formatSize(file.size)}
                                <button className={`${styles.btn} ${styles.small} ${styles.danger}`} aria-label={`Delete ${file.name}`} onClick={event => { event.stopPropagation(); remove(file); }}><FaTrash /></button>
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section className={styles.card}>
                {selected ? (
                    <>
                        <div className={styles.toolbar}>
                            <strong>{selected.name}{dirty ? ' •' : ''}</strong>
                            <span style={{ display: 'flex', gap: '0.5rem' }}>
                                {format && (
                                    <button className={`${styles.btn} ${styles.small}`} onClick={() => setForm(value => !value)}>{form ? 'Edit as text' : 'Edit as form'}</button>
                                )}
                                <button className={`${styles.btn} ${styles.small} ${styles.primary}`} disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
                            </span>
                        </div>
                        {format && form ? (
                            <ConfigEditor format={format} content={content} onChange={setContent} version={version} />
                        ) : (
                            <textarea className={styles.editor} value={content} onChange={event => setContent(event.target.value)} spellCheck={false} aria-label={`Contents of ${selected.name}`} />
                        )}
                    </>
                ) : (
                    <div className={styles.empty}>Select a file to view or edit it.</div>
                )}
            </section>
        </div>
    );
}
