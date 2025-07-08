"use client";
import React from 'react';
import { FiUpload, FiTrash2, FiFileText, FiLoader, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import styles from './FileUploadSection.module.scss';
import { FileAnalysis, AnalyzedFile } from '@/lib/server/minecraft';

interface FileUploadSectionProps {
  label: string;
  files: AnalyzedFile[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  fileType: string;
  uploadText: string;
}

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  label, files, onUpload, onRemove, fileRef, fileType, uploadText
}) => {

  const getFileIcon = (file: AnalyzedFile) => {
    if (file.isAnalyzing) return <FiLoader className={styles.spinning} />;
    if (file.analysis?.errors?.length) return <FiAlertTriangle className={styles.errorIcon} />;
    if (file.analysis) return <FiCheckCircle className={styles.successIcon} />;
    return <FiFileText />;
  };

  const getFileTypeTag = (analysis?: FileAnalysis) => {
    if (!analysis || analysis.type === 'unknown') return null;
    
    let displayText: string = analysis.type;
    if (analysis.type === 'mod' && analysis.modLoader) {
      displayText = `${analysis.modLoader} mod`;
    } else if (analysis.type === 'plugin' && analysis.serverType) {
      displayText = `${analysis.serverType} plugin`;
    }

    return (
      <span className={`${styles.fileTag} ${styles[analysis.type]}`}>
        {displayText}
      </span>
    );
  };

  const getFileInfo = (file: AnalyzedFile) => {
    if (file.isAnalyzing) return 'Analyzing...';
    if (file.analysisError) return `Analysis failed: ${file.analysisError}`;
    if (!file.analysis) return file.name;

    const { analysis } = file;
    const name = analysis.pluginName || analysis.modName || analysis.worldName || file.name;
    const version = analysis.version ? ` v${analysis.version}` : '';
    const mcVersion = analysis.minecraftVersion ? ` (MC ${analysis.minecraftVersion})` : '';
    
    return `${name}${version}${mcVersion}`;
  };

  return (
    <div className={styles.formGroup}>
      <label>{label}</label>
      <div className={styles.fileUpload}>
        <div
          className={styles.uploadBox}
          onClick={() => fileRef.current?.click()}
        >
          <FiUpload size={32} />
          <p>{uploadText}</p>
        </div>
        <input
          type="file"
          ref={fileRef}
          style={{ display: 'none' }}
          accept={fileType}
          multiple
          onChange={onUpload}
        />

        {files.length > 0 && (
          <div>
            <p>Uploaded {label}:</p>
            {files.map((file, index) => (
              <div key={index} className={styles.uploadedFile}>
                {getFileIcon(file)}
                <div className={styles.fileInfo}>
                  <span className={styles.fileName}>{getFileInfo(file)}</span>
                  {getFileTypeTag(file.analysis)}
                  {file.analysis?.description && (
                    <div className={styles.fileDescription}>{file.analysis.description}</div>
                  )}
                  {file.analysis?.errors && file.analysis.errors.length > 0 && (
                    <div className={styles.fileErrors}>
                      {file.analysis.errors.map((error, i) => (
                        <span key={i} className={styles.errorText}>{error}</span>
                      ))}
                    </div>
                  )}
                  {file.analysis?.warnings && file.analysis.warnings.length > 0 && (
                    <div className={styles.fileWarnings}>
                      {file.analysis.warnings.map((warning, i) => (
                        <span key={i} className={styles.warningText}>{warning}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => onRemove(index)}
                  disabled={file.isAnalyzing}
                >
                  <FiTrash2 />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadSection;
