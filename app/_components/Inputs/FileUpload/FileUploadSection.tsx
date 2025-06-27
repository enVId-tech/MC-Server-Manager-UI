"use client";
import React from 'react';
import { FiUpload, FiTrash2, FiFileText } from 'react-icons/fi';
import styles from './FileUploadSection.module.scss';

interface FileUploadSectionProps {
  label: string;
  files: File[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  fileType: string;
  uploadText: string;
}

const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  label, files, onUpload, onRemove, fileRef, fileType, uploadText
}) => (
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
              <FiFileText />
              <span className={styles.fileName}>{file.name}</span>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(index)}
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

export default FileUploadSection;
