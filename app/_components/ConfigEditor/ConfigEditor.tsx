'use client';

import React, { useMemo, useState } from 'react';
import {
    parseProperties,
    parseStructured,
    setPropertyValue,
    setStructuredValue,
    type ConfigFormat,
    type ConfigPath,
} from '@/lib/data/configFiles';
import { getServerPropertiesForVersion, type PropertyDefinition } from '@/lib/data/serverProperties';
import styles from './ConfigEditor.module.scss';

interface ConfigEditorProps {
    format: ConfigFormat;
    content: string;
    onChange: (content: string) => void;
    /** Used to describe server.properties keys */
    version?: string;
}

/** A form for a configuration file. Edits go straight into the file text, so comments and layout survive. */
export default function ConfigEditor({ format, content, onChange, version = 'latest' }: ConfigEditorProps) {
    const [filter, setFilter] = useState('');

    return (
        <div className={styles.editor}>
            <input
                type="search"
                className={styles.search}
                placeholder="Search settings"
                aria-label="Search settings"
                value={filter}
                onChange={event => setFilter(event.target.value)}
            />
            {format === 'properties'
                ? <PropertiesForm content={content} onChange={onChange} filter={filter} version={version} />
                : <StructuredForm format={format} content={content} onChange={onChange} filter={filter} />}
        </div>
    );
}

/* ---------- server.properties ---------- */

function PropertiesForm({ content, onChange, filter, version }: { content: string; onChange: (text: string) => void; filter: string; version: string }) {
    const entries = useMemo(() => parseProperties(content), [content]);
    const definitions = useMemo(() => {
        const map = new Map<string, PropertyDefinition>();
        try {
            for (const definition of getServerPropertiesForVersion(version)) map.set(definition.key, definition);
        } catch {
            // the file is still editable without descriptions
        }
        return map;
    }, [version]);

    const needle = filter.trim().toLowerCase();
    const shown = entries.filter(entry => !needle || entry.key.toLowerCase().includes(needle) || (definitions.get(entry.key)?.displayName ?? '').toLowerCase().includes(needle));
    const missing = [...definitions.values()].filter(definition => !definition.serverManaged
        && !entries.some(entry => entry.key === definition.key)
        && (!needle || definition.key.toLowerCase().includes(needle)));
    const [adding, setAdding] = useState('');

    return (
        <div className={styles.rows}>
            {shown.map(entry => {
                const definition = definitions.get(entry.key);
                return (
                    <div key={entry.key} className={styles.row}>
                        <div className={styles.label}>
                            <span className={styles.key}>{entry.key}</span>
                            {definition?.description && <span className={styles.description}>{definition.description}</span>}
                        </div>
                        <ValueInput
                            value={entry.value}
                            definition={definition}
                            onValue={value => onChange(setPropertyValue(content, entry.key, value))}
                        />
                    </div>
                );
            })}
            {shown.length === 0 && <p className={styles.empty}>No settings match.</p>}

            <div className={styles.add}>
                <label htmlFor="add-property">Add a setting</label>
                <input
                    id="add-property"
                    list="known-properties"
                    value={adding}
                    placeholder="property-name"
                    onChange={event => setAdding(event.target.value)}
                />
                <datalist id="known-properties">
                    {missing.map(definition => <option key={definition.key} value={definition.key} />)}
                </datalist>
                <button
                    type="button"
                    disabled={!/^[a-zA-Z0-9._-]+$/.test(adding)}
                    onClick={() => {
                        const definition = definitions.get(adding);
                        onChange(setPropertyValue(content, adding, definition ? String(definition.defaultValue) : ''));
                        setAdding('');
                    }}
                >
                    Add
                </button>
            </div>
        </div>
    );
}

