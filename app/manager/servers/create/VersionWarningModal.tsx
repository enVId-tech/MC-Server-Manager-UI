import React from 'react';
import styles from './create-main.module.scss';

interface VersionWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSwitchVersion: () => void;
  currentVersion: string;
  detectedVersion: string;
  fileName: string;
  isUpgrade: boolean;
  isDowngrade: boolean;
}

const VersionWarningModal: React.FC<VersionWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onSwitchVersion,
  currentVersion,
  detectedVersion,
  fileName,
  isUpgrade,
  isDowngrade
}) => {
  if (!isOpen) return null;

  const getWarningLevel = () => {
    if (isDowngrade) return 'danger';
    if (isUpgrade) return 'warning';
    return 'info';
  };

  const getWarningIcon = () => {
    if (isDowngrade) return '⚠️';
    if (isUpgrade) return '⬆️';
    return 'ℹ️';
  };

  const getWarningTitle = () => {
    if (isDowngrade) return 'Version Downgrade Detected - High Risk';
    if (isUpgrade) return 'Version Upgrade Detected - Caution Required';
    return 'Version Mismatch Detected';
  };

  const getWarningMessage = () => {
    if (isDowngrade) {
      return `The world file "${fileName}" was created in Minecraft ${detectedVersion}, but you're trying to use Minecraft ${currentVersion}. Downgrading world versions is extremely dangerous and may cause:`;
    }
    if (isUpgrade) {
      return `The world file "${fileName}" was created in Minecraft ${detectedVersion}, but you're trying to use Minecraft ${currentVersion}. Upgrading world versions may cause:`;
    }
    return `The world file "${fileName}" was created in Minecraft ${detectedVersion}, but you're trying to use Minecraft ${currentVersion}.`;
  };

  const getRiskList = () => {
    if (isDowngrade) {
      return [
        'Complete world corruption and data loss',
        'Missing or broken blocks and items',
        'Chunk generation errors and world holes',
        'Game crashes and performance issues',
        'Irreversible damage to your world'
      ];
    }
    if (isUpgrade) {
      return [
        'New blocks may appear in unexpected places',
        'Some game mechanics might change',
        'Mods/plugins may become incompatible',
        'World generation differences in new chunks',
        'Difficulty reverting to the previous version'
      ];
    }
    return [];
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${styles[getWarningLevel()]}`}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            <span className={styles.warningIcon}>{getWarningIcon()}</span>
            {getWarningTitle()}
          </h2>
        </div>
        
        <div className={styles.modalContent}>
          <p className={styles.warningMessage}>
            {getWarningMessage()}
          </p>

          {getRiskList().length > 0 && (
            <div className={styles.riskList}>
              <h4>Potential Issues:</h4>
              <ul>
                {getRiskList().map((risk, index) => (
                  <li key={index}>{risk}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.versionComparison}>
            <div className={styles.versionInfo}>
              <span className={styles.versionLabel}>World Version:</span>
              <span className={styles.versionValue}>{detectedVersion}</span>
            </div>
            <div className={styles.versionArrow}>
              {isDowngrade ? '↓' : isUpgrade ? '↑' : '≠'}
            </div>
            <div className={styles.versionInfo}>
              <span className={styles.versionLabel}>Server Version:</span>
              <span className={styles.versionValue}>{currentVersion}</span>
            </div>
          </div>

          <div className={styles.recommendationBox}>
            <h4>🎯 Recommendation:</h4>
            <p>
              {isDowngrade 
                ? `We strongly recommend switching to Minecraft ${detectedVersion} to match your world file. This will prevent data loss.`
                : isUpgrade
                ? `Consider switching to Minecraft ${detectedVersion} for compatibility, or proceed with caution understanding the upgrade risks.`
                : `Switch to Minecraft ${detectedVersion} for optimal compatibility.`
              }
            </p>
          </div>
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            onClick={onSwitchVersion}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            Switch to {detectedVersion} (Recommended)
          </button>
          
          <button
            type="button"
            onClick={onConfirm}
            className={`${styles.btn} ${
              isDowngrade ? styles.btnDanger : styles.btnWarning
            }`}
          >
            {isDowngrade 
              ? `Continue with ${currentVersion} (Risky)`
              : `Keep ${currentVersion}`
            }
          </button>

          <button
            type="button"
            onClick={onClose}
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            Cancel
          </button>
        </div>

        {isDowngrade && (
          <div className={styles.dangerNotice}>
            <strong>⚠️ Final Warning:</strong> Proceeding with version downgrade 
            may cause irreversible damage to your world. We cannot recover data 
            lost due to version incompatibilities.
          </div>
        )}
      </div>
    </div>
  );
};

export default VersionWarningModal;
