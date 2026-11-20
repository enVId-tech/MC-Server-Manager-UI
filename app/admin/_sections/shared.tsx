'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AdminData<T> {
    data: T | null;
    error: string | null;
    loading: boolean;
    reload: () => Promise<void>;
}

/** Loads JSON from an admin endpoint and keeps the last good result while it reloads. */
export function useAdminData<T>(url: string | null): AdminData<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(Boolean(url));

    const load = useCallback(async () => {
        if (!url) return;
        setLoading(true);
        try {
            const response = await fetch(url);
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.message || body.error || `Request failed (${response.status})`);
            }
            setData(body as T);
            setError(null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Request failed');
        } finally {
            setLoading(false);
        }
    }, [url]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the request starts whenever the url changes
        void load();
    }, [load]);

    return { data, error, loading, reload: load };
}

/** POST/PATCH/DELETE helper that returns the parsed body and whether the request worked. */
export async function adminSend<T = Record<string, unknown>>(
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown
): Promise<{ ok: boolean; status: number; body: T & { message?: string; error?: string } }> {
    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body: parsed };
}
