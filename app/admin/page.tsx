'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  FaChartPie,
  FaCog,
  FaDocker,
  FaNetworkWired,
  FaPlug,
  FaServer,
  FaUsers,
} from 'react-icons/fa';
import UserManager from '../_components/UserManager/UserManager';
import OverviewSection from './_sections/OverviewSection';
import ServersSection from './_sections/ServersSection';
import ProxiesSection from './_sections/ProxiesSection';
import PortsSection from './_sections/PortsSection';
import DockerSection from './_sections/DockerSection';
import SettingsSection from './_sections/SettingsSection';
import { useAdminData } from './_sections/shared';
import styles from './admin.module.scss';

type Section = 'overview' | 'servers' | 'proxies' | 'ports' | 'users' | 'docker' | 'settings';

const SECTIONS: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <FaChartPie /> },
  { id: 'servers', label: 'Servers', icon: <FaServer /> },
  { id: 'proxies', label: 'Proxies', icon: <FaPlug /> },
  { id: 'ports', label: 'Ports', icon: <FaNetworkWired /> },
  { id: 'users', label: 'Users', icon: <FaUsers /> },
  { id: 'docker', label: 'Docker updates', icon: <FaDocker /> },
  { id: 'settings', label: 'Settings', icon: <FaCog /> },
];

function sectionFromHash(): Section {
  const hash = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '');
  return SECTIONS.some(section => section.id === hash) ? (hash as Section) : 'overview';
}

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>('overview');
  const system = useAdminData<{ counts: { pendingUsers: number } }>('/api/admin/system');

  // The section lives in the address, so a reload or a shared link opens the same page
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once on the client
    setSection(sectionFromHash());
    const onHashChange = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: string) => {
    window.location.hash = next;
    setSection(sectionFromHash());
  }, []);

  const pending = system.data?.counts.pendingUsers ?? 0;

  return (
    <div className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Admin sections">
        <h2 className={styles.sidebarTitle}>Admin</h2>
        {SECTIONS.map(item => (
          <button
            key={item.id}
            className={`${styles.navItem} ${section === item.id ? styles.active : ''}`}
            onClick={() => navigate(item.id)}
            aria-current={section === item.id ? 'page' : undefined}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {item.label}
            {item.id === 'users' && pending > 0 && <span className={styles.navBadge}>{pending}</span>}
          </button>
        ))}
      </nav>

      <main className={styles.main}>
        {section === 'overview' && <OverviewSection onNavigate={navigate} />}
        {section === 'servers' && <ServersSection />}
        {section === 'proxies' && <ProxiesSection />}
        {section === 'ports' && <PortsSection />}
        {section === 'users' && (
          <>
            <div className={styles.pageHeader}>
              <div>
                <h1>Users</h1>
                <p>Approve new accounts, set server limits and manage administrators.</p>
              </div>
            </div>
            <UserManager />
          </>
        )}
        {section === 'docker' && <DockerSection />}
        {section === 'settings' && <SettingsSection />}
      </main>
    </div>
    </div>
  );
}
