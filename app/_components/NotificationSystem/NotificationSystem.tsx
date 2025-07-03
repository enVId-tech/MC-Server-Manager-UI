'use client';
import React, { useEffect } from 'react';
import { FaCheck, FaTimes, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from './NotificationSystem.module.scss';

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
      <div className={styles.notificationContainer}>
        {notifications.map((notification) => (
          <div
            key={notification.id}
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
          <div className={styles.confirmDialog}>
            <div className={styles.dialogHeader}>
              <h3 className={styles.dialogTitle}>{confirmDialog.title}</h3>
            </div>
            <div className={styles.dialogContent}>
              <p className={styles.dialogMessage}>{confirmDialog.message}</p>
            </div>
            <div className={styles.dialogActions}>
              <button
                className={`${styles.dialogButton} ${styles.cancel}`}
                onClick={() => {
                  if (confirmDialog.onCancel) {
                    confirmDialog.onCancel();
                  }
                  hideConfirmDialog();
                }}
              >
                {confirmDialog.cancelText}
              </button>
              <button
                className={`${styles.dialogButton} ${styles.confirm} ${
                  confirmDialog.variant === 'danger' ? styles.danger : ''
                }`}
                onClick={() => {
                  confirmDialog.onConfirm();
                  hideConfirmDialog();
                }}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NotificationSystem;
