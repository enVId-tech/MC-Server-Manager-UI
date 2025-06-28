import React from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import styles from './Error.module.scss';

interface ErrorProps {
  title?: string;
  message: string;
  details?: string;
  onClose?: () => void;
  type?: 'error' | 'warning' | 'info';
}

export default function Error({ 
  title = 'Error', 
  message, 
  details, 
  onClose, 
  type = 'error' 
}: ErrorProps) {
  return (
    <div className={`${styles.errorContainer} ${styles[type]}`}>
      <div className={styles.errorHeader}>
        <div className={styles.errorIcon}>
          <FiAlertTriangle />
        </div>
        <div className={styles.errorContent}>
          <h3 className={styles.errorTitle}>{title}</h3>
          <p className={styles.errorMessage}>{message}</p>
        </div>
        {onClose && (
          <button 
            className={styles.closeButton}
            onClick={onClose}
            type="button"
            aria-label="Close error"
          >
            <FiX />
          </button>
        )}
      </div>
      {details && (
        <div className={styles.errorDetails}>
          <p>{details}</p>
        </div>
      )}
    </div>
  );
}