'use client';

import React from 'react';
import styles from './WorldUpload.module.scss';

export interface WorldJudgementView {
    status: 'ok' | 'upgrade' | 'downgrade' | 'blocked';
    requiresAcknowledgement: boolean;
    message: string;
}

/**
 * What the checks say about a world for a server version. Worlds across 1.17 or 26.1 are refused; a world from a
 * newer version is an unsupported downgrade, shown in red until the person confirms they understand the risk.
 */
export default function WorldVerdict({ judgement, levelName, accepted, onAccept }: {
    judgement: WorldJudgementView; levelName?: string; accepted: boolean; onAccept: (value: boolean) => void;
}) {
    if (judgement.status === 'blocked') return <div className={styles.blocked} role="alert">Cannot be used: {judgement.message}</div>;
    if (judgement.status === 'downgrade') {
        return (
            <div className={styles.danger} role="alert">
                <h3>Warning: unsupported downgrade</h3>
                <p>{judgement.message}</p>
                <label>
                    <input type="checkbox" checked={accepted} onChange={event => onAccept(event.target.checked)} />
                    I understand that this is not supported, the world may be damaged or fail to load, and I have a copy of the original.
                </label>
            </div>
        );
    }
    return <div className={styles.info}>{levelName ? <strong>{levelName}. </strong> : null}{judgement.message}</div>;
}
