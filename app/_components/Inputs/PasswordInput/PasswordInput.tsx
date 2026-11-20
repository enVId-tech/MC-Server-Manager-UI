'use client';

import React, { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import styles from './PasswordInput.module.scss';

interface PasswordInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    autoComplete: 'current-password' | 'new-password';
    placeholder?: string;
    minLength?: number;
    required?: boolean;
    describedBy?: string;
}

/**
 * Password field with a show/hide toggle so people can check what they typed.
 */
export default function PasswordInput({
    id,
    value,
    onChange,
    autoComplete,
    placeholder,
    minLength,
    required = true,
    describedBy,
}: PasswordInputProps) {
    const [visible, setVisible] = useState(false);

    return (
        <div className={styles.wrapper}>
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                autoComplete={autoComplete}
                placeholder={placeholder}
                minLength={minLength}
                required={required}
                aria-describedby={describedBy}
            />
            <button
                type="button"
                className={styles.toggle}
                onClick={() => setVisible((current) => !current)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
            >
                {visible ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
            </button>
        </div>
    );
}
