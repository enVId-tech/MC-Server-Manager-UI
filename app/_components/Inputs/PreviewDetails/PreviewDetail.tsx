"use client";
import React from 'react';
import styles from './PreviewDetail.module.scss';

interface PreviewDetailProps {
  label: string;
  value: string | number;
}

const PreviewDetail: React.FC<PreviewDetailProps> = ({ label, value }) => (
  <p className={styles.previewDetail}>
    <span>{label}:</span> {value}
  </p>
);

export default PreviewDetail;
