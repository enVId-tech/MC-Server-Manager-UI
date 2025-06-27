"use client";
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './account.module.scss';
import { FiUser, FiLock, FiSave, FiTrash2 } from 'react-icons/fi';
import { useRouter } from 'next/navigation';

interface UserProfile {
    email: string;
    joinDate: string;
    totalServers: number;
    activeServers: number;
}

interface ServerData {
    isOnline: boolean;
    // Add other server properties as needed
    [key: string]: unknown;
}

export default function AccountPage() {
    const [activeTab, setActiveTab] = useState('profile');
    const [isSaving, setIsSaving] = useState(false);
    const [fullyLoaded, setFullyLoaded] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState({
        email: '',
        password: '',
        confirmText: ''
    });
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    const [userProfile, setUserProfile] = useState<UserProfile>({
        email: 'user@example.com',
        joinDate: '00-00-00T00:00:00Z', // Placeholder date
        totalServers: 0,
        activeServers: 0
    });

    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const fetchAccountSettings = async () => {
        try {
            const response = await fetch('/api/account', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error('Failed to fetch account settings');
            }
            // Assuming the response contains user data in the format { user: UserProfile }
            const data = await response.json();

            console.log('Fetched user profile:', data);

            setUserProfile({
                email: data.user.email || userProfile.email,
                joinDate: data.user.createdAt || userProfile.joinDate,
                totalServers: data.ownedServers.length || userProfile.totalServers,
                activeServers: data.ownedServers.filter((server: ServerData) => server.isOnline).length || userProfile.activeServers
            });
        } catch (error) {
            console.error('Error fetching account settings:', error);
        }
    };


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


    const handleEmailSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/account', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: userProfile.email,

                })
            });

            if (!response.ok) {
                throw new Error('Failed to save profile');
            }

            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
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
            const response = await fetch('/api/account', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    currentPassword: passwords.currentPassword,
                    newPassword: passwords.newPassword
                })
            });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
            setPasswords({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });

            if (!response.ok) {
                throw new Error('Failed to change password');
            }
            alert('Password changed successfully');
        } catch (error) {
            console.error('Error changing password:', error);
            alert('Failed to change password');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        // Validate confirmation inputs
        if (deleteConfirmation.email !== userProfile.email) {
            alert('Email address does not match your account email');
            return;
        }

        if (deleteConfirmation.confirmText !== 'DELETE MY ACCOUNT') {
            alert('Please type "DELETE MY ACCOUNT" exactly as shown');
            return;
        }

        if (!deleteConfirmation.password) {
            alert('Please enter your password to confirm account deletion');
            return;
        }

        setIsDeleting(true);
        try {
            // TODO: API call to delete account
            const response = await fetch('/api/account', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: deleteConfirmation.email,
                    password: deleteConfirmation.password
                })
            });

            if (!response.ok) {
                throw new Error('Failed to delete account');
            }

            // Clear localStorage and redirect
            localStorage.clear();
            sessionStorage.clear();
            alert('Account deleted successfully');
            router.push('/');
        } catch (error) {
            console.error('Error deleting account:', error);
            alert('Failed to delete account. Please try again.');
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
            setDeleteConfirmation({ email: '', password: '', confirmText: '' });
        }
    };

    const closeDeleteModal = () => {
        setShowDeleteModal(false);
        setDeleteConfirmation({ email: '', password: '', confirmText: '' });
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

                                <div className={styles.profileCard}>
                                    <div className={styles.formGroup}>
                                        <label htmlFor="email">Email Address</label>
                                        <input
                                            type="email"
                                            id="email"
                                            value={userProfile.email}
                                            onChange={(e) => setUserProfile(prev => ({ ...prev, email: e.target.value }))}
                                            className={styles.input}
                                        />

                                        {fullyLoaded && (
                                            <button
                                                className={`${styles.saveButton} ${isSaving ? styles.loading : ''}`}
                                                onClick={handleEmailSave}
                                                disabled={isSaving}
                                            >
                                                <FiSave size={16} />
                                                {isSaving ? 'Saving...' : 'Save Changes'}
                                            </button>
                                        )}
                                    </div>
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
                                                <button 
                                                    className={styles.dangerButton}
                                                    onClick={() => setShowDeleteModal(true)}
                                                >
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

                {/* Delete Account Modal */}
                {showDeleteModal && typeof document !== 'undefined' && createPortal(
                    <div className={styles.modalOverlay} onClick={closeDeleteModal}>
                        <div className={styles.deleteModal} onClick={(e) => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h2>⚠️ Delete Account</h2>
                                <button 
                                    className={styles.closeButton} 
                                    onClick={closeDeleteModal}
                                    aria-label="Close modal"
                                >
                                    ×
                                </button>
                            </div>

                            <div className={styles.modalContent}>
                                <div className={styles.warningSection}>
                                    <div className={styles.warningBox}>
                                        <h3>🚨 PERMANENT ACTION WARNING</h3>
                                        <p>This action <strong>CANNOT BE UNDONE</strong>. Deleting your account will:</p>
                                        <ul>
                                            <li>❌ Permanently delete all your Minecraft servers</li>
                                            <li>❌ Remove all server configurations and worlds</li>
                                            <li>❌ Delete all uploaded plugins and mods</li>
                                            <li>❌ Erase your account data and settings</li>
                                        </ul>
                                        <p className={styles.finalWarning}>
                                            <strong>ALL DATA WILL BE LOST FOREVER!</strong>
                                        </p>
                                    </div>
                                </div>

                                <div className={styles.confirmationSection}>
                                    <h3>Confirm Account Deletion</h3>
                                    <p>To proceed, please complete the following verification steps:</p>

                                    <div className={styles.confirmationSteps}>
                                        <div className={styles.step}>
                                            <label htmlFor="confirmEmail">
                                                1. Enter your email address: <strong>{userProfile.email}</strong>
                                            </label>
                                            <input
                                                type="email"
                                                id="confirmEmail"
                                                value={deleteConfirmation.email}
                                                onChange={(e) => setDeleteConfirmation(prev => ({ 
                                                    ...prev, 
                                                    email: e.target.value 
                                                }))}
                                                placeholder="Enter your email address"
                                                className={styles.confirmInput}
                                            />
                                        </div>

                                        <div className={styles.step}>
                                            <label htmlFor="confirmPassword">
                                                2. Enter your current password:
                                            </label>
                                            <input
                                                type="password"
                                                id="confirmPassword"
                                                value={deleteConfirmation.password}
                                                onChange={(e) => setDeleteConfirmation(prev => ({ 
                                                    ...prev, 
                                                    password: e.target.value 
                                                }))}
                                                placeholder="Enter your password"
                                                className={styles.confirmInput}
                                            />
                                        </div>

                                        <div className={styles.step}>
                                            <label htmlFor="confirmText">
                                                3. Type <span className={styles.deleteText}>&ldquo;DELETE MY ACCOUNT&rdquo;</span> to confirm:
                                            </label>
                                            <input
                                                type="text"
                                                id="confirmText"
                                                value={deleteConfirmation.confirmText}
                                                onChange={(e) => setDeleteConfirmation(prev => ({ 
                                                    ...prev, 
                                                    confirmText: e.target.value 
                                                }))}
                                                placeholder="Type: DELETE MY ACCOUNT"
                                                className={styles.confirmInput}
                                            />
                                        </div>

                                        <p className={styles.confirmationNote}>
                                            <strong>Note:</strong> This action is irreversible. Ensure you have backed up any important data before proceeding.
                                        </p>
                                        <p className={styles.confirmationNote}>
                                            By confirming, you understand that all your data will be permanently deleted and cannot be recovered.
                                        </p>
                                        <p className={styles.confirmationNote}>
                                            You also understand that if you wish to create a new account in the future, you will need to wait for site approval and verification before proceeding.
                                                </p>
                                    </div>
                                </div>

                                <div className={styles.modalActions}>
                                    <button 
                                        className={styles.cancelButton} 
                                        onClick={closeDeleteModal}
                                        disabled={isDeleting}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        className={`${styles.confirmDeleteButton} ${isDeleting ? styles.loading : ''}`}
                                        onClick={handleDeleteAccount}
                                        disabled={
                                            isDeleting || 
                                            deleteConfirmation.email !== userProfile.email ||
                                            deleteConfirmation.confirmText !== 'DELETE MY ACCOUNT' ||
                                            !deleteConfirmation.password
                                        }
                                    >
                                        <FiTrash2 size={16} />
                                        {isDeleting ? 'Deleting Account...' : 'DELETE MY ACCOUNT FOREVER'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </main>
    );
}
