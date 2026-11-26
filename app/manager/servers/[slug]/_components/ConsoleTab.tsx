'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaArrowDown, FaPaperPlane, FaSyncAlt } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { postJson, type ServerStatus } from './types';
import { flavorOf, type CommandDef } from '@/lib/console/commands';
import { complete, namesInLog } from '@/lib/console/complete';
import { parseColoredSegments, stripConsoleColors } from '@/lib/console/colors';

const INTERVALS = [1, 5, 10] as const;
const DEFAULT_LOG_LINES = 500;
const LOG_LIMIT_STEPS: Array<number | 'all'> = [500, 2000, 5000, 'all'];
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

/** Renders ANSI / Minecraft §-colored text chunks cleanly as inline styled spans. */
const ColoredText = React.memo(function ColoredText({ text }: { text: string }) {
    const segments = useMemo(() => parseColoredSegments(text), [text]);
    return (
        <>
            {segments.map((segment, index) => {
                const decorations: string[] = [];
                if (segment.underline) decorations.push('underline');
                if (segment.strikethrough) decorations.push('line-through');
                const style: React.CSSProperties = {
                    ...(segment.color ? { color: segment.color } : {}),
                    ...(segment.backgroundColor ? { backgroundColor: segment.backgroundColor } : {}),
                    ...(segment.bold ? { fontWeight: 700 } : {}),
                    ...(segment.dim ? { opacity: 0.72 } : {}),
                    ...(segment.italic ? { fontStyle: 'italic' } : {}),
                    ...(decorations.length ? { textDecoration: decorations.join(' ') } : {}),
                };
                return Object.keys(style).length > 0
                    ? <span key={index} style={style}>{segment.text}</span>
                    : <React.Fragment key={index}>{segment.text}</React.Fragment>;
            })}
        </>
    );
});

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
    const [extraCommands, setExtraCommands] = useState<CommandDef[]>([]);
    const [logLimit, setLogLimit] = useState<number | 'all'>(DEFAULT_LOG_LINES);
    const [hasMoreLogs, setHasMoreLogs] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const pendingScrollBottomOffset = useRef<number | null>(null);
    const playersAskedAt = useRef(0);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved choices once in the browser
        setRefresh(loadRefresh());
        setHistory(loadHistory(uniqueId));
        setLogLimit(DEFAULT_LOG_LINES);
        setHasMoreLogs(false);
    }, [uniqueId]);

    const changeRefresh = (next: { enabled: boolean; seconds: number }) => {
        setRefresh(next);
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* the choice just is not kept */ }
    };

    const load = useCallback(async (requestedLimit?: number | 'all', preserveScroll = false) => {
        const effectiveLimit = requestedLimit ?? logLimit;
        if (preserveScroll && outputRef.current && !followingRef.current) {
            pendingScrollBottomOffset.current = outputRef.current.scrollHeight - outputRef.current.scrollTop;
        }
        try {
            const response = await fetch(`/api/server/logs?uniqueId=${encodeURIComponent(uniqueId)}&tail=${effectiveLimit}`);
            if (!response.ok) return;
            const data = await response.json();
            // Every command opens and closes an RCON connection, which the server logs; that is not worth showing
            setLogs(String(data.logs ?? '').split('\n').filter(line => !/Thread RCON Client .* (started|shutting down)/.test(stripConsoleColors(line))).join('\n'));
            setHasMoreLogs(Boolean(data.hasMore));
        } catch {
            // The next refresh tries again
        } finally {
            setLoadingHistory(false);
        }
    }, [uniqueId, logLimit]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the tab opens, server changes, or limit changes
        void load();
        if (!refresh.enabled) return;
        const timer = setInterval(() => void load(), refresh.seconds * 1000);
        return () => clearInterval(timer);
    }, [load, refresh]);

    const changeLogLimit = (nextLimit: number | 'all') => {
        setLoadingHistory(true);
        setLogLimit(nextLimit);
        void load(nextLimit, true);
    };

    const nextLogLimit = LOG_LIMIT_STEPS[Math.min(LOG_LIMIT_STEPS.indexOf(logLimit) + 1, LOG_LIMIT_STEPS.length - 1)] ?? 'all';

    const scrollToEnd = useCallback(() => {
        const target = outputRef.current;
        if (target) target.scrollTop = target.scrollHeight;
    }, []);

    useEffect(() => {
        if (followingRef.current) {
            pendingScrollBottomOffset.current = null;
            scrollToEnd();
        } else if (pendingScrollBottomOffset.current !== null && outputRef.current) {
            outputRef.current.scrollTop = Math.max(0, outputRef.current.scrollHeight - pendingScrollBottomOffset.current);
            pendingScrollBottomOffset.current = null;
        }
    }, [logs, sent, scrollToEnd]);

    const onScroll = () => {
        const target = outputRef.current;
        if (!target) return;
        const atEnd = target.scrollHeight - target.scrollTop - target.clientHeight < 24;
        followingRef.current = atEnd;
        setFollowing(atEnd);
    };

    const loadCommands = useCallback(async (force = false): Promise<'live' | 'jar' | 'none' | null> => {
        try {
            const response = await fetch(`/api/server/commands?uniqueId=${encodeURIComponent(uniqueId)}${force ? '&refresh=1' : ''}`);
            if (!response.ok) return null;
            const data = await response.json();
            if (Array.isArray(data.commands)) {
                setExtraCommands(data.commands as CommandDef[]);
            }
            return (data.source ?? null) as 'live' | 'jar' | 'none' | null;
        } catch {
            return null;
        }
    }, [uniqueId]);

    useEffect(() => {
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads live plugin/server commands on mount or status change
        void loadCommands().then(source => {
            if (!cancelled && status === 'online' && source !== 'live') {
                retryTimer = setTimeout(() => {
                    if (!cancelled) void loadCommands(true);
                }, 8000);
            }
        });
        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [loadCommands, status]);

    // Players for the arguments that take one: those on the server now, then those seen in the log
    const players = useMemo(() => [...onlinePlayers, ...namesInLog(stripConsoleColors(logs)).filter(name => !onlinePlayers.includes(name))], [onlinePlayers, logs]);
    const context = useMemo(() => ({ version, flavor: flavorOf(serverType, kind), players, extraCommands }), [version, serverType, kind, players, extraCommands]);
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
        if (/^\/?(?:[a-z0-9_.-]+:)?(?:reload|rl|plugman)\b/i.test(text)) {
            setTimeout(() => void loadCommands(true), 1200);
        }
    };

    const online = status === 'online';
    return (
        <div className={styles.console}>
            <div className={styles.consoleBar}>
                <span className={`${styles.consoleStatus} ${online && refresh.enabled ? styles.live : ''}`}>
                    <i aria-hidden="true" />
                    {online ? (refresh.enabled ? `Live · ${refresh.seconds}s` : 'Manual') : 'Offline'}
                </span>
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
                <select
                    className={styles.input}
                    value={String(logLimit)}
                    onChange={event => {
                        const value = event.target.value === 'all' ? 'all' : Number(event.target.value);
                        changeLogLimit(value);
                    }}
                    aria-label="Log history limit"
                >
                    <option value="500">Last 500 lines</option>
                    <option value="2000">Last 2,000 lines</option>
                    <option value="5000">Last 5,000 lines</option>
                    <option value="all">All available</option>
                </select>
                <div className={styles.consoleActions}>
                    {!refresh.enabled && (
                        <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => void load()}>
                            <FaSyncAlt aria-hidden="true" /> Refresh now
                        </button>
                    )}
                    {!following && (
                        <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} onClick={() => { followingRef.current = true; setFollowing(true); scrollToEnd(); }}>
                            <FaArrowDown aria-hidden="true" /> Jump to latest
                        </button>
                    )}
                </div>
            </div>
            <div className={styles.output} ref={outputRef} onScroll={onScroll}>
                {hasMoreLogs && (
                    <div className={styles.historyBanner}>
                        <span>Showing the last {typeof logLimit === 'number' ? logLimit.toLocaleString() : '500'} lines of server history.</span>
                        <div className={styles.historyActions}>
                            {nextLogLimit !== 'all' && (
                                <button
                                    type="button"
                                    className={`${styles.btn} ${styles.small}`}
                                    disabled={loadingHistory}
                                    onClick={() => changeLogLimit(nextLogLimit)}
                                >
                                    {loadingHistory ? 'Loading...' : `Load last ${Number(nextLogLimit).toLocaleString()}`}
                                </button>
                            )}
                            <button
                                type="button"
                                className={`${styles.btn} ${styles.small}`}
                                disabled={loadingHistory}
                                onClick={() => changeLogLimit('all')}
                            >
                                {loadingHistory ? 'Loading...' : 'Load all available'}
                            </button>
                        </div>
                    </div>
                )}
                <pre>{logs ? <ColoredText text={logs} /> : 'No output yet.'}</pre>
                {sent.length > 0 && (
                    <div className={styles.sentLog} aria-label="Commands you sent">
                        {sent.map((entry, index) => (
                            <div key={index}>
                                <div className={styles.sentCmd}>{`> ${entry.command}`}</div>
                                <div className={entry.failed ? styles.sentFail : styles.sentReply}>
                                    {entry.failed
                                        ? <ColoredText text={`Failed: ${entry.output || 'the server did not answer'}`} />
                                        : (entry.output ? <ColoredText text={entry.output} /> : '(the server sent no reply; if the command prints to the log, look above)')}
                                </div>
                            </div>
                        ))}
                    </div>
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
                <span className={styles.promptPrefix} aria-hidden="true">&gt;</span>
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
                <button className={`${styles.btn} ${styles.primary}`} type="submit" disabled={!online || sending || !command.trim()}>
                    <FaPaperPlane aria-hidden="true" /> Send
                </button>
            </form>
        </div>
    );
}
