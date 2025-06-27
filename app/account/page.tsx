"use client";
import React, { useState, useEffect } from 'react';
import styles from './account.module.scss';
import { FiUser, FiLock, FiSave, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { useRouter } from 'next/navigation';

interface UserProfile {
    name: string;
    email: string;
    joinDate: string;
    totalServers: number;
    activeServers: number;
}

export default function AccountPage() {
    const [activeTab, setActiveTab] = useState('profile');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [fullyLoaded, setFullyLoaded] = useState(false);
    const router = useRouter();

    const [userProfile, setUserProfile] = useState<UserProfile>({
        name: 'Minecraft Server Owner',
        email: 'user@example.com',
        joinDate: '2024-01-15',
        totalServers: 5,
        activeServers: 3
    });

    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const fetchAccountSettings = async () => {

    }


    // Fetch user data on component mount
    useEffect(() => {
        const checkAuth = () => {
            const res = fetch('/api/auth/check', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            res.then(response => {
                if (!response.ok) {
                    router.push('/'); // Redirect to home page if not authenticated
                }
            }).catch(error => {
                console.error('Error checking authentication:', error);
            });

            setFullyLoaded(true);
        }
        // Fetch initial server settings from the API
        fetchAccountSettings();

        checkAuth();

        window.addEventListener('storage', checkAuth);

        return () => {
            window.removeEventListener('storage', checkAuth);
        };
    }, [router]);


    const handleProfileSave = async () => {
        setIsSaving(true);
        try {
            // TODO: API call to save profile
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
            setIsEditing(false);
            console.log('Profile saved:', userProfile);
        } catch (error) {
            console.error('Error saving profile:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePasswordChange = async () => {
        if (passwords.newPassword !== passwords.confirmPassword) {
            alert('New passwords do not match');
            return;
        }

        setIsSaving(true);
        try {
            // TODO: API call to change password
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
            setPasswords({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });
            alert('Password changed successfully');
        } catch (error) {
            console.error('Error changing password:', error);
            alert('Failed to change password');
        } finally {
            setIsSaving(false);
        }
    };

    const tabs = [
        { id: 'profile', label: 'Profile', icon: FiUser },
    ];

    return (
        <main className={styles.accountPage}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.pageTitle}>Account Settings</h1>
                </div>

                <div className={styles.accountContainer}>
                    {/* Sidebar Navigation */}
                    <div className={styles.sidebar}>
                        <div className={styles.userInfo}>
                            <div className={styles.avatar}>
                                <FiUser size={24} />
                            </div>
                            <div className={styles.userDetails}>
                                <h3>{userProfile.name}</h3>
                                <p>{userProfile.email}</p>
                            </div>
                        </div>

                        <nav className={styles.navigation}>
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`${styles.navButton} ${activeTab === tab.id ? styles.active : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <tab.icon className={styles.navIcon} />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Main Content */}
                    <div className={styles.mainContent}>
                        {/* Profile Tab */}
                        {activeTab === 'profile' && (
                            <div className={styles.tabContent}>
                                <div className={styles.sectionHeader}>
                                    <h2 className={styles.sectionTitle}>Profile Information</h2>
                                    <button
                                        className={`${styles.editButton} ${isEditing ? styles.active : ''}`}
                                        onClick={() => setIsEditing(!isEditing)}
                                    >
                                        <FiEdit2 size={16} />
                                        {isEditing ? 'Cancel' : 'Edit'}
                                    </button>
                                </div>

                                <div className={styles.profileCard}>
                                    <div className={styles.formGroup}>
                                        <label htmlFor="name">Full Name</label>
                                        <input
                                            type="text"
                                            id="name"
                                            value={userProfile.name}
                                            onChange={(e) => setUserProfile(prev => ({ ...prev, name: e.target.value }))}
                                            disabled={!isEditing}
                                            className={styles.input}
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="email">Email Address</label>
                                        <input
                                            type="email"
                                            id="email"
                                            value={userProfile.email}
                                            onChange={(e) => setUserProfile(prev => ({ ...prev, email: e.target.value }))}
                                            disabled={!isEditing}
                                            className={styles.input}
                                        />
                                    </div>

                                    <div className={styles.statsGrid}>
                                        <div className={styles.statCard}>
                                            <h4>Member Since</h4>
                                            <p>{new Date(userProfile.joinDate).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}</p>
                                        </div>
                                        <div className={styles.statCard}>
                                            <h4>Total Servers</h4>
                                            <p>{userProfile.totalServers}</p>
                                        </div>
                                        <div className={styles.statCard}>
                                            <h4>Active Servers</h4>
                                            <p>{userProfile.activeServers}</p>
                                        </div>
                                    </div>

                                    {isEditing && (
                                        <div className={styles.formActions}>
                                            <button
                                                className={`${styles.saveButton} ${isSaving ? styles.loading : ''}`}
                                                onClick={handleProfileSave}
                                                disabled={isSaving}
                                            >
                                                <FiSave size={16} />
                                                {isSaving ? 'Saving...' : 'Save Changes'}
                                            </button>
                                        </div>
                                    )}
                                    <div className={styles.settingGroup}>
                                        <h3>Change Password</h3>
                                        <div className={styles.passwordForm}>
                                            <div className={styles.formGroup}>
                                                <label htmlFor="currentPassword">Current Password</label>
                                                <input
                                                    type="password"
                                                    id="currentPassword"
                                                    value={passwords.currentPassword}
                                                    onChange={(e) => setPasswords(prev => ({ ...prev, currentPassword: e.target.value }))}
                                                    className={styles.input}
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label htmlFor="newPassword">New Password</label>
                                                <input
                                                    type="password"
                                                    id="newPassword"
                                                    value={passwords.newPassword}
                                                    onChange={(e) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))}
                                                    className={styles.input}
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label htmlFor="confirmPassword">Confirm New Password</label>
                                                <input
                                                    type="password"
                                                    id="confirmPassword"
                                                    value={passwords.confirmPassword}
                                                    onChange={(e) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                                    className={styles.input}
                                                />
                                            </div>

                                        {fullyLoaded && (
                                            <button
                                                className={`${styles.passwordButton} ${isSaving ? styles.loading : ''}`}
                                                onClick={handlePasswordChange}
                                                disabled={isSaving || !passwords.currentPassword || !passwords.newPassword}
                                            >
                                                <FiLock size={16} />
                                                {isSaving ? 'Updating...' : 'Update Password'}
                                            </button>
                                        )}
                                        </div>
                                    </div>

                                    <div className={styles.dangerZone}>
                                        <h3>Danger Zone</h3>
                                        <div className={styles.dangerAction}>
                                            <div className={styles.dangerInfo}>
                                                <h4>Delete Account</h4>
                                                <p>Permanently delete your account and all associated data</p>
                                            </div>
                                            {fullyLoaded && (
                                                <button className={styles.dangerButton}>
                                                    <FiTrash2 size={16} />
                                                    Delete Account
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
