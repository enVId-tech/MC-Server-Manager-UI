import React from 'react';
import styles from './dashboard.module.scss';

export default function Dashboard() {
  return (
    <div className={styles.dashboard}>
      <div className={styles.container}>
        <h1>Dashboard</h1>
        <p>This is the dashboard for the Minecraft Server Manager.</p>
      </div>
    </div>
  );
}