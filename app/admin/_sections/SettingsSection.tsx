'use client';

import React, { useEffect, useState } from 'react';
import styles from '../admin.module.scss';
import { useAdminData } from './shared';
import { useNotifications } from '@/lib/contexts/NotificationContext';

interface SystemStatus {
    counts: { servers: number; imported: number; users: number; pendingUsers: number };
    portainer: { connected: boolean; host?: string; environments?: number; error?: string };
    database: { connected: boolean };
    storage: {
        backend: 'local' | 'webdav';
        path?: string;
        hostPath: string | null;
        importFolders: Array<{ appPath: string; hostPath: string }>;
    };
    settings: {
        serverDomain: string;
        containerUser: string;
        containerDns: string | null;
        velocityReloadFallback: string;
        velocityConfigPath: string | null;
        deleteServerFolders: boolean;
    };
    runtime: { node: string; uptimeSeconds: number };
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ');
}

interface PlatformSettings {
    maxMemoryMb: number; minMemoryMb: number; baseMemoryMb: number; moddedExtraMb: number; modpackExtraMb: number;
    perPluginMb: number; perModMb: number; perPlayerMb: number; maxStartFailures: number;
    autoUpdateImages: number; updateWindowStart: number; updateWindowEnd: number;
    folderNaming: 'uuid' | 'name';
    blockServerSwitching: boolean;
    backupEnabled: boolean; backupIntervalHours: number; backupKeep: number;
}

const PLATFORM_FIELDS: Array<[keyof PlatformSettings, string, string]> = [
    ['maxMemoryMb', 'Largest heap (MB)', 'The most memory the automatic sizing gives a server.'],
    ['minMemoryMb', 'Smallest heap (MB)', 'Every server gets at least this much.'],
    ['baseMemoryMb', 'Base heap (MB)', 'A plain server with no plugins, mods or extra players.'],
    ['moddedExtraMb', 'Extra for modded (MB)', 'Added for Forge, NeoForge, Fabric and Quilt servers.'],
    ['modpackExtraMb', 'Extra for modpacks (MB)', 'Added for servers that install a modpack.'],
    ['perPluginMb', 'Per plugin (MB)', 'Added for every plugin.'],
    ['perModMb', 'Per mod (MB)', 'Added for every mod.'],
    ['perPlayerMb', 'Per player above 10 (MB)', 'Added for every player slot above ten.'],
    ['maxStartFailures', 'Failed starts before stopping', 'A server that fails to start this many times in a row is stopped for good.'],
    ['backupIntervalHours', 'Hours between backups', 'How often every server is backed up when it has no rule of its own. A server can get its own in its Backups tab.'],
    ['backupKeep', 'Automatic backups kept', 'The newest this many automatic backups of a server are kept; older ones are deleted. Backups made by hand are never deleted automatically.'],
    ['updateWindowStart', 'Update window starts (hour)', 'Containers are recreated for an image update only between these hours of the server clock.'],
    ['updateWindowEnd', 'Update window ends (hour)', 'Use the same hour twice to allow updates at any time.'],
];

/** Memory rules and limits that administrators set for every server */
function PlatformCard() {
    const { showNotification } = useNotifications();
    const platform = useAdminData<{ settings: PlatformSettings; example: number }>('/api/admin/platform');
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fills the form once the settings are loaded
        if (platform.data) setDraft(Object.fromEntries(Object.entries(platform.data.settings).map(([key, value]) => [key, String(value)])));
    }, [platform.data]);

    const save = async () => {
        setSaving(true);
        const response = await fetch('/api/admin/platform', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
        setSaving(false);
        showNotification({ type: response.ok ? 'success' : 'error', title: 'Limits', message: response.ok ? 'Saved. New and changed servers use these rules.' : 'The limits could not be saved.' });
        if (response.ok) await platform.reload();
    };

    return (
        <section className={styles.card}>
            <div className={styles.cardHeader}>
                <div>
                    <h2>Memory, limits and updates</h2>
                    <p className={styles.hint}>Users cannot choose memory. It is worked out from the plugins, mods and player slots of each server, between your smallest and largest heap. Only administrators can set it by hand.</p>
                </div>
                <button className={`${styles.btn} ${styles.primary}`} disabled={saving || !platform.data} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
            {platform.data && (
                <div className={styles.formGrid}>
                    <label className={styles.field}>
                        <span><input type="checkbox" checked={draft.autoUpdateImages === '1'} onChange={event => setDraft({ ...draft, autoUpdateImages: event.target.checked ? '1' : '0' })} /> Update container images automatically</span>
                        <span className={styles.hint}>Newer images are pulled every hour and running containers are recreated on them inside the update window.</span>
                    </label>
                    <label className={styles.field}>
                        <span><input type="checkbox" checked={draft.backupEnabled === 'true'} onChange={event => setDraft({ ...draft, backupEnabled: String(event.target.checked) })} /> Back up servers automatically</span>
                        <span className={styles.hint}>Applies to every server without its own rule. Backups leave out every proxy secret and key, like the download does, and users can download them but not change or delete them.</span>
                    </label>
                    <label className={styles.field}>
                        <span><input type="checkbox" checked={draft.blockServerSwitching === 'true'} onChange={event => setDraft({ ...draft, blockServerSwitching: String(event.target.checked) })} /> Block server-switching commands for users</span>
                        <span className={styles.hint}>Users can no longer run server, send, sendall, transfer, hub or lobby from the console (also behind execute ... run). Administrators still can.</span>
                    </label>
                    <label className={styles.field}>Folder names of new servers
                        <select className={styles.input} value={draft.folderNaming ?? 'uuid'} onChange={event => setDraft({ ...draft, folderNaming: event.target.value })}>
                            <option value="uuid">Unique ID (never clashes, says nothing about the server)</option>
                            <option value="name">The server&apos;s own name (easier to find by hand)</option>
                        </select>
                        <span className={styles.hint}>Applies to every server created from now on, for every user. With names, a folder that already exists is never reused: the new one gets -2, -3 and so on. Existing servers keep their folders.</span>
                    </label>
                    {PLATFORM_FIELDS.map(([key, label, hint]) => (
                        <label key={key} className={styles.field}>{label}
                            <input className={styles.input} type="number" min={0} value={draft[key] ?? ''} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
                            <span className={styles.hint}>{hint}</span>
                        </label>
                    ))}
                    <p className={styles.hint}>Example: a Paper server with 10 plugins and 20 player slots gets {platform.data.example} MB.</p>
                </div>
            )}
        </section>
    );
}

