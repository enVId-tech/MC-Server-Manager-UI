"use client";
import React from 'react';
import styles from './TabButton.module.scss';
import { IconType } from 'react-icons';

interface TabButtonProps {
  tab: { id: string; label: string; icon: IconType };
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ tab, isActive, onClick }) => (
  <button
    className={`${styles.tabButton} ${isActive ? styles.active : ''}`}
    onClick={onClick}
  >
    <tab.icon className={styles.tabIcon} /> {tab.label}
  </button>
);

export default TabButton;
