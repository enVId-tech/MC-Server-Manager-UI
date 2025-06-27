"use client";

import Link from 'next/link';
import { FaRocket, FaServer } from 'react-icons/fa';
import { IoMdLogIn, IoMdLogOut } from "react-icons/io";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Navbar.module.scss';
import mcSvgLogo from '@/public/minecraft-server.png';
import { MdOutlineSettings } from 'react-icons/md';

export default function Navbar() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    const checkAuthStatus = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/auth/check', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            setIsLoggedIn(response.ok);
        } catch (error) {
            console.error('Error checking authentication:', error);
            setIsLoggedIn(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Check auth on component mount
        checkAuthStatus();

        // Create a custom event listener for login success
        const handleLoginSuccess = () => {
            setIsLoggedIn(true);
            setIsLoading(false);
        };

        // Add event listeners
        window.addEventListener('login-success', handleLoginSuccess);
        window.addEventListener('storage', checkAuthStatus);

        return () => {
            window.removeEventListener('login-success', handleLoginSuccess);
            window.removeEventListener('storage', checkAuthStatus);
        };
    }, []);

    const handleLogout = async () => {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                setIsLoggedIn(false);
                router.push('/');
            } else {
                console.error('Logout failed');
            }
        } catch (error) {
            console.error('Error during logout:', error);
        }
    };

    return (
        <header className={styles.navbar}>
            <div className={styles.container}>
                <div className={styles.logoContainer}>
                    <img src={mcSvgLogo.src} alt={'logo'} className={styles.logoImage} />
                    <Link href="/" className={styles.logo}>
                        MC Server Manager
                    </Link>
                </div>
                <nav className={styles.links}>
                    {isLoading ? (
                        <span className={styles.link}>Loading...</span>
                    ) : isLoggedIn ? (
                        <>
                            <Link href="/account" className={styles.link}>
                                <MdOutlineSettings />
                                <span>Account</span>
                            </Link>
                            <Link href="/manager/dashboard" className={styles.link}>
                                <FaServer />
                                <span>Dashboard</span>
                            </Link>
                            <button onClick={handleLogout} className={`${styles.link} ${styles.button}`}>
                                <IoMdLogOut />
                                <span>Logout</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/get-started" className={styles.link}>
                                <FaRocket />
                                <span>Get Started</span>
                            </Link>
                            <Link href="/auth/login" className={`${styles.link} ${styles.button}`}>
                                <IoMdLogIn />
                                <span>Login</span>
                            </Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
}