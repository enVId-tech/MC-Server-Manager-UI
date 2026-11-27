'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FaBan,
    FaCheck,
    FaCommentDots,
    FaCopy,
    FaCrown,
    FaEye,
    FaEyeSlash,
    FaGamepad,
    FaLocationArrow,
    FaSearch,
    FaServer,
    FaSignOutAlt,
    FaSyncAlt,
    FaUserCheck,
    FaUsers,
    FaUserShield,
} from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from '../dashboard.module.scss';
import { postJson, type ServerInfo } from './types';

interface ManagedPlayer {
    name: string;
    uuid?: string;
    online: boolean;
    op: boolean;
    opLevel?: number;
    whitelisted: boolean;
    banned: boolean;
    banReason?: string;
    bannedBy?: string;
    bannedExpires?: string;
    lastSeen?: string;
    currentServer?: string;
    bedrock?: boolean;
}

type PlayerActionType =
    | 'kick'
    | 'ban'
    | 'unban'
    | 'message'
    | 'op'
    | 'deop'
    | 'whitelist-add'
    | 'whitelist-remove'
    | 'gamemode'
    | 'teleport'
    | 'send';

type FilterMode = 'all' | 'online' | 'offline' | 'banned';

type PromptKind = 'message' | 'kick' | 'ban' | 'gamemode' | 'teleport' | 'send';

interface ActivePrompt {
    player: string;
    kind: PromptKind;
    serverName?: string;
}

function colorForName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    const palette = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];
    return palette[Math.abs(hash) % palette.length];
}

function PlayerAvatar({ name, uuid }: { name: string; uuid?: string }) {
    const id = encodeURIComponent(uuid || name);
    const sources = useMemo(() => [
        `https://mc-heads.net/avatar/${id}/48`,
        `https://minotar.net/helm/${id}/48`,
    ], [id]);
    const [sourceIndex, setSourceIndex] = useState(0);

    if (sourceIndex >= sources.length || !/^[.*A-Za-z0-9_-]{1,36}$/.test(name)) {
        return (
            <span
                className={styles.playerAvatarFallback}
                style={{ backgroundColor: colorForName(name) }}
                aria-hidden="true"
            >
                {name.replace(/^\./, '').slice(0, 1).toUpperCase() || '?'}
            </span>
        );
    }

    return (
        <img
            className={styles.playerAvatar}
            src={sources[sourceIndex]}
            alt=""
            width={34}
            height={34}
            referrerPolicy="no-referrer"
            onError={() => setSourceIndex(prev => prev + 1)}
        />
    );
}

function formatLastSeen(value?: string): string {
    if (!value) return 'Unknown';
    if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return `Today at ${value}`;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/** Player directory & administrative controls for both regular servers and proxies. */
export default function PlayersTab({ info, running, onChanged }: {
    info: ServerInfo;
    running: boolean;
    onChanged: () => void;
}) {
    const { showNotification, showConfirmDialog } = useNotifications();
    const [players, setPlayers] = useState<ManagedPlayer[]>([]);
    const [onlineCount, setOnlineCount] = useState(0);
    const [maxPlayers, setMaxPlayers] = useState<number | null>(null);
    const [proxyServers, setProxyServers] = useState<string[]>([]);
    const [actionTargetsRunning, setActionTargetsRunning] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [filter, setFilter] = useState<FilterMode>('all');
    const [query, setQuery] = useState('');
    const [showAllUuids, setShowAllUuids] = useState(false);
    const [revealedUuids, setRevealedUuids] = useState<Record<string, boolean>>({});
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const [activePrompt, setActivePrompt] = useState<ActivePrompt | null>(null);
    const [promptText, setPromptText] = useState('');
    const [promptGamemode, setPromptGamemode] = useState<'survival' | 'creative' | 'adventure' | 'spectator'>('survival');
    const [promptServer, setPromptServer] = useState('');

    const [manualUsername, setManualUsername] = useState('');
    const [manualAction, setManualAction] = useState<'ban' | 'unban' | 'op' | 'deop' | 'whitelist-add' | 'whitelist-remove'>('ban');

    const loadPlayers = useCallback(async () => {
        try {
            const res = await fetch(`/api/server/players?uniqueId=${encodeURIComponent(info.uniqueId)}&details=1`);
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(body.message ?? 'Could not load players.');
            } else {
                setPlayers((body.players ?? []) as ManagedPlayer[]);
                setOnlineCount(Number(body.online ?? 0));
                setMaxPlayers(typeof body.max === 'number' ? body.max : null);
                setProxyServers(Array.isArray(body.proxyServers) ? (body.proxyServers as string[]) : []);
                setActionTargetsRunning(Number(body.actionTargetsRunning ?? (running ? 1 : 0)));
                setError(null);
            }
        } catch {
            setError('Could not load players.');
        } finally {
            setLoading(false);
        }
    }, [info.uniqueId, running]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads player directory on mount and polls periodically
        void loadPlayers();
        const timer = setInterval(() => void loadPlayers(), 12_000);
        return () => clearInterval(timer);
    }, [loadPlayers]);

    const runAction = async (payload: {
        action: PlayerActionType;
        player: string;
        reason?: string;
        message?: string;
        gamemode?: 'survival' | 'creative' | 'adventure' | 'spectator';
        target?: string;
        serverName?: string;
    }) => {
        setBusy(true);
        const { ok, body } = await postJson<{ success?: boolean; command?: string }>('/api/server/players', {
            uniqueId: info.uniqueId,
            ...payload,
        });
        setBusy(false);

        if (!ok) {
            showNotification({
                type: 'error',
                title: 'Action failed',
                message: body.message ?? 'Could not execute player action.',
            });
            return false;
        }

        showNotification({
            type: 'success',
            title: 'Done',
            message: body.message ?? `Executed ${payload.action} on ${payload.player}.`,
        });
        setActivePrompt(null);
        setPromptText('');
        onChanged();
        setTimeout(() => void loadPlayers(), 700);
        return true;
    };

    const confirmQuickAction = (action: PlayerActionType, player: ManagedPlayer) => {
        if (action === 'unban' || action === 'op' || action === 'deop' || action === 'whitelist-add' || action === 'whitelist-remove') {
            const labels: Record<string, string> = {
                unban: `Unban ${player.name}?`,
                op: `Make ${player.name} an operator?`,
                deop: `Remove operator permissions from ${player.name}?`,
                'whitelist-add': `Add ${player.name} to the whitelist?`,
                'whitelist-remove': `Remove ${player.name} from the whitelist?`,
            };
            showConfirmDialog({
                title: labels[action],
                message: info.kind === 'proxy'
                    ? 'This command will be run on the running backend server(s) linked to this proxy.'
                    : `Runs on ${info.name}.`,
                confirmText: 'Confirm',
                cancelText: 'Cancel',
                variant: 'default',
                onConfirm: async () => {
                    await runAction({ action, player: player.name, serverName: player.currentServer });
                },
            });
            return;
        }

        setActivePrompt({ player: player.name, kind: action as PromptKind, serverName: player.currentServer });
        setPromptText('');
        setPromptGamemode('survival');
        setPromptServer(proxyServers.find(s => s !== player.currentServer) ?? proxyServers[0] ?? '');
    };

    const submitPrompt = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!activePrompt) return;
        const { player, kind, serverName } = activePrompt;
        if (kind === 'message') {
            await runAction({ action: 'message', player, message: promptText, serverName });
        } else if (kind === 'kick') {
            await runAction({ action: 'kick', player, reason: promptText || undefined, serverName });
        } else if (kind === 'ban') {
            await runAction({ action: 'ban', player, reason: promptText || undefined });
        } else if (kind === 'gamemode') {
            await runAction({ action: 'gamemode', player, gamemode: promptGamemode, serverName });
        } else if (kind === 'teleport') {
            await runAction({ action: 'teleport', player, target: promptText, serverName });
        } else if (kind === 'send') {
            await runAction({ action: 'send', player, serverName: promptServer });
        }
    };

    const copyUuid = async (key: string, uuid: string) => {
        try {
            await navigator.clipboard.writeText(uuid);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500);
        } catch {
            // Clipboard unavailable
        }
    };

    const bannedCount = players.filter(p => p.banned).length;
    const opCount = players.filter(p => p.op).length;

    const filteredPlayers = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return players.filter(player => {
            if (filter === 'online' && !player.online) return false;
            if (filter === 'offline' && player.online) return false;
            if (filter === 'banned' && !player.banned) return false;
            if (!needle) return true;
            return player.name.toLowerCase().includes(needle) || (player.uuid?.toLowerCase().includes(needle) ?? false);
        });
    }, [players, filter, query]);

    const actionsDisabled = info.kind === 'proxy' ? actionTargetsRunning === 0 && !running : !running;
    const moderationDisabled = info.kind === 'proxy' ? actionTargetsRunning === 0 : !running;

    return (
        <div className={styles.playersWrap}>
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <div>
                        <h2><span className={styles.cardIcon}><FaUsers aria-hidden="true" /></span> Player management</h2>
                        <p className={styles.playersLead}>
                            {info.kind === 'proxy'
                                ? 'Displays everyone currently connected to this proxy and historical players across the proxy network. Moderation actions apply to linked running backend servers; Send transfers directly via the proxy.'
                                : 'Displays everyone currently online and every player recorded in server logs, usercache, whitelist, ops, bans, and playerdata.'}
                        </p>
                    </div>
                    <div className={styles.playersHeaderActions}>
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.small}`}
                            onClick={() => setShowAllUuids(prev => !prev)}
                        >
                            {showAllUuids ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
                            {showAllUuids ? 'Hide UUIDs' : 'Show all UUIDs'}
                        </button>
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.small}`}
                            onClick={() => void loadPlayers()}
                            disabled={loading || busy}
                        >
                            <FaSyncAlt aria-hidden="true" /> Refresh
                        </button>
                    </div>
                </div>

                <div className={styles.playersSummary}>
                    <span className={styles.metaPill}>
                        Online: <strong>{onlineCount}{maxPlayers !== null ? `/${maxPlayers}` : ''}</strong>
                    </span>
                    <span className={styles.metaPill}>
                        Total ever joined: <strong>{players.length}</strong>
                    </span>
                    <span className={styles.metaPill}>
                        Operators: <strong>{opCount}</strong>
                    </span>
                    <span className={styles.metaPill}>
                        Banned: <strong>{bannedCount}</strong>
                    </span>
                </div>

                {actionsDisabled && (
                    <div className={`${styles.notice} ${styles.info}`} style={{ marginBottom: '0.85rem' }}>
                        {info.kind === 'proxy'
                            ? 'Neither the proxy nor any linked backend server is running. Historical players can still be browsed, but commands require a running server.'
                            : 'This server is currently offline. Historical players are shown below; start the server to run player actions.'}
                    </div>
                )}

                <div className={styles.playersToolbar}>
                    <div className={styles.playerSearchBox}>
                        <FaSearch aria-hidden="true" />
                        <input
                            className={styles.input}
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Filter by username or UUID..."
                            aria-label="Filter players"
                        />
                    </div>
                    <div className={styles.playerFilterGroup}>
                        {([
                            ['all', `All (${players.length})`],
                            ['online', `Online (${onlineCount})`],
                            ['offline', `Offline (${Math.max(0, players.length - onlineCount)})`],
                            ['banned', `Banned (${bannedCount})`],
                        ] as Array<[FilterMode, string]>).map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                className={`${styles.tab} ${filter === mode ? styles.active : ''}`}
                                onClick={() => setFilter(mode)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <form
                    className={styles.playerManualForm}
                    onSubmit={event => {
                        event.preventDefault();
                        if (!manualUsername.trim()) return;
                        void runAction({ action: manualAction, player: manualUsername.trim() });
                    }}
                >
                    <input
                        className={styles.input}
                        value={manualUsername}
                        onChange={event => setManualUsername(event.target.value)}
                        placeholder="Quick admin action by username..."
                        aria-label="Username for quick action"
                        disabled={moderationDisabled || busy}
                    />
                    <select
                        className={styles.select}
                        value={manualAction}
                        onChange={event => setManualAction(event.target.value as typeof manualAction)}
                        disabled={moderationDisabled || busy}
                        aria-label="Quick admin action type"
                    >
                        <option value="ban">Ban</option>
                        <option value="unban">Unban</option>
                        <option value="op">Make OP</option>
                        <option value="deop">Remove OP</option>
                        <option value="whitelist-add">Whitelist add</option>
                        <option value="whitelist-remove">Whitelist remove</option>
                    </select>
                    <button
                        type="submit"
                        className={`${styles.btn} ${styles.small} ${styles.primary}`}
                        disabled={moderationDisabled || busy || !manualUsername.trim()}
                    >
                        Run
                    </button>
                </form>

                {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
                {loading && players.length === 0 ? (
                    <div className={styles.loading}>Loading players…</div>
                ) : filteredPlayers.length === 0 ? (
                    <div className={styles.empty}>
                        {players.length === 0
                            ? 'No players have been recorded on this server yet.'
                            : 'No players match your filter.'}
                    </div>
                ) : (
                    <div className={styles.playerList}>
                        {filteredPlayers.map(player => {
                            const key = (player.uuid || player.name).toLowerCase();
                            const uuidVisible = showAllUuids || Boolean(revealedUuids[key]);
                            const promptingThis = activePrompt?.player.toLowerCase() === player.name.toLowerCase();
                            const otherOnline = players.filter(p => p.online && p.name !== player.name).map(p => p.name);

                            return (
                                <div className={styles.playerCard} key={key}>
                                    <div className={styles.playerRow}>
                                        <div className={styles.playerIdentity}>
                                            <PlayerAvatar name={player.name} uuid={player.uuid} />
                                            <div className={styles.playerInfo}>
                                                <div className={styles.playerNameLine}>
                                                    <strong>{player.name}</strong>
                                                    <span className={`${styles.badge} ${player.online ? styles.ok : ''}`}>
                                                        <span className={styles.statusDot} aria-hidden="true" />
                                                        {player.online ? 'Online' : 'Offline'}
                                                    </span>
                                                    {player.currentServer && (
                                                        <span className={`${styles.badge} ${styles.info}`}>
                                                            <FaServer aria-hidden="true" /> {player.currentServer}
                                                        </span>
                                                    )}
                                                    {player.op && (
                                                        <span className={`${styles.badge} ${styles.warn}`}>
                                                            <FaCrown aria-hidden="true" /> OP
                                                        </span>
                                                    )}
                                                    {player.whitelisted && (
                                                        <span className={`${styles.badge} ${styles.info}`}>Whitelisted</span>
                                                    )}
                                                    {player.banned && (
                                                        <span className={`${styles.badge} ${styles.bad}`}>
                                                            <FaBan aria-hidden="true" /> Banned
                                                        </span>
                                                    )}
                                                    {player.bedrock && (
                                                        <span className={styles.badge}>Bedrock</span>
                                                    )}
                                                </div>
                                                <div className={styles.playerMetaLine}>
                                                    <span>Last seen: {formatLastSeen(player.lastSeen)}</span>
                                                    {player.banReason && (
                                                        <span> · Ban reason: {player.banReason}</span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className={styles.uuidToggleBtn}
                                                        onClick={() => setRevealedUuids(prev => ({ ...prev, [key]: !prev[key] }))}
                                                    >
                                                        {uuidVisible ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
                                                        {uuidVisible ? 'Hide UUID' : 'Show UUID'}
                                                    </button>
                                                    {uuidVisible && (
                                                        <span className={styles.uuidReveal}>
                                                            <code className={styles.mono}>{player.uuid ?? 'Unavailable'}</code>
                                                            {player.uuid && (
                                                                <button
                                                                    type="button"
                                                                    className={styles.uuidCopyBtn}
                                                                    onClick={() => void copyUuid(key, player.uuid as string)}
                                                                    title="Copy UUID"
                                                                    aria-label={`Copy UUID for ${player.name}`}
                                                                >
                                                                    {copiedKey === key ? <FaCheck aria-hidden="true" /> : <FaCopy aria-hidden="true" />}
                                                                </button>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className={styles.playerActions}>
                                            {player.online && (
                                                <button
                                                    type="button"
                                                    className={`${styles.btn} ${styles.small}`}
                                                    disabled={moderationDisabled || busy}
                                                    onClick={() => confirmQuickAction('message', player)}
                                                >
                                                    <FaCommentDots aria-hidden="true" /> Message
                                                </button>
                                            )}
                                            {player.online && (
                                                <button
                                                    type="button"
                                                    className={`${styles.btn} ${styles.small}`}
                                                    disabled={moderationDisabled || busy}
                                                    onClick={() => confirmQuickAction('kick', player)}
                                                >
                                                    <FaSignOutAlt aria-hidden="true" /> Kick
                                                </button>
                                            )}
                                            {info.kind === 'proxy' && player.online && proxyServers.length > 0 && (
                                                <button
                                                    type="button"
                                                    className={`${styles.btn} ${styles.small}`}
                                                    disabled={!running || busy}
                                                    onClick={() => confirmQuickAction('send', player)}
                                                >
                                                    <FaServer aria-hidden="true" /> Send
                                                </button>
                                            )}
                                            {player.banned ? (
                                                <button
                                                    type="button"
                                                    className={`${styles.btn} ${styles.small} ${styles.success}`}
                                                    disabled={moderationDisabled || busy}
                                                    onClick={() => confirmQuickAction('unban', player)}
                                                >
                                                    <FaUserCheck aria-hidden="true" /> Unban
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={`${styles.btn} ${styles.small} ${styles.danger}`}
                                                    disabled={moderationDisabled || busy}
                                                    onClick={() => confirmQuickAction('ban', player)}
                                                >
                                                    <FaBan aria-hidden="true" /> Ban
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.small}`}
                                                disabled={moderationDisabled || busy}
                                                onClick={() => confirmQuickAction(player.op ? 'deop' : 'op', player)}
                                                title={player.op ? 'Revoke OP' : 'Grant OP'}
                                            >
                                                <FaUserShield aria-hidden="true" /> {player.op ? 'Deop' : 'OP'}
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.small}`}
                                                disabled={moderationDisabled || busy}
                                                onClick={() => confirmQuickAction(player.whitelisted ? 'whitelist-remove' : 'whitelist-add', player)}
                                            >
                                                {player.whitelisted ? 'Unwhitelist' : 'Whitelist'}
                                            </button>
                                            {player.online && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={`${styles.btn} ${styles.small}`}
                                                        disabled={moderationDisabled || busy}
                                                        onClick={() => confirmQuickAction('gamemode', player)}
                                                    >
                                                        <FaGamepad aria-hidden="true" /> Gamemode
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.btn} ${styles.small}`}
                                                        disabled={moderationDisabled || busy}
                                                        onClick={() => confirmQuickAction('teleport', player)}
                                                    >
                                                        <FaLocationArrow aria-hidden="true" /> Teleport
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {promptingThis && activePrompt && (
                                        <form className={styles.playerActionForm} onSubmit={submitPrompt}>
                                            {(activePrompt.kind === 'message' || activePrompt.kind === 'kick' || activePrompt.kind === 'ban') && (
                                                <input
                                                    className={styles.input}
                                                    value={promptText}
                                                    autoFocus
                                                    onChange={event => setPromptText(event.target.value)}
                                                    placeholder={
                                                        activePrompt.kind === 'message'
                                                            ? `Message to ${player.name}...`
                                                            : activePrompt.kind === 'kick'
                                                                ? 'Kick reason (optional)...'
                                                                : 'Ban reason (optional)...'
                                                    }
                                                />
                                            )}
                                            {activePrompt.kind === 'gamemode' && (
                                                <select
                                                    className={styles.select}
                                                    value={promptGamemode}
                                                    onChange={event => setPromptGamemode(event.target.value as typeof promptGamemode)}
                                                >
                                                    <option value="survival">Survival</option>
                                                    <option value="creative">Creative</option>
                                                    <option value="adventure">Adventure</option>
                                                    <option value="spectator">Spectator</option>
                                                </select>
                                            )}
                                            {activePrompt.kind === 'teleport' && (
                                                <div className={styles.playerTeleportInputs}>
                                                    <input
                                                        className={styles.input}
                                                        value={promptText}
                                                        autoFocus
                                                        onChange={event => setPromptText(event.target.value)}
                                                        placeholder="Target player or coordinates (e.g. 0 80 0)..."
                                                    />
                                                    {otherOnline.length > 0 && (
                                                        <select
                                                            className={styles.select}
                                                            value=""
                                                            onChange={event => event.target.value && setPromptText(event.target.value)}
                                                            aria-label="Pick online player destination"
                                                        >
                                                            <option value="">Pick online player…</option>
                                                            {otherOnline.map(name => <option key={name} value={name}>{name}</option>)}
                                                        </select>
                                                    )}
                                                </div>
                                            )}
                                            {activePrompt.kind === 'send' && (
                                                <select
                                                    className={styles.select}
                                                    value={promptServer}
                                                    onChange={event => setPromptServer(event.target.value)}
                                                >
                                                    {proxyServers.map(srv => (
                                                        <option key={srv} value={srv}>{srv}</option>
                                                    ))}
                                                </select>
                                            )}
                                            <button
                                                type="submit"
                                                className={`${styles.btn} ${styles.small} ${activePrompt.kind === 'ban' ? styles.danger : styles.primary}`}
                                                disabled={busy || (activePrompt.kind === 'message' && !promptText.trim()) || (activePrompt.kind === 'teleport' && !promptText.trim()) || (activePrompt.kind === 'send' && !promptServer)}
                                            >
                                                {busy ? 'Running…' : activePrompt.kind === 'ban' ? 'Confirm ban' : activePrompt.kind === 'kick' ? 'Confirm kick' : 'Apply'}
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.small}`}
                                                onClick={() => setActivePrompt(null)}
                                            >
                                                Cancel
                                            </button>
                                        </form>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
