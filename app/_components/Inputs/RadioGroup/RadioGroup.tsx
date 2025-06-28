"use client";
import React from 'react';
import styles from './RadioGroup.module.scss';

interface RadioGroupProps {
  name: string;
  options: { value: string; label: string }[];
  selectedValue?: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
}

const RadioGroup: React.FC<RadioGroupProps> = ({ name, options, selectedValue = null, onChange, label }) => (
  <div className={styles.formGroup}>
    <label>{label}</label>
    <div className={styles.radioGroup}>
      {options.map(option => (
        <label key={option.value} className={styles.radioOption}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={selectedValue === option.value}
            onChange={onChange}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  </div>
);

export default RadioGroup;
