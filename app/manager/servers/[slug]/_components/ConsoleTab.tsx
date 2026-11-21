'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { postJson, type ServerStatus } from './types';

const INTERVALS = [1, 5, 10] as const;
const SETTINGS_KEY = 'console-refresh';

/** Refresh choice of the person, kept in this browser only */
function loadRefresh(): { enabled: boolean; seconds: number } {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { enabled?: boolean; seconds?: number };
        return { enabled: saved.enabled !== false, seconds: (INTERVALS as readonly number[]).includes(saved.seconds ?? 0) ? saved.seconds! : 5 };
    } catch {
        return { enabled: true, seconds: 5 };
    }
}

/** Live output of the container with a command line. Output refreshes at the chosen rate while the tab is open. */
export default function ConsoleTab({ uniqueId, status }: { uniqueId: string; status: ServerStatus }) {
    const { showNotification } = useNotifications();
    const [logs, setLogs] = useState('');
    const [command, setCommand] = useState('');
    const [sending, setSending] = useState(false);
    /** Commands sent in this visit with what the server answered; the server log does not hold the answers */
    const [sent, setSent] = useState<Array<{ command: string; output: string; failed: boolean }>>([]);
    const outputRef = useRef<HTMLDivElement>(null);
    const [refresh, setRefresh] = useState<{ enabled: boolean; seconds: number }>({ enabled: true, seconds: 5 });
    /** True while the view sits at the bottom; only then new output scrolls into view */
    const [following, setFollowing] = useState(true);
    const followingRef = useRef(true);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved choice once in the browser
        setRefresh(loadRefresh());
    }, []);

    const changeRefresh = (next: { enabled: boolean; seconds: number }) => {
        setRefresh(next);
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* the choice just is not kept */ }
    };

    const load = useCallback(async () => {
        try {
            const response = await fetch(`/api/server/logs?uniqueId=${encodeURIComponent(uniqueId)}&tail=300`);
            if (!response.ok) return;
            const data = await response.json();
            // Every command opens and closes an RCON connection, which the server logs; that is not worth showing
            setLogs(String(data.logs ?? '').split('\n').filter(line => !/Thread RCON Client .* (started|shutting down)/.test(line)).join('\n'));
        } catch {
            // The next refresh tries again
        }
    }, [uniqueId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the tab opens or the folder changes
        void load();
        if (!refresh.enabled) return;
        const timer = setInterval(() => void load(), refresh.seconds * 1000);
        return () => clearInterval(timer);
    }, [load, refresh]);

    const scrollToEnd = useCallback(() => {
        const target = outputRef.current;
        if (target) target.scrollTop = target.scrollHeight;
    }, []);

    useEffect(() => {
        if (followingRef.current) scrollToEnd();
    }, [logs, sent, scrollToEnd]);

    const onScroll = () => {
        const target = outputRef.current;
        if (!target) return;
        const atEnd = target.scrollHeight - target.scrollTop - target.clientHeight < 24;
        followingRef.current = atEnd;
        setFollowing(atEnd);
    };

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        const text = command.trim();
        if (!text) return;
        setSending(true);
        const { ok, body } = await postJson<{ output?: string; failed?: boolean }>('/api/server/command', { uniqueId, command: text });
        setSending(false);
        if (!ok) {
            showNotification({ type: 'error', title: 'Command failed', message: body.message ?? 'The command could not be sent.' });
            return;
        }
        setSent(previous => [...previous, { command: text, output: body.output ?? '', failed: Boolean(body.failed) }].slice(-50));
        setCommand('');
        // Sending a command is a wish to see its answer
        followingRef.current = true;
        setFollowing(true);
        setTimeout(() => void load(), 800);
    };

    const online = status === 'online';
    return (
        <div className={styles.console}>
            <div className={styles.consoleBar}>
                <label>
                    <input type="checkbox" checked={refresh.enabled} onChange={event => changeRefresh({ ...refresh, enabled: event.target.checked })} /> Auto refresh
                </label>
                <select
                    className={styles.input}
                    value={refresh.seconds}
                    disabled={!refresh.enabled}
                    onChange={event => changeRefresh({ ...refresh, seconds: Number(event.target.value) })}
                    aria-label="Refresh interval"
                >
                    {INTERVALS.map(seconds => <option key={seconds} value={seconds}>every {seconds}s</option>)}
                </select>
                {!refresh.enabled && <button type="button" className={styles.btn} onClick={() => void load()}>Refresh now</button>}
                {!following && <button type="button" className={styles.btn} onClick={() => { followingRef.current = true; setFollowing(true); scrollToEnd(); }}>Jump to latest</button>}
            </div>
            <div className={styles.output} ref={outputRef} onScroll={onScroll}>
                <pre>{logs || 'No output yet.'}</pre>
                {sent.length > 0 && (
                    <pre aria-label="Commands you sent">
                        {sent.map((entry, index) => (
                            <React.Fragment key={index}>
                                {`> ${entry.command}\n`}
                                {entry.failed ? `Failed: ${entry.output || 'the server did not answer'}\n` : `${entry.output || '(the server sent no reply; if the command prints to the log, look above)'}\n`}
                            </React.Fragment>
                        ))}
                    </pre>
                )}
            </div>
            <form onSubmit={send}>
                <input
                    className={styles.input}
                    value={command}
                    onChange={event => setCommand(event.target.value)}
                    placeholder={online ? 'Type a command' : 'Start the server to send commands'}
                    disabled={!online || sending}
                    aria-label="Console command"
                />
                <button className={`${styles.btn} ${styles.primary}`} type="submit" disabled={!online || sending || !command.trim()}>Send</button>
            </form>
        </div>
    );
}