function ValueInput({ value, definition, onValue }: { value: string; definition?: PropertyDefinition; onValue: (value: string) => void }) {
    if (definition?.type === 'boolean' || value === 'true' || value === 'false') {
        return (
            <label className={styles.toggle}>
                <input type="checkbox" checked={value === 'true'} onChange={event => onValue(String(event.target.checked))} />
                <span>{value === 'true' ? 'On' : 'Off'}</span>
            </label>
        );
    }
    if (definition?.type === 'select' && definition.validValues) {
        const options = definition.validValues.map(String);
        return (
            <select value={value} onChange={event => onValue(event.target.value)}>
                {!options.includes(value) && <option value={value}>{value || '(empty)'}</option>}
                {options.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
        );
    }
    if (definition?.type === 'number' || /^-?\d+$/.test(value)) {
        return (
            <input
                type="number"
                value={value}
                min={definition?.min}
                max={definition?.max}
                onChange={event => onValue(event.target.value)}
            />
        );
    }
    return <input type="text" value={value} onChange={event => onValue(event.target.value)} />;
}

/* ---------- yaml and json ---------- */

function StructuredForm({ format, content, onChange, filter }: { format: 'yaml' | 'json'; content: string; onChange: (text: string) => void; filter: string }) {
    const parsed = useMemo(() => parseStructured(content, format), [content, format]);
    const [failure, setFailure] = useState<string | null>(null);

    if (parsed.error) {
        return <p className={styles.error}>This file has a syntax error, so it can only be edited as text: {parsed.error}</p>;
    }

    const update = (path: ConfigPath, value: unknown) => {
        try {
            onChange(setStructuredValue(content, format, path, value));
            setFailure(null);
        } catch (error) {
            setFailure(error instanceof Error ? error.message : 'Could not change the file.');
        }
    };

    return (
        <div className={styles.tree}>
            {failure && <p className={styles.error}>{failure}</p>}
            <Node value={parsed.data} path={[]} label={null} depth={0} filter={filter.trim().toLowerCase()} update={update} />
        </div>
    );
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isScalar = (value: unknown) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** True when this node or anything under it matches the search */
function matches(value: unknown, label: string, filter: string): boolean {
    if (!filter) return true;
    if (label.toLowerCase().includes(filter)) return true;
    if (isScalar(value)) return String(value).toLowerCase().includes(filter);
    const children: [string, unknown][] = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value as object);
    return children.some(([key, child]) => matches(child, key, filter));
}

function Node({ value, path, label, depth, filter, update }: {
    value: unknown;
    path: ConfigPath;
    label: string | null;
    depth: number;
    filter: string;
    update: (path: ConfigPath, value: unknown) => void;
}) {
    if (label !== null && !matches(value, label, filter)) return null;

    if (isObject(value)) {
        const children = Object.entries(value).map(([key, child]) => (
            <Node key={key} value={child} path={[...path, key]} label={key} depth={depth + 1} filter={filter} update={update} />
        ));
        if (label === null) return <>{children}</>;
        return (
            <details className={styles.group} open={depth < 2 || filter !== ''}>
                <summary>{label}</summary>
                <div className={styles.groupBody}>{children.length ? children : <p className={styles.empty}>Empty</p>}</div>
            </details>
        );
    }

    if (Array.isArray(value) && value.every(isScalar)) {
        const numeric = value.length > 0 && value.every(item => typeof item === 'number');
        return (
            <div className={styles.row}>
                <div className={styles.label}><span className={styles.key}>{label}</span><span className={styles.description}>One entry per line</span></div>
                <textarea
                    rows={Math.min(8, Math.max(2, value.length + 1))}
                    value={value.map(item => String(item ?? '')).join('\n')}
                    onChange={event => {
                        const items = event.target.value.split('\n').filter(item => item !== '');
                        update(path, numeric ? items.map(Number).filter(item => !Number.isNaN(item)) : items);
                    }}
                />
            </div>
        );
    }

    if (Array.isArray(value)) {
        return (
            <details className={styles.group} open={filter !== ''}>
                <summary>{label} ({value.length})</summary>
                <div className={styles.groupBody}>
                    {value.map((item, index) => (
                        <Node key={index} value={item} path={[...path, index]} label={`#${index + 1}`} depth={depth + 1} filter={filter} update={update} />
                    ))}
                </div>
            </details>
        );
    }

    return (
        <div className={styles.row}>
            <div className={styles.label}><span className={styles.key}>{label}</span></div>
            {typeof value === 'boolean' ? (
                <label className={styles.toggle}>
                    <input type="checkbox" checked={value} onChange={event => update(path, event.target.checked)} />
                    <span>{value ? 'On' : 'Off'}</span>
                </label>
            ) : typeof value === 'number' ? (
                <input
                    type="number"
                    step="any"
                    value={value}
                    onChange={event => event.target.value !== '' && update(path, Number(event.target.value))}
                />
            ) : typeof value === 'string' && (value.includes('\n') || value.length > 80) ? (
                <textarea rows={4} value={value} onChange={event => update(path, event.target.value)} />
            ) : (
                <input type="text" value={value === null ? '' : String(value)} onChange={event => update(path, event.target.value)} />
            )}
        </div>
    );
}
