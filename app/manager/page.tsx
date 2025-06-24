'use client';
import React from 'react';
import styles from './manager.module.scss';

export default function Manager() {
  return (
    <div className={styles.manager}>
      <div className={styles.container}>
        <h1>Manager Page</h1>
        <p>This is the manager page for the Minecraft Server Manager.</p>
      </div>
    </div>
  );
}