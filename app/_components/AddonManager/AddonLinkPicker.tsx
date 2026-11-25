'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { checkAddonCompatibility, type AddonCompatibilityTarget } from '@/lib/server/addons/compatibility';
import styles from './AddonManager.module.scss';

interface Lookup {
    source: string;
    sourceLabel: string;
    name: string | null;
    description?: string;
    icon?: string;
    kinds?: Array<'plugin' | 'mod'>;
    loaders?: string[];
    downloadable: boolean;
    note?: string;
}
interface Entry { link: string; lookup?: Lookup; error?: string }

/**
 * Chooses plugins and mods by link while a server is being created. They are downloaded and installed after the
 * server exists. One link at a time shows its name, logo, and compatibility warnings; advanced mode takes one
 * link per line. Only known sites get a lookup. Other links are for administrators.
 */
export default function AddonLinkPicker({ links, onChange, allowOther, noun, serverCapabilities }: {
    links: string[];
    onChange: (links: string[]) => void;
    allowOther: boolean;
    noun: string;
    serverCapabilities?: AddonCompatibilityTarget;
}) {
    const [value, setValue] = useState('');
    const [lookup, setLookup] = useState<Lookup | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [advanced, setAdvanced] = useState(false);
    const [bulk, setBulk] = useState('');
    const [entries, setEntries] = useState<Record<string, Entry>>({});
    const seq = useRef(0);

    useEffect(() => {
        const text = value.trim();
        if (advanced || text.length < 8) return;
        const mine = ++seq.current;
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/server/addons/lookup?link=${encodeURIComponent(text)}`);
                const body = await response.json();
                if (mine !== seq.current) return;
                if (!response.ok) setError(body.message ?? 'The link could not be read.'); else setLookup(body.lookup);
            } catch {
                if (mine === seq.current) setError('The link could not be read.');
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [value, advanced]);

    const blockedOther = lookup?.source === 'other' && !allowOther;
    const warningFor = (item?: Lookup | null) => {
        if (!item || !serverCapabilities) return null;
        return checkAddonCompatibility(
            { name: item.name, source: item.source, kinds: item.kinds ?? [], loaders: item.loaders },
            serverCapabilities
        );
    };
    const previewWarning = warningFor(lookup);

    const add = (list: string[], found?: Lookup) => {
        const fresh = list.map(entry => entry.trim()).filter(entry => entry && !links.includes(entry));
        if (fresh.length === 0) return;
        onChange([...links, ...fresh].slice(0, 50));
        if (found && fresh.length === 1) setEntries(previous => ({ ...previous, [fresh[0]]: { link: fresh[0], lookup: found } }));
    };

    return (
        <div className={styles.wrap}>
            <div className={styles.head}>
                <span className={styles.muted}>Add {noun} by link. Modrinth, SpigotMC, Bukkit and CurseForge links show a preview and update themselves.</span>
                <button type="button" className={styles.btn} onClick={() => setAdvanced(current => !current)}>{advanced ? 'Single link' : 'Advanced: many links'}</button>
            </div>

            {advanced ? (
                <div className={styles.wrap}>
                    <textarea className={styles.textarea} value={bulk} onChange={event => setBulk(event.target.value)} placeholder={'One link per line'} />
                    <div><button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!bulk.trim()} onClick={() => { add(bulk.split(/\r?\n/)); setBulk(''); }}>Add all</button></div>
                </div>
            ) : (
                <>
                    <div className={styles.addRow}>
                        <input className={styles.input} value={value} onChange={event => { setValue(event.target.value); setLookup(null); setError(null); }} placeholder={`Paste a link to a ${noun.replace(/s$/, '').replace(' and ', ' or ')}`} />
                        <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!value.trim() || !!error || blockedOther || lookup?.downloadable === false}
                            onClick={() => { add([value], lookup ?? undefined); setValue(''); setLookup(null); }}>Add</button>
                    </div>
                    {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
                    {blockedOther && <div className={styles.notice}>Only links to Modrinth, SpigotMC, Bukkit and CurseForge can be used. Other links need an administrator.</div>}
                    {lookup && lookup.source !== 'other' && (
                        <div className={styles.preview}>
                            {lookup.icon ? <img className={styles.logo} src={lookup.icon} alt="" referrerPolicy="no-referrer" /> : <div className={styles.logo} />}
                            <div className={styles.previewBody}>
                                <strong>{lookup.name}<span className={styles.pill}>{lookup.sourceLabel}</span></strong>
                                {lookup.description && <p>{lookup.description}</p>}
                                {lookup.note && <p>{lookup.note}</p>}
                            </div>
                        </div>
                    )}
                    {previewWarning && (
                        <div className={`${styles.notice} ${styles.warning}`}>
                            <FaExclamationTriangle aria-hidden="true" /> <strong>May not be compatible:</strong> {previewWarning} You can still add it if intended.
                        </div>
                    )}
                </>
            )}

            <div className={styles.list}>
                {links.map(link => {
                    const info = entries[link]?.lookup;
                    const itemWarning = warningFor(info);
                    return (
                        <div className={styles.item} key={link}>
                            {info?.icon ? <img className={styles.logo} src={info.icon} alt="" referrerPolicy="no-referrer" /> : <div className={styles.logo} />}
                            <div className={styles.itemBody}>
                                <strong>
                                    {info?.name ?? link}
                                    {itemWarning && <span className={`${styles.pill} ${styles.warningPill}`} title={itemWarning}>may not be compatible</span>}
                                </strong>
                                <span className={styles.itemMeta}>{info?.sourceLabel ?? link}</span>
                                {itemWarning && <span className={styles.warnText}>{itemWarning}</span>}
                            </div>
                            <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => onChange(links.filter(entry => entry !== link))} aria-label="Remove"><FaTimes /></button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
