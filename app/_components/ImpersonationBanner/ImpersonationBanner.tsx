'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './ImpersonationBanner.module.scss';

interface State {
    as: string;
    by: string;
    mode: 'preview' | 'user' | 'admin';
}

const LABEL: Record<State['mode'], string> = {
    preview: 'Viewing the site as a regular user',
    user: 'Acting as',
    admin: 'Acting on behalf of',
};

/** Bar shown at the bottom of every page while an administrator is acting as somebody else */
export default function ImpersonationBanner() {
    const pathname = usePathname();
    const [state, setState] = useState<State | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await fetch('/api/auth/check');
                const data = response.ok ? await response.json() : null;
                if (!cancelled) setState(data?.impersonating ?? null);
            } catch {
                if (!cancelled) setState(null);
            }
        })();
        return () => { cancelled = true; };
    }, [pathname]);

    if (!state) return null;

    const stop = async () => {
        setBusy(true);
        await fetch('/api/admin/impersonate', { method: 'DELETE' });
        window.location.assign('/admin');
    };

    return (
        <div className={styles.banner} role="status">
            <span>
                <strong>{LABEL[state.mode]}</strong>{state.mode === 'preview' ? '' : ` ${state.as}`}
                {state.mode === 'user' && ' with their permissions'}
                {state.mode === 'admin' && ' with administrator rights'}
            </span>
            <button onClick={() => void stop()} disabled={busy}>{busy ? 'Stopping…' : 'Stop and go back to my account'}</button>
        </div>
    );
}
