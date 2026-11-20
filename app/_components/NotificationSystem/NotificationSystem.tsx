'use client';
import React, { useEffect, useState } from 'react';
import { FaCheck, FaTimes, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';
import { useNotifications, type ConfirmDialogData } from '@/lib/contexts/NotificationContext';
import styles from './NotificationSystem.module.scss';

/** Body and buttons of the confirmation dialog. Keyed by the dialog so the typed text starts empty every time. */
const ConfirmDialogBody: React.FC<{ dialog: ConfirmDialogData; onClose: () => void }> = ({ dialog, onClose }) => {
    const [typed, setTyped] = useState('');
    const mismatch = dialog.requireText !== undefined && typed !== dialog.requireText;

    return (
        <>
            <div className={styles.dialogContent}>
                <p id="confirm-dialog-message" className={styles.dialogMessage}>{dialog.message}</p>
                {dialog.requireText !== undefined && (
                    <div className={styles.dialogConfirmText}>
                        <label htmlFor="confirm-dialog-input" className={styles.dialogConfirmPrompt}>
                            {dialog.requireTextPrompt ?? 'To confirm, type:'}
                        </label>
                        <p className={styles.dialogConfirmValue}><strong>{dialog.requireText}</strong></p>
                        <input
                            id="confirm-dialog-input"
                            type="text"
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                            className={`${styles.dialogInput} ${typed && mismatch ? styles.invalid : ''}`}
                            value={typed}
                            placeholder={dialog.requireText}
                            onChange={(event) => setTyped(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !mismatch) {
                                    dialog.onConfirm();
                                    onClose();
                                }
                            }}
                        />
                        {typed && mismatch && <p className={styles.dialogInputError}>This does not match</p>}
                    </div>
                )}
            </div>
            <div className={styles.dialogActions}>
                <button
                    autoFocus={dialog.requireText === undefined}
                    className={`${styles.dialogButton} ${styles.cancel}`}
                    onClick={() => {
                        dialog.onCancel?.();
                        onClose();
                    }}
                >
                    {dialog.cancelText}
                </button>
                <button
                    disabled={mismatch}
                    className={`${styles.dialogButton} ${styles.confirm} ${dialog.variant === 'danger' ? styles.danger : ''}`}
                    onClick={() => {
                        dialog.onConfirm();
                        onClose();
                    }}
                >
                    {dialog.confirmText}
                </button>
            </div>
        </>
    );
};

const NotificationSystem: React.FC = () => {
    const { notifications, confirmDialog, removeNotification, hideConfirmDialog } = useNotifications();

    // Handle Escape key to close confirmation dialog
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && confirmDialog) {
                if (confirmDialog.onCancel) {
                    confirmDialog.onCancel();
                }
                hideConfirmDialog();
            }
        };

        if (confirmDialog) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [confirmDialog, hideConfirmDialog]);

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'success':
                return <FaCheck className={styles.notificationIcon} />;
            case 'error':
                return <FaTimes className={styles.notificationIcon} />;
            case 'warning':
                return <FaExclamationTriangle className={styles.notificationIcon} />;
            case 'info':
                return <FaInfoCircle className={styles.notificationIcon} />;
            default:
                return <FaInfoCircle className={styles.notificationIcon} />;
        }
    };

    return (
        <>
            {/* Notifications */}
            <div className={styles.notificationContainer} aria-live="polite">
                {notifications.map((notification) => (
                    <div
                        key={notification.id}
                        role={notification.type === 'error' ? 'alert' : 'status'}
                        className={`${styles.notification} ${styles[notification.type]}`}
                    >
                        <div className={styles.notificationContent}>
                            {getNotificationIcon(notification.type)}
                            <div className={styles.notificationText}>
                                {notification.title && (
                                    <div className={styles.notificationTitle}>{notification.title}</div>
                                )}
                                <div className={styles.notificationMessage}>{notification.message}</div>
                            </div>
                            <button
                                className={styles.notificationClose}
                                aria-label="Dismiss notification"
                                onClick={() => removeNotification(notification.id)}
                            >
                                <FaTimes />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Confirmation Dialog */}
            {confirmDialog && (
                <div
                    className={styles.modalOverlay}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            if (confirmDialog.onCancel) {
                                confirmDialog.onCancel();
                            }
                            hideConfirmDialog();
                        }
                    }}
                >
                    <div
                        className={styles.confirmDialog}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="confirm-dialog-title"
                        aria-describedby="confirm-dialog-message"
                    >
                        <div className={styles.dialogHeader}>
                            <h3 id="confirm-dialog-title" className={styles.dialogTitle}>{confirmDialog.title}</h3>
                        </div>
                        <ConfirmDialogBody key={confirmDialog.id} dialog={confirmDialog} onClose={hideConfirmDialog} />
                    </div>
                </div>
            )}
        </>
    );
};

export default NotificationSystem;
