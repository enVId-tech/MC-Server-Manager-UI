'use client';
import React from 'react';
import styles from './server.module.scss';

export default function Server() {
  return (
    <div className={styles.server}>
      <div className={styles.container}>
        <h1>Server Page</h1>
        <p>This is the server page for the Minecraft Server Manager.</p>
      </div>
    </div>
  );
}