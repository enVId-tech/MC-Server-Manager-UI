'use client';
import React from 'react';
import styles from './generate.module.scss';

export default function Generate() {
  return (
    <div className={styles.generate}>
      <div className={styles.container}>
        <h1>Generate Page</h1>
        <p>This is the generate page for the Minecraft Server Manager.</p>
      </div>
    </div>
  );
}