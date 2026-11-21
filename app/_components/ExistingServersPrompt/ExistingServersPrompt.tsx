'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './ExistingServersPrompt.module.scss';

interface Pending {
    key: string;
    name: string;
    type: string;
    version: string;
    source: string;
    state?: string;
}

interface Owner {
    email: string;
    isAdmin: boolean;
}

const DISMISSED = 'mcsm-existing-servers-dismissed';

/**
 * Shown to an administrator who logs in while servers exist on this machine that are not in the dashboard yet.
 * With a single administrator they were added already; with several, this asks which account gets them.
 */
export default function ExistingServersPrompt() {
    const pathname = usePathname();
    const [pending, setPending] = useState<Pending[]>([]);
    const [owners, setOwners] = useState<Owner[]>([]);
    const [you, setYou] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [owner, setOwner] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (pathname.startsWith('/auth') || sessionStorage.getItem(DISMISSED) === '1') return;
        let cancelled = false;
        void (async () => {
            try {
                const session = await fetch('/api/auth/check');
                const info = session.ok ? await session.json() : null;
                if (!info?.isAdmin || info.impersonating) return;
                const response = await fetch('/api/admin/import/pending');
                const data = response.ok ? await response.json() : null;
                if (cancelled || !data || !Array.isArray(data.pending) || data.pending.length === 0) return;
                setPending(data.pending);
                setOwners(data.owners ?? []);
                setYou(data.you ?? '');
                setOwner(data.you ?? '');
                setSelected(new Set(data.pending.map((item: Pending) => item.key)));
            } catch {
                // nothing to ask
            }
        })();
        return () => { cancelled = true; };
    }, [pathname]);

    if (pending.length === 0) return null;

    const close = () => {
        sessionStorage.setItem(DISMISSED, '1');
        setPending([]);
    };

    const send = async (payload: Record<string, unknown>, done: string) => {
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/admin/import/pending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(data.message ?? 'That did not work.');
                return;
            }
            setPending(current => current.filter(item => !(payload.keys as string[] | undefined ?? payload.ignore as string[]).includes(item.key)));
            if (done) window.location.reload();
        } finally {
            setBusy(false);
        }
    };

    // Nothing chosen means everything goes to the administrator who is looking at this
    const chosen = selected.size > 0 ? [...selected] : pending.map(item => item.key);

    return (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Existing servers found">
            <div className={styles.dialog}>
                <h2>{pending.length} existing server{pending.length === 1 ? '' : 's'} found</h2>
                <p>These Minecraft servers already run on this machine but are not in the dashboard. Pick the account they should belong to. Their files and containers are not changed.</p>
                <ul className={styles.list}>
                    {pending.map(item => (
                        <li key={item.key}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selected.has(item.key)}
                                    onChange={event => setSelected(current => {
                                        const next = new Set(current);
                                        if (event.target.checked) next.add(item.key); else next.delete(item.key);
                                        return next;
                                    })}
                                />
                                <span>{item.name}</span>
                                <span className={styles.meta}>{item.type} {item.version !== 'LATEST' ? item.version : ''}{item.state ? ` · ${item.state}` : ''}</span>
                            </label>
                        </li>
                    ))}
                </ul>
                <label className={styles.owner}>
                    Add them to
                    <select value={owner} onChange={event => setOwner(event.target.value)}>
                        {owners.map(choice => <option key={choice.email} value={choice.email}>{choice.email}{choice.email === you ? ' (you)' : ''}{choice.isAdmin ? ' · admin' : ''}</option>)}
                    </select>
                </label>
                {error && <p className={styles.error}>{error}</p>}
                <div className={styles.actions}>
                    <button disabled={busy} onClick={() => void send({ ignore: chosen }, '')}>Never ask about {selected.size > 0 ? 'these' : 'any of them'}</button>
                    <button disabled={busy} onClick={close}>Not now</button>
                    <button className={styles.primary} disabled={busy} onClick={() => void send({ keys: chosen, ownerEmail: owner || you }, 'reload')}>
                        Add {selected.size > 0 ? selected.size : pending.length} to {owner === you || !owner ? 'my account' : owner}
                    </button>
                </div>
            </div>
        </div>
    );
}
