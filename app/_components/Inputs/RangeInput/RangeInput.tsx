"use client";
import React from 'react';
import styles from './RangeInput.module.scss';

interface RangeInputProps {
  id: string;
  name: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit: string;
}

const RangeInput: React.FC<RangeInputProps> = ({ id, name, label, min, max, value, onChange, unit }) => (
  <div className={styles.formGroup}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.rangeWrapper}>
      <input
        type="range"
        id={id}
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        className={styles.rangeInput}
      />
      <span className={styles.rangeValue}>{value} {unit}</span>
    </div>
  </div>
);

export default RangeInput;
