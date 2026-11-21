'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { postJson, type ServerStatus } from './types';
import { flavorOf } from '@/lib/console/commands';
import { complete, namesInLog } from '@/lib/console/complete';

const INTERVALS = [1, 5, 10] as const;
const SETTINGS_KEY = 'console-refresh';
const HISTORY_KEY = 'console-history';
const HISTORY_SIZE = 100;
/** How long the players that were asked for stay good for the suggestions */
const PLAYERS_MAX_AGE_MS = 10000;

function loadHistory(uniqueId: string): string[] {
    try {
        const saved = JSON.parse(localStorage.getItem(`${HISTORY_KEY}:${uniqueId}`) ?? '[]') as unknown;
        return Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === 'string').slice(-HISTORY_SIZE) : [];
    } catch {
        return [];
    }
}

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
export default function ConsoleTab({ uniqueId, status, kind = 'server', serverType, version }: { uniqueId: string; status: ServerStatus; kind?: 'server' | 'proxy'; serverType?: string; version?: string }) {
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
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    /** Commands of earlier visits and this one, oldest first */
    const [history, setHistory] = useState<string[]>([]);
    /** Which of them is shown while the arrows are used; null when the line is the person's own */
    const [historyIndex, setHistoryIndex] = useState<number | null>(null);
    /** The words that were typed before Tab or the arrows filled one in, and which suggestion is filled in now */
    const [cycle, setCycle] = useState<{ base: string; index: number } | null>(null);
    const [focused, setFocused] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [onlinePlayers, setOnlinePlayers] = useState<string[]>([]);
    const playersAskedAt = useRef(0);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved choices once in the browser
        setRefresh(loadRefresh());
        setHistory(loadHistory(uniqueId));
    }, [uniqueId]);

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

    // Players for the arguments that take one: those on the server now, then those seen in the log
    const players = useMemo(() => [...onlinePlayers, ...namesInLog(logs).filter(name => !onlinePlayers.includes(name))], [onlinePlayers, logs]);
    const context = useMemo(() => ({ version, flavor: flavorOf(serverType, kind), players }), [version, serverType, kind, players]);
    /** The suggestions are for the words as they were typed, also while one of them is filled in */
    const source = cycle ? cycle.base : command;
    const completion = useMemo(() => complete(source, context), [source, context]);
    const browsing = historyIndex !== null;
    const listOpen = focused && !dismissed && !browsing && completion.suggestions.length > 0;

    const askPlayers = useCallback(async () => {
        if (Date.now() - playersAskedAt.current < PLAYERS_MAX_AGE_MS) return;
        playersAskedAt.current = Date.now();
        try {
            const response = await fetch(`/api/server/players?uniqueId=${encodeURIComponent(uniqueId)}`);
            if (response.ok) setOnlinePlayers(((await response.json()).names ?? []) as string[]);
        } catch {
            // the names in the log still work
        }
    }, [uniqueId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- asks for the players when an argument needs them
        if (focused && status === 'online' && completion.needs === 'players') void askPlayers();
    }, [focused, status, completion.needs, askPlayers]);

    // The filled in suggestion stays in view
    useEffect(() => {
        if (cycle) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [cycle]);

    /** Puts a suggestion into the line. Nothing is sent. */
    const fill = (index: number) => {
        const suggestions = completion.suggestions;
        if (suggestions.length === 0) return;
        const wrapped = ((index % suggestions.length) + suggestions.length) % suggestions.length;
        setCycle({ base: source, index: wrapped });
        setCommand(source.slice(0, completion.start) + suggestions[wrapped].text);
        setDismissed(false);
    };

    const remember = (text: string) => {
        setHistory(previous => {
            const next = (previous[previous.length - 1] === text ? previous : [...previous, text]).slice(-HISTORY_SIZE);
            try { localStorage.setItem(`${HISTORY_KEY}:${uniqueId}`, JSON.stringify(next)); } catch { /* it just is not kept */ }
            return next;
        });
    };

    const showHistory = (index: number | null) => {
        setHistoryIndex(index);
        setCycle(null);
        setCommand(index === null ? '' : history[index]);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') { setDismissed(true); return; }
        if (event.key === 'Tab') {
            // Tab fills in the first suggestion, and every further Tab the next; Shift+Tab goes back
            if (completion.suggestions.length === 0 || (!command && !event.shiftKey)) return;
            event.preventDefault();
            fill(cycle ? cycle.index + (event.shiftKey ? -1 : 1) : event.shiftKey ? completion.suggestions.length - 1 : 0);
            return;
        }
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        const up = event.key === 'ArrowUp';
        if (listOpen) {
            // The arrows walk the list while there is one, the same as Tab
            event.preventDefault();
            fill(cycle ? cycle.index + (up ? -1 : 1) : up ? completion.suggestions.length - 1 : 0);
        } else if (history.length > 0 && (command === '' || browsing)) {
            // With nothing typed the arrows go through the commands that were sent: up is older, down is newer
            event.preventDefault();
            if (up) showHistory(historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1));
            else if (historyIndex !== null) showHistory(historyIndex + 1 < history.length ? historyIndex + 1 : null);
        }
    };

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        const text = command.trim();
        if (!text) return;
        setSending(true);
        const { ok, body } = await postJson<{ output?: string; failed?: boolean }>('/api/server/command', { uniqueId, command: text });
        setSending(false);
        setCycle(null);
        setHistoryIndex(null);
        if (!ok) {
            showNotification({ type: 'error', title: 'Command failed', message: body.message ?? 'The command could not be sent.' });
            return;
        }
        remember(text);
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
                {(listOpen || (focused && !dismissed && !browsing && completion.hint)) && (
                    <div className={styles.suggest}>
                        {listOpen ? (
                            <ul id="console-suggestions" role="listbox" ref={listRef} aria-label="Suggestions">
                                {completion.suggestions.map((suggestion, index) => (
                                    <li
                                        key={suggestion.text}
                                        id={`console-suggestion-${index}`}
                                        role="option"
                                        aria-selected={cycle?.index === index}
                                        className={cycle?.index === index ? styles.active : undefined}
                                        // mouse down, not click, so the input keeps its focus and the list does not close first
                                        onMouseDown={event => { event.preventDefault(); fill(index); inputRef.current?.focus(); }}
                                    >
                                        <span>{suggestion.text}</span>
                                        {suggestion.detail && <span className={styles.detail}>{suggestion.detail}</span>}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <span className={styles.detail}>{completion.hint}</span>
                        )}
                        <div className={styles.usage}>
                            {completion.usage ? `${completion.usage}  ·  ` : ''}Tab or ↑ ↓ to choose, Esc to close
                        </div>
                    </div>
                )}
                <input
                    ref={inputRef}
                    className={styles.input}
                    value={command}
                    onChange={event => { setCommand(event.target.value); setCycle(null); setHistoryIndex(null); setDismissed(false); }}
                    onKeyDown={onKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={online ? 'Type a command (Tab completes, ↑ shows earlier commands)' : 'Start the server to send commands'}
                    disabled={!online || sending}
                    aria-label="Console command"
                    role="combobox"
                    aria-expanded={listOpen}
                    aria-controls="console-suggestions"
                    aria-activedescendant={cycle ? `console-suggestion-${cycle.index}` : undefined}
                    autoComplete="off"
                    spellCheck={false}
                />
                <button className={`${styles.btn} ${styles.primary}`} type="submit" disabled={!online || sending || !command.trim()}>Send</button>
            </form>
        </div>
    );
}
