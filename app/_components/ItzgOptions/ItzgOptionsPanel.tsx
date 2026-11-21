'use client';

import React, { useId, useMemo, useState } from 'react';
import {
    LOCKED_OPTIONS,
    getApplicableOptions,
    getRequiredJavaVersion,
    getServerType,
    groupOptions,
    isFloatingVersion,
    type OptionDefinition,
    type OptionTab,
    type OptionValue,
    type OptionValues,
} from '@/lib/data/itzg';
import styles from './ItzgOptionsPanel.module.scss';

interface ItzgOptionsPanelProps {
    /** Server type id, for example "paper" */
    type: string;
    /** Minecraft version, or LATEST */
    version: string;
    tab: OptionTab;
    /** Current values keyed by environment variable. Missing entries use the container default */
    values: OptionValues;
    /** Called with undefined when a value is cleared back to the default */
    onChange: (env: string, value: OptionValue | undefined) => void;
    /** Leave out options the page already has its own control for */
    omitFormManaged?: boolean;
    /** Show the Java version and the settings the platform controls */
    showPlatformInfo?: boolean;
    disabled?: boolean;
    /** Environment variables managed by the proxy network: shown, grayed out and not editable */
    lockedEnv?: string[];
}

function describeRestriction(option: OptionDefinition): string | null {
    const parts: string[] = [];

    if (option.minVersion && option.maxVersion) parts.push(`${option.minVersion} to before ${option.maxVersion}`);
    else if (option.minVersion) parts.push(`${option.minVersion}+`);
    else if (option.maxVersion) parts.push(`before ${option.maxVersion}`);

    if (option.types && option.types.length > 0) {
        const names = option.types.map(entry => {
            if (entry === 'plugins') return 'plugin servers';
            if (entry === 'mods') return 'mod servers';
            if (entry.startsWith('family:')) return `${entry.slice(7)} servers`;
            return getServerType(entry)?.name ?? entry;
        });
        parts.push(names.length > 3 ? `${names.slice(0, 3).join(', ')} and more` : names.join(', '));
    }

    return parts.length > 0 ? parts.join(' · ') : null;
}

function defaultLabel(option: OptionDefinition): string | undefined {
    if (option.defaultValue === undefined || option.defaultValue === '') return undefined;
    return typeof option.defaultValue === 'boolean' ? (option.defaultValue ? 'on' : 'off') : String(option.defaultValue);
}

interface FieldProps {
    option: OptionDefinition;
    value: OptionValue | undefined;
    onChange: (value: OptionValue | undefined) => void;
    disabled?: boolean;
    inputId: string;
}

