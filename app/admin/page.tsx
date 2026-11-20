'use client';

import React, { useState } from 'react';
import DockerUpdateManager from '../_components/DockerUpdateManager/DockerUpdateManager';
import AdminServerManager from '../_components/AdminServerManager/AdminServerManager';
import UserManager from '../_components/UserManager/UserManager';
import styles from './admin.module.scss';

type AdminTab = 'servers' | 'users' | 'docker' | 'settings';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('servers');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'servers':
        return <AdminServerManager />;
      case 'users':
        return <UserManager />;
      case 'docker':
        return <DockerUpdateManager />;
      case 'settings':
        return (
          <div className={styles.settingsPanel}>
            <h2>System Settings</h2>
            <p>Additional admin settings will be implemented here.</p>
            <div className={styles.settingsGrid}>
              <div className={styles.settingCard}>
                <h3>System Monitoring</h3>
                <p>Monitor system resources and performance</p>
                <button className={styles.comingSoon} disabled>Coming Soon</button>
              </div>
              <div className={styles.settingCard}>
                <h3>Backup Management</h3>
                <p>Configure automatic backups and retention policies</p>
                <button className={styles.comingSoon} disabled>Coming Soon</button>
              </div>
              <div className={styles.settingCard}>
                <h3>Security Settings</h3>
                <p>Configure security policies and access controls</p>
                <button className={styles.comingSoon} disabled>Coming Soon</button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Admin Dashboard</h1>
        <p className={styles.subtitle}>Manage servers, Docker infrastructure, and system settings</p>
      </div>

      <nav className={styles.tabNavigation}>
        <button
          className={`${styles.tab} ${activeTab === 'servers' ? styles.active : ''}`}
          onClick={() => setActiveTab('servers')}
        >
          <span className={styles.tabIcon}>🛠️</span>
          Server Management
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'users' ? styles.active : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <span className={styles.tabIcon}>👥</span>
          Users
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'docker' ? styles.active : ''}`}
          onClick={() => setActiveTab('docker')}
        >
          <span className={styles.tabIcon}>🐳</span>
          Docker Updates
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'settings' ? styles.active : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className={styles.tabIcon}>⚙️</span>
          System Settings
        </button>
      </nav>

      <main className={styles.tabContent}>
        {renderTabContent()}
      </main>
    </div>
  );
}
