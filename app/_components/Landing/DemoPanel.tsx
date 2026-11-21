'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
    FaChevronRight, FaClock, FaCog, FaFileAlt, FaFolder, FaMemory, FaMicrochip,
    FaPlay, FaPuzzlePiece, FaRedo, FaStop, FaTachometerAlt, FaTerminal, FaTrash, FaUsers, FaChartLine,
} from 'react-icons/fa';
import styles from './DemoPanel.module.scss';
import { DEMO_FILES, DEMO_PLAYERS, DEMO_PLUGINS, DEMO_SERVER, INITIAL_LOG, type DemoPlugin } from './demoData';

type Status = 'online' | 'offline' | 'starting' | 'stopping';
type Tab = 'overview' | 'console' | 'files' | 'plugins' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <FaChartLine /> },
    { id: 'console', label: 'Console', icon: <FaTerminal /> },
    { id: 'files', label: 'Files', icon: <FaFolder /> },
    { id: 'plugins', label: 'Plugins', icon: <FaPuzzlePiece /> },
    { id: 'settings', label: 'Settings', icon: <FaCog /> },
];

const STATUS_LABEL: Record<Status, string> = { online: 'Online', offline: 'Offline', starting: 'Starting', stopping: 'Stopping' };
const KNOWN_HOSTS = ['modrinth.com', 'hangar.papermc.io', 'spigotmc.org', 'github.com', 'curseforge.com'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const stamp = () => new Date().toTimeString().slice(0, 8);
const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
};

const START_PLAYERS = DEMO_PLAYERS.slice(0, 2);

