"use client";
import React from 'react';
import styles from './CheckboxGroup.module.scss';

interface ConfigObject {
  [key: string]: unknown;
}

interface CheckboxGroupProps {
  serverConfig: ConfigObject;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  options: { name: string; label: string }[];
}

const CheckboxGroup: React.FC<CheckboxGroupProps> = ({ serverConfig, onChange, label, options }) => (
  <div className={styles.formGroup}>
    <label>{label}</label>
    <div className={styles.checkboxGroup}>
      {options.map(option => (
        <label key={option.name} className={styles.checkboxOption}>
          <input
            type="checkbox"
            name={option.name}
            checked={serverConfig[option.name] as boolean}
            onChange={onChange}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  </div>
);

export default CheckboxGroup;
