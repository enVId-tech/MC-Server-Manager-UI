'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { postJson, type ServerStatus } from './types';

/** Live output of the container with a command line. Output refreshes every few seconds while the tab is open. */
export default function ConsoleTab({ uniqueId, status }: { uniqueId: string; status: ServerStatus }) {
    const { showNotification } = useNotifications();
    const [logs, setLogs] = useState('');
    const [command, setCommand] = useState('');
    const [sending, setSending] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const response = await fetch(`/api/server/logs?uniqueId=${encodeURIComponent(uniqueId)}&tail=300`);
            if (!response.ok) return;
            const data = await response.json();
            setLogs(String(data.logs ?? ''));
        } catch {
            // The next refresh tries again
        }
    }, [uniqueId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the tab opens or the folder changes
        void load();
        const timer = setInterval(() => void load(), 4000);
        return () => clearInterval(timer);
    }, [load]);

    useEffect(() => {
        const target = outputRef.current;
        if (target) target.scrollTop = target.scrollHeight;
    }, [logs]);

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        const text = command.trim();
        if (!text) return;
        setSending(true);
        const { ok, body } = await postJson('/api/server/command', { uniqueId, command: text });
        setSending(false);
        if (!ok) {
            showNotification({ type: 'error', title: 'Command failed', message: body.message ?? 'The command could not be sent.' });
            return;
        }
        setCommand('');
        setTimeout(() => void load(), 800);
    };

    const online = status === 'online';
    return (
        <div className={styles.console}>
            <div className={styles.output} ref={outputRef}>
                <pre>{logs || 'No output yet.'}</pre>
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