export default function DemoPanel() {
    const [tab, setTab] = useState<Tab>('overview');
    const [status, setStatus] = useState<Status>('online');
    const [players, setPlayers] = useState<string[]>(START_PLAYERS);
    const [cpu, setCpu] = useState(18);
    const [ram, setRam] = useState(2140);
    const [tps, setTps] = useState(20);
    const [uptime, setUptime] = useState(1380);
    const [cpuHistory, setCpuHistory] = useState<number[]>([14, 16, 15, 19, 18, 17, 21, 18, 16, 18]);
    const [log, setLog] = useState<string[]>(INITIAL_LOG);
    const [command, setCommand] = useState('');
    const [path, setPath] = useState('/');
    const [openFile, setOpenFile] = useState<string | null>(null);
    const [plugins, setPlugins] = useState<DemoPlugin[]>(DEMO_PLUGINS);
    const [pluginLink, setPluginLink] = useState('');
    const [pluginError, setPluginError] = useState('');
    const [motd, setMotd] = useState('A Minecraft Server');
    const [difficulty, setDifficulty] = useState('normal');
    const [maxPlayers, setMaxPlayers] = useState(DEMO_SERVER.maxPlayers);
    const [pvp, setPvp] = useState(true);
    const [whitelist, setWhitelist] = useState(false);
    const [notice, setNotice] = useState('');

    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const logEnd = useRef<HTMLDivElement>(null);
    const playersRef = useRef(players);

    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    useEffect(() => {
        const pending = timers.current;
        return () => pending.forEach(clearTimeout);
    }, []);

    const later = useCallback((fn: () => void, ms: number) => {
        timers.current.push(setTimeout(fn, ms));
    }, []);

    const say = useCallback((...lines: string[]) => {
        setLog(current => [...current, ...lines].slice(-200));
    }, []);

    const flash = useCallback((text: string) => {
        setNotice(text);
        later(() => setNotice(''), 2600);
    }, [later]);

    // A little life while the demo server is "running"
    useEffect(() => {
        if (status !== 'online') return;
        const id = setInterval(() => {
            setUptime(value => value + 1);
            setCpu(value => clamp(Math.round(value + (Math.random() - 0.5) * 8), 8, 46));
            setRam(value => clamp(Math.round(value + (Math.random() - 0.45) * 60), 1900, 2600));
            setTps(Math.random() > 0.9 ? 19.4 : 20);
            setCpuHistory(history => [...history.slice(-39), clamp(Math.round((history[history.length - 1] ?? 18) + (Math.random() - 0.5) * 8), 8, 46)]);
            if (Math.random() > 0.93) {
                const current = playersRef.current;
                const absent = DEMO_PLAYERS.filter(name => !current.includes(name));
                if (absent.length && (current.length < 3 || Math.random() > 0.5)) {
                    const name = absent[Math.floor(Math.random() * absent.length)];
                    setPlayers([...current, name]);
                    say(`[${stamp()} INFO]: ${name} joined the game`);
                } else if (current.length > 1) {
                    const name = current[Math.floor(Math.random() * current.length)];
                    setPlayers(current.filter(entry => entry !== name));
                    say(`[${stamp()} INFO]: ${name} left the game`);
                }
            }
        }, 1500);
        return () => clearInterval(id);
    }, [status, say]);

    useEffect(() => {
        const end = logEnd.current;
        if (end) end.parentElement?.scrollTo({ top: end.offsetTop });
    }, [log, tab]);

    const boot = useCallback(() => {
        setStatus('starting');
        say(`[${stamp()} INFO]: Starting minecraft server version ${DEMO_SERVER.version}`, `[${stamp()} INFO]: Preparing level "world"`);
        later(() => {
            setStatus('online');
            setPlayers([]);
            setCpu(18);
            setRam(2100);
            setUptime(0);
            say(`[${stamp()} INFO]: Done (2.2s)! For help, type "help"`);
        }, 2200);
    }, [say, later]);

    const halt = useCallback((then?: () => void) => {
        setStatus('stopping');
        say(`[${stamp()} INFO]: Stopping the server`, `[${stamp()} INFO]: Saving worlds`);
        later(() => {
            setStatus('offline');
            setPlayers([]);
            setCpu(0);
            setRam(0);
            setTps(0);
            say(`[${stamp()} INFO]: Server stopped`);
            then?.();
        }, 1300);
    }, [say, later]);

    const power = (action: 'start' | 'stop' | 'restart') => {
        if (action === 'start' && status === 'offline') boot();
        if (action === 'stop' && status === 'online') halt();
        if (action === 'restart' && status === 'online') halt(boot);
    };

    const run = (raw: string) => {
        const input = raw.trim();
        if (!input) return;
        say(`> ${input}`);
        if (status !== 'online') {
            say('The demo server is not running. Start it first.');
            return;
        }
        const [name, ...rest] = input.replace(/^\//, '').split(/\s+/);
        switch (name.toLowerCase()) {
            case 'help':
                say('Commands in this demo: help, list, say <text>, tps, version, time set day, stop');
                break;
            case 'list':
                say(`There are ${players.length} of a max of ${maxPlayers} players online: ${players.join(', ')}`);
                break;
            case 'say':
                say(`[${stamp()} INFO]: [Server] ${rest.join(' ') || '...'}`);
                break;
            case 'tps':
                say(`TPS from last 1m, 5m, 15m: ${tps.toFixed(1)}, 20.0, 20.0`);
                break;
            case 'version':
                say(`This server is running ${DEMO_SERVER.type} version ${DEMO_SERVER.version}`);
                break;
            case 'time':
                say('Set the time to 1000');
                break;
            case 'stop':
                halt();
                break;
            default:
                say(`Unknown command "${name}". Type "help" for the demo commands.`);
        }
    };

    const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const index = TABS.findIndex(entry => entry.id === tab);
        const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null;
        if (next === null) return;
        event.preventDefault();
        const target = TABS[(next + TABS.length) % TABS.length].id;
        setTab(target);
        document.getElementById(`demo-tab-${target}`)?.focus();
    };

    const addPlugin = () => {
        let url: URL | null = null;
        try {
            url = new URL(pluginLink.trim());
        } catch {
            url = null;
        }
        if (!url || url.protocol !== 'https:' || !KNOWN_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
            setPluginError('The demo accepts https links from Modrinth, Hangar, Spigot, GitHub or CurseForge.');
            return;
        }
        const slug = url.pathname.split('/').filter(Boolean).pop() ?? 'plugin';
        const label = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (plugins.some(entry => entry.id === slug.toLowerCase())) {
            setPluginError(`${label} is already installed.`);
            return;
        }
        setPlugins(current => [...current, { id: slug.toLowerCase(), name: label, version: '1.0.0', source: url.hostname.replace(/^www\./, ''), enabled: true, auto: true }]);
        setPluginLink('');
        setPluginError('');
        flash(`${label} installed (demo)`);
    };

    const entries = DEMO_FILES[path] ?? [];
    const file = entries.find(entry => entry.name === openFile);
    const online = status === 'online';
    const ramPercent = Math.round((ram / DEMO_SERVER.maxRamMb) * 100);
    const spark = cpuHistory.map((value, index) => `${(index / Math.max(cpuHistory.length - 1, 1)) * 100},${30 - (value / 50) * 30}`).join(' ');

    return (
        <div className={styles.frame} aria-label="Interactive demo of the server panel">
            <div className={styles.demoBar}>
                <span className={styles.demoTag}>Demo</span>
                <span>This is a mock server. Nothing here is real and nothing is saved.</span>
            </div>

            <div className={styles.header}>
                <div className={styles.titleBlock}>
                    <h3 className={styles.title}>
                        {DEMO_SERVER.name}
                        <span className={`${styles.badge} ${styles[status]}`}><i />{STATUS_LABEL[status]}</span>
                    </h3>
                    <p className={styles.meta}>{DEMO_SERVER.type} {DEMO_SERVER.version} · {DEMO_SERVER.address}</p>
                </div>
                <div className={styles.power}>
                    <button type="button" className={styles.btn} disabled={status !== 'offline'} onClick={() => power('start')}><FaPlay /> Start</button>
                    <button type="button" className={styles.btn} disabled={!online} onClick={() => power('restart')}><FaRedo /> Restart</button>
                    <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={!online} onClick={() => power('stop')}><FaStop /> Stop</button>
                </div>
            </div>

            <div className={styles.tabs} role="tablist" aria-label="Server sections" onKeyDown={onTabKey}>
                {TABS.map(entry => (
                    <button
                        key={entry.id}
                        id={`demo-tab-${entry.id}`}
                        role="tab"
                        type="button"
                        aria-selected={tab === entry.id}
                        aria-controls="demo-tabpanel"
                        tabIndex={tab === entry.id ? 0 : -1}
                        className={`${styles.tab} ${tab === entry.id ? styles.active : ''}`}
                        onClick={() => setTab(entry.id)}
                    >
                        {entry.icon}<span>{entry.label}</span>
                    </button>
                ))}
            </div>

            <div className={styles.body} id="demo-tabpanel" role="tabpanel" aria-labelledby={`demo-tab-${tab}`}>
                {tab === 'overview' && (
                    <div className={styles.overview}>
                        <div className={styles.stats}>
                            <div className={styles.stat}><FaUsers /><div><span>Players</span><strong>{players.length} / {maxPlayers}</strong></div></div>
                            <div className={styles.stat}><FaMemory /><div><span>Memory</span><strong>{online ? `${(ram / 1024).toFixed(1)} GB` : '—'}</strong></div></div>
                            <div className={styles.stat}><FaMicrochip /><div><span>CPU</span><strong>{online ? `${cpu}%` : '—'}</strong></div></div>
                            <div className={styles.stat}><FaTachometerAlt /><div><span>TPS</span><strong>{online ? tps.toFixed(1) : '—'}</strong></div></div>
                            <div className={styles.stat}><FaClock /><div><span>Uptime</span><strong>{online ? formatUptime(uptime) : '—'}</strong></div></div>
                        </div>
                        <div className={styles.cards}>
                            <section className={styles.card}>
                                <h4>CPU, last minute</h4>
                                <svg className={styles.spark} viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="CPU usage over the last minute">
                                    <polyline points={spark} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                </svg>
                                <div className={styles.bar} aria-label={`Memory ${ramPercent}%`}><span style={{ width: `${online ? ramPercent : 0}%` }} /></div>
                                <p className={styles.hint}>Memory: {online ? `${ram} MB of ${DEMO_SERVER.maxRamMb} MB` : 'server is stopped'}</p>
                            </section>
                            <section className={styles.card}>
                                <h4>Players online</h4>
                                {players.length === 0 ? <p className={styles.hint}>Nobody is online.</p> : (
                                    <ul className={styles.players}>
                                        {players.map(name => <li key={name}><i />{name}</li>)}
                                    </ul>
                                )}
                            </section>
                        </div>
                    </div>
                )}

                {tab === 'console' && (
                    <div className={styles.console}>
                        <div className={styles.log} role="log" aria-live="off">
                            {log.map((line, index) => <div key={index} className={line.startsWith('>') ? styles.cmdLine : undefined}>{line}</div>)}
                            <div ref={logEnd} />
                        </div>
                        <form className={styles.cmdForm} onSubmit={event => { event.preventDefault(); run(command); setCommand(''); }}>
                            <label htmlFor="demo-command" className={styles.srOnly}>Console command</label>
                            <input id="demo-command" value={command} onChange={event => setCommand(event.target.value)} placeholder='Try "help", "list" or "say hello"' autoComplete="off" spellCheck={false} />
                            <button type="submit" className={styles.btn}>Send</button>
                        </form>
                    </div>
                )}

                {tab === 'files' && (
                    <div className={styles.files}>
                        <div className={styles.crumbs}>
                            <button type="button" className={styles.link} onClick={() => { setPath('/'); setOpenFile(null); }}>server</button>
                            {path !== '/' && <><FaChevronRight /><span>{path.slice(1)}</span></>}
                            {path !== '/' && <button type="button" className={styles.link} onClick={() => { setPath('/'); setOpenFile(null); }}>Up</button>}
                        </div>
                        <div className={styles.fileGrid}>
                            <ul className={styles.fileList}>
                                {entries.map(entry => (
                                    <li key={entry.name}>
                                        <button
                                            type="button"
                                            className={`${styles.fileRow} ${openFile === entry.name ? styles.active : ''}`}
                                            onClick={() => {
                                                if (entry.kind === 'dir') {
                                                    const next = `${path === '/' ? '' : path}/${entry.name}`;
                                                    if (DEMO_FILES[next]) { setPath(next); setOpenFile(null); }
                                                    else flash('This folder is empty in the demo');
                                                } else setOpenFile(entry.name);
                                            }}
                                        >
                                            {entry.kind === 'dir' ? <FaFolder /> : <FaFileAlt />}
                                            <span>{entry.name}</span>
                                            <em>{entry.size ?? ''}</em>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <div className={styles.preview}>
                                {file ? (
                                    <>
                                        <h4>{file.name}</h4>
                                        <pre>{file.content ?? 'Binary file. The real panel can download it; the demo cannot preview it.'}</pre>
                                    </>
                                ) : <p className={styles.hint}>Pick a file to preview it. The real panel can edit text files and upload new ones.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'plugins' && (
                    <div className={styles.plugins}>
                        <form className={styles.linkForm} onSubmit={event => { event.preventDefault(); addPlugin(); }}>
                            <label htmlFor="demo-plugin-link" className={styles.srOnly}>Plugin link</label>
                            <input id="demo-plugin-link" value={pluginLink} onChange={event => { setPluginLink(event.target.value); setPluginError(''); }} placeholder="Paste a Modrinth, Hangar or Spigot link" spellCheck={false} />
                            <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={!pluginLink.trim()}>Install</button>
                        </form>
                        {pluginError && <p className={styles.error} role="alert">{pluginError}</p>}
                        <ul className={styles.pluginList}>
                            {plugins.map(plugin => (
                                <li key={plugin.id} className={styles.pluginRow}>
                                    <div className={styles.pluginInfo}>
                                        <strong>{plugin.name}</strong>
                                        <span>{plugin.version} · {plugin.source}</span>
                                    </div>
                                    <label className={styles.switch}>
                                        <input type="checkbox" checked={plugin.auto} onChange={() => setPlugins(list => list.map(entry => entry.id === plugin.id ? { ...entry, auto: !entry.auto } : entry))} />
                                        <span>Auto-update</span>
                                    </label>
                                    <label className={styles.switch}>
                                        <input type="checkbox" checked={plugin.enabled} onChange={() => setPlugins(list => list.map(entry => entry.id === plugin.id ? { ...entry, enabled: !entry.enabled } : entry))} />
                                        <span>Enabled</span>
                                    </label>
                                    <button type="button" className={styles.iconBtn} aria-label={`Remove ${plugin.name}`} onClick={() => setPlugins(list => list.filter(entry => entry.id !== plugin.id))}><FaTrash /></button>
                                </li>
                            ))}
                            {plugins.length === 0 && <li className={styles.hint}>No plugins installed.</li>}
                        </ul>
                    </div>
                )}

                {tab === 'settings' && (
                    <form className={styles.settings} onSubmit={event => { event.preventDefault(); flash('Settings saved (demo)'); }}>
                        <label className={styles.field}>
                            <span>Message of the day</span>
                            <input value={motd} onChange={event => setMotd(event.target.value)} maxLength={60} />
                        </label>
                        <label className={styles.field}>
                            <span>Difficulty</span>
                            <select value={difficulty} onChange={event => setDifficulty(event.target.value)}>
                                <option value="peaceful">Peaceful</option>
                                <option value="easy">Easy</option>
                                <option value="normal">Normal</option>
                                <option value="hard">Hard</option>
                            </select>
                        </label>
                        <label className={styles.field}>
                            <span>Max players: {maxPlayers}</span>
                            <input type="range" min={2} max={50} value={maxPlayers} onChange={event => setMaxPlayers(Number(event.target.value))} />
                        </label>
                        <div className={styles.toggles}>
                            <label className={styles.switch}><input type="checkbox" checked={pvp} onChange={event => setPvp(event.target.checked)} /><span>Player vs player</span></label>
                            <label className={styles.switch}><input type="checkbox" checked={whitelist} onChange={event => setWhitelist(event.target.checked)} /><span>Whitelist</span></label>
                        </div>
                        <div className={styles.formActions}>
                            <button type="submit" className={`${styles.btn} ${styles.primary}`}>Save changes</button>
                            <span className={styles.hint}>The real panel applies these by recreating the container.</span>
                        </div>
                    </form>
                )}
            </div>

            <div className={styles.toast} role="status" aria-live="polite">{notice}</div>
        </div>
    );
}