const OptionField: React.FC<FieldProps> = ({ option, value, onChange, disabled, inputId }) => {
    const placeholder = option.placeholder ?? (defaultLabel(option) ? `Default: ${defaultLabel(option)}` : undefined);

    switch (option.kind) {
        case 'boolean': {
            const choices: Array<{ label: string; state: boolean | undefined }> = [
                { label: defaultLabel(option) ? `Default (${defaultLabel(option)})` : 'Default', state: undefined },
                { label: 'On', state: true },
                { label: 'Off', state: false },
            ];
            return (
                <div className={styles.segmented} role="radiogroup" aria-labelledby={`${inputId}-label`}>
                    {choices.map(choice => (
                        <button
                            key={choice.label}
                            type="button"
                            role="radio"
                            aria-checked={value === choice.state}
                            className={value === choice.state ? styles.segmentActive : styles.segment}
                            disabled={disabled}
                            onClick={() => onChange(choice.state)}
                        >
                            {choice.label}
                        </button>
                    ))}
                </div>
            );
        }
        case 'select':
            return (
                <select
                    id={inputId}
                    value={value === undefined ? '' : String(value)}
                    disabled={disabled}
                    onChange={event => onChange(event.target.value === '' ? undefined : event.target.value)}
                >
                    <option value="">{defaultLabel(option) ? `Default (${defaultLabel(option)})` : 'Default'}</option>
                    {option.choices?.map(choice => (
                        <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                </select>
            );
        case 'number':
            return (
                <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    value={value === undefined ? '' : String(value)}
                    min={option.min}
                    max={option.max}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={event => {
                        const text = event.target.value;
                        if (text === '') return onChange(undefined);
                        const number = Number(text);
                        if (Number.isFinite(number)) onChange(number);
                    }}
                />
            );
        case 'multiline':
        case 'list':
            return (
                <textarea
                    id={inputId}
                    rows={option.kind === 'list' ? 3 : 4}
                    value={value === undefined ? '' : String(value)}
                    placeholder={option.kind === 'list' ? (option.placeholder ?? 'One entry per line') : placeholder}
                    spellCheck={false}
                    disabled={disabled}
                    onChange={event => onChange(event.target.value === '' ? undefined : event.target.value)}
                />
            );
        case 'secret':
            return (
                <input
                    id={inputId}
                    type="password"
                    autoComplete="new-password"
                    value={value === undefined ? '' : String(value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={event => onChange(event.target.value === '' ? undefined : event.target.value)}
                />
            );
        default:
            return (
                <input
                    id={inputId}
                    type="text"
                    value={value === undefined ? '' : String(value)}
                    placeholder={placeholder}
                    spellCheck={false}
                    disabled={disabled}
                    onChange={event => onChange(event.target.value === '' ? undefined : event.target.value)}
                />
            );
    }
};

const ItzgOptionsPanel: React.FC<ItzgOptionsPanelProps> = ({
    type,
    version,
    tab,
    values,
    onChange,
    omitFormManaged = false,
    showPlatformInfo = false,
    disabled = false,
    lockedEnv = [],
}) => {
    const idPrefix = useId();
    const [query, setQuery] = useState('');
    const [showExpert, setShowExpert] = useState(false);

    const searching = query.trim() !== '';

    const options = useMemo(() => {
        const found = getApplicableOptions({ type, version, tab, expert: showExpert || searching, omitFormManaged });
        if (!searching) return found;

        const needle = query.trim().toLowerCase();
        return found.filter(option =>
            option.label.toLowerCase().includes(needle) ||
            option.env.toLowerCase().includes(needle) ||
            option.description.toLowerCase().includes(needle)
        );
    }, [type, version, tab, showExpert, searching, query, omitFormManaged]);

    const expertCount = useMemo(() => {
        const withExpert = getApplicableOptions({ type, version, tab, expert: true, omitFormManaged }).length;
        const withoutExpert = getApplicableOptions({ type, version, tab, expert: false, omitFormManaged }).length;
        return withExpert - withoutExpert;
    }, [type, version, tab, omitFormManaged]);

    const groups = useMemo(() => groupOptions(options), [options]);
    const definition = getServerType(type);
    const locked = showPlatformInfo ? LOCKED_OPTIONS : [];
    const customised = options.filter(option => values[option.env] !== undefined).length;

    return (
        <div className={styles.panel}>
            <div className={styles.toolbar}>
                <input
                    type="search"
                    className={styles.search}
                    placeholder="Search settings"
                    aria-label="Search settings"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                />
                <span className={styles.count}>
                    {options.length} setting{options.length === 1 ? '' : 's'}
                    {customised > 0 && ` · ${customised} changed`}
                </span>
                {expertCount > 0 && !searching && (
                    <button
                        type="button"
                        className={styles.expertToggle}
                        aria-pressed={showExpert}
                        onClick={() => setShowExpert(current => !current)}
                    >
                        {showExpert ? 'Hide' : 'Show'} {expertCount} expert setting{expertCount === 1 ? '' : 's'}
                    </button>
                )}
            </div>

            {showPlatformInfo && (
                <div className={styles.platform}>
                    <div className={styles.platformRow}>
                        <span className={styles.platformLabel}>Java</span>
                        <span>
                            {isFloatingVersion(version) || definition?.versionFromPack
                                ? 'Latest, chosen for the newest Minecraft release'
                                : `Java ${getRequiredJavaVersion(version)}, chosen for Minecraft ${version}`}
                        </span>
                        <span className={styles.lockNote}>Set automatically</span>
                    </div>
                </div>
            )}

            {groups.length === 0 && (
                <p className={styles.empty}>
                    {searching ? 'No settings match your search.' : 'There are no settings here for this server type and version.'}
                </p>
            )}

            {groups.map((group, index) => (
                <details key={`${group.name}-${searching}`} className={styles.group} open={searching || index === 0}>
                    <summary>
                        <span>{group.name}</span>
                        <span className={styles.groupCount}>{group.options.length}</span>
                    </summary>
                    <div className={styles.fields}>
                        {group.options.map(option => {
                            const inputId = `${idPrefix}-${option.env}`;
                            const restriction = describeRestriction(option);
                            const value = values[option.env];
                            const wide = option.kind === 'multiline' || option.kind === 'list';
                            const isLocked = lockedEnv.includes(option.env);

                            return (
                                <div key={option.env} className={wide ? styles.fieldWide : styles.field} style={isLocked ? { opacity: 0.55 } : undefined}>
                                    <div className={styles.fieldHead}>
                                        <label id={`${inputId}-label`} htmlFor={option.kind === 'boolean' ? undefined : inputId}>
                                            {option.label}
                                        </label>
                                        {value !== undefined && (
                                            <button
                                                type="button"
                                                className={styles.reset}
                                                disabled={disabled || isLocked}
                                                onClick={() => onChange(option.env, undefined)}
                                                aria-label={`Reset ${option.label} to the default`}
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                    <OptionField
                                        option={option}
                                        value={value}
                                        onChange={next => onChange(option.env, next)}
                                        disabled={disabled || isLocked}
                                        inputId={inputId}
                                    />
                                    <p className={styles.help}>{isLocked ? 'Managed by the proxy network. Only an administrator can change it.' : option.description}</p>
                                    <p className={styles.meta}>
                                        <code>{option.env}</code>
                                        {restriction && <span>{restriction}</span>}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </details>
            ))}

            {locked.length > 0 && (
                <details className={styles.group}>
                    <summary>
                        <span>Managed by the platform</span>
                        <span className={styles.groupCount}>{locked.length}</span>
                    </summary>
                    <ul className={styles.lockedList}>
                        {locked.map(option => (
                            <li key={option.env}>
                                <strong>{option.label}</strong> <code>{option.env}</code>
                                <span>{option.locked}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
};

export default ItzgOptionsPanel;