export default function SettingsSection() {
    const system = useAdminData<SystemStatus>('/api/admin/system');
    const data = system.data;

    return (
        <>
            <div className={styles.pageHeader}>
                <div>
                    <h1>Settings</h1>
                    <p>How this installation is set up. These values come from environment variables, so they are changed in the .env file or the container configuration.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btn} onClick={() => void system.reload()} disabled={system.loading}>Refresh</button>
                </div>
            </div>

            {system.error && <div className={`${styles.notice} ${styles.error}`}>{system.error}</div>}
            {system.loading && !data && <div className={styles.loading}><span className={styles.spinner} /> Reading settings…</div>}

            <PlatformCard />

            {data && (
                <>
                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Server files</h2></div>
                        <dl className={styles.kv}>
                            <dt>Storage</dt>
                            <dd>{data.storage.backend === 'local' ? 'A folder on this machine' : 'A WebDAV server'}</dd>
                            <dt>{data.storage.backend === 'local' ? 'Folder (LOCAL_STORAGE_PATH)' : 'Base path'}</dt>
                            <dd className={styles.mono}>{data.storage.path ?? '—'}</dd>
                            {data.storage.hostPath && (<><dt>Same folder for Docker</dt><dd className={styles.mono}>{data.storage.hostPath}</dd></>)}
                            <dt>Delete folders with servers</dt>
                            <dd>{data.settings.deleteServerFolders ? 'Yes' : 'No, they are renamed instead'}</dd>
                        </dl>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div>
                                <h2>Import folders</h2>
                                <p className={styles.hint}>Servers and a Velocity proxy in these folders are found and can be managed. Set IMPORT_SCAN_PATHS, with <span className={styles.mono}>app=host</span> when Docker sees a folder under another path.</p>
                            </div>
                        </div>
                        {data.storage.importFolders.length === 0 ? (
                            <div className={styles.mutedText}>None. Only the storage folder is searched.</div>
                        ) : (
                            <ul className={styles.list}>
                                {data.storage.importFolders.map(folder => (
                                    <li key={folder.appPath}>
                                        <span className={styles.mono}>{folder.appPath}</span>
                                        <span className={styles.mutedText}>Docker: <span className={styles.mono}>{folder.hostPath}</span></span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Containers and network</h2></div>
                        <dl className={styles.kv}>
                            <dt>Server domain</dt>
                            <dd className={styles.mono}>{data.settings.serverDomain}</dd>
                            <dt>Containers run as</dt>
                            <dd className={styles.mono}>{data.settings.containerUser} <span className={styles.mutedText}>(CONTAINER_UID, CONTAINER_GID)</span></dd>
                            <dt>Container DNS</dt>
                            <dd className={styles.mono}>{data.settings.containerDns ?? 'Docker default'}</dd>
                            <dt>Portainer</dt>
                            <dd>
                                <span className={`${styles.badge} ${data.portainer.connected ? styles.ok : styles.bad}`}>{data.portainer.connected ? 'Connected' : 'Unreachable'}</span>{' '}
                                <span className={styles.mutedText}>{data.portainer.host}</span>
                            </dd>
                        </dl>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Velocity</h2></div>
                        <dl className={styles.kv}>
                            <dt>Configuration file</dt>
                            <dd className={styles.mono}>{data.settings.velocityConfigPath ?? 'Found automatically'}</dd>
                            <dt>If a reload fails</dt>
                            <dd>{data.settings.velocityReloadFallback === 'restart' ? 'Restart Velocity (players are disconnected)' : 'Leave it until the next restart'} <span className={styles.mutedText}>(VELOCITY_RELOAD_FALLBACK)</span></dd>
                        </dl>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}><h2>Application</h2></div>
                        <dl className={styles.kv}>
                            <dt>Node.js</dt>
                            <dd className={styles.mono}>{data.runtime.node}</dd>
                            <dt>Running for</dt>
                            <dd>{formatUptime(data.runtime.uptimeSeconds)}</dd>
                            <dt>Database</dt>
                            <dd><span className={`${styles.badge} ${data.database.connected ? styles.ok : styles.bad}`}>{data.database.connected ? 'Connected' : 'Offline'}</span></dd>
                        </dl>
                    </section>
                </>
            )}
        </>
    );
}
