'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ItzgOptionsPanel from '@/app/_components/ItzgOptions/ItzgOptionsPanel';
import ServerPropertiesSection from '@/app/manager/servers/create/ServerPropertiesSection';
import {
    getApplicableOptions,
    getServerType,
    readOptionValue,
    supportsMods,
    supportsPlugins,
    type OptionTab,
    type OptionValue,
    type OptionValues,
} from '@/lib/data/itzg';
import styles from './ServerSettings.module.scss';

interface LoadedSettings {
    serverType: string;
    version: string;
    form: Record<string, unknown>;
    itzgEnv: OptionValues;
    serverProperties: Record<string, string>;
    lockedEnv?: string[];
    lockedProperties?: string[];
}

type SettingsTab = OptionTab | 'properties';

interface Feedback {
    kind: 'success' | 'error' | 'info';
    text: string;
}

const TAB_ORDER: SettingsTab[] = ['general', 'world', 'mods', 'advanced', 'properties'];

/** Every setting of the Minecraft container, editable from the server dashboard. */
export default function ServerSettings({ serverSlug }: { serverSlug: string }) {
    const [loaded, setLoaded] = useState<LoadedSettings | null>(null);
    const [values, setValues] = useState<OptionValues>({});
    const [properties, setProperties] = useState<Record<string, string>>({});
    const [tab, setTab] = useState<SettingsTab>('general');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const response = await fetch(`/api/server/settings?server=${encodeURIComponent(serverSlug)}`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Failed to load settings.');
                if (cancelled) return;

                const settings = data as LoadedSettings;
                const initial: OptionValues = {};
                for (const option of getApplicableOptions({ type: settings.serverType, version: settings.version, expert: true })) {
                    const value = readOptionValue(option, settings.form as Record<string, unknown>, settings.itzgEnv);
                    if (value !== undefined) initial[option.env] = value;
                }
                setLoaded(settings);
                setValues(initial);
                setProperties(settings.serverProperties ?? {});
                setDirty(false);
            } catch (error) {
                if (!cancelled) setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Failed to load settings.' });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [serverSlug]);

    const handleChange = useCallback((env: string, value: OptionValue | undefined) => {
        setValues(previous => {
            const next = { ...previous };
            if (value === undefined) delete next[env];
            else next[env] = value;
            return next;
        });
        setDirty(true);
    }, []);

    const handleProperties = useCallback((updated: Record<string, string | number | boolean>) => {
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(updated)) next[key] = String(value);
        setProperties(next);
        setDirty(true);
    }, []);

    const tabs = useMemo(() => {
        if (!loaded) return [];
        return TAB_ORDER.filter(candidate => {
            if (candidate === 'properties') return true;
            return getApplicableOptions({ type: loaded.serverType, version: loaded.version, tab: candidate, expert: true }).length > 0
                || (candidate === 'mods' && (supportsMods(loaded.serverType) || supportsPlugins(loaded.serverType)));
        });
    }, [loaded]);

    const save = async (apply: boolean) => {
        setSaving(true);
        setFeedback(null);
        try {
            const response = await fetch('/api/server/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server: serverSlug, values, serverProperties: properties, apply }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to save settings.');

            const rejected = Object.keys(data.rejected ?? {});
            setFeedback({
                kind: data.applyError ? 'error' : 'success',
                text: `${data.message}${data.applyError ? ` (${data.applyError})` : ''}${rejected.length ? ` Ignored: ${rejected.join(', ')}.` : ''}`,
            });
            setDirty(false);
        } catch (error) {
            setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Failed to save settings.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className={styles.state}>Loading settings…</div>;
    if (!loaded) return <div className={styles.state}>{feedback?.text ?? 'Settings are not available.'}</div>;

    const serverType = getServerType(loaded.serverType);
    const tabLabels: Record<SettingsTab, string> = {
        general: 'General',
        world: 'World',
        mods: serverType?.versionFromPack ? 'Modpack' : 'Plugins & Mods',
        advanced: 'Advanced',
        properties: 'server.properties',
    };

    return (
        <div className={styles.settings}>
            <div className={styles.header}>
                <p className={styles.summary}>
                    {serverType?.name ?? loaded.serverType} {loaded.version === 'LATEST' ? '(latest)' : loaded.version}.
                    Changes are saved here and take effect when the server is recreated, which keeps its world and files.
                </p>
                <div className={styles.actions}>
                    <button type="button" className={styles.secondary} disabled={saving || !dirty} onClick={() => save(false)}>
                        Save
                    </button>
                    <button type="button" className={styles.primary} disabled={saving || !dirty} onClick={() => save(true)}>
                        {saving ? 'Saving…' : 'Save and apply'}
                    </button>
                </div>
            </div>

            {loaded.lockedEnv && (
                <div className={`${styles.feedback} ${styles.info}`} role="note">
                    Ports, memory, RCON, the proxy network and the other options that depend on the host are managed by the administrators and are grayed out.
                </div>
            )}

            {feedback && (
                <div className={`${styles.feedback} ${styles[feedback.kind]}`} role="status">{feedback.text}</div>
            )}

            <div className={styles.tabs} role="tablist">
                {tabs.map(id => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        className={`${styles.tab} ${tab === id ? styles.active : ''}`}
                        onClick={() => setTab(id)}
                    >
                        {tabLabels[id]}
                    </button>
                ))}
            </div>

            {tab === 'properties' ? (
                <>
                    <p className={styles.hint}>
                        Everything that goes into server.properties. Settings that also exist as container settings,
                        such as the MOTD or max players, are applied on every start.
                    </p>
                    <ServerPropertiesSection
                        version={loaded.version}
                        onPropertiesChange={handleProperties}
                        initialProperties={properties}
                        lockedKeys={loaded.lockedProperties}
                    />
                </>
            ) : (
                <ItzgOptionsPanel
                    key={tab}
                    type={loaded.serverType}
                    version={loaded.version}
                    tab={tab}
                    values={values}
                    onChange={handleChange}
                    showPlatformInfo={tab === 'advanced'}
                    lockedEnv={loaded.lockedEnv}
                />
            )}
        </div>
    );
}
