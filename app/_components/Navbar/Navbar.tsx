"use client";

import Link from 'next/link';
import { FaRocket, FaServer } from 'react-icons/fa';
import { IoMdLogIn, IoMdLogOut } from "react-icons/io";
import { HiMenu, HiX } from "react-icons/hi";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Navbar.module.scss';
import mcSvgLogo from '@/public/minecraft-server.png';
import { MdOutlineSettings } from 'react-icons/md';

export default function Navbar() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const router = useRouter();

    const checkAuthStatus = async () => {
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

        // Close mobile menu when clicking outside
        const handleClickOutside = (event: MouseEvent) => {
            const navbar = document.querySelector(`.${styles.navbar}`);
            if (navbar && !navbar.contains(event.target as Node)) {
                setIsMobileMenuOpen(false);
            }
        };

        // Close mobile menu on route change
        const handleRouteChange = () => {
            setIsMobileMenuOpen(false);
        };

        const interval = setInterval(() => {
            checkAuthStatus();
        }, 10 * 1000); // Check every 10 seconds

        // Add event listeners
        window.addEventListener('login-success', handleLoginSuccess);
        window.addEventListener('storage', checkAuthStatus);
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('popstate', handleRouteChange);

        return () => {
            window.removeEventListener('login-success', handleLoginSuccess);
            window.removeEventListener('storage', checkAuthStatus);
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('popstate', handleRouteChange);
            clearInterval(interval);
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

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
    };

    return (
        <header className={styles.navbar}>
            <div className={styles.container}>
                <div className={styles.logoContainer} onClick={() => router.push('/')}>
                    <div className={styles.logoImage}>
                        <img src={mcSvgLogo.src} alt={'logo'} />
                    </div>
                    <Link href="/" className={styles.logo} onClick={closeMobileMenu}>
                        MC Server Manager
                    </Link>
                </div>
                
                <button 
                    className={styles.mobileToggle}
                    onClick={toggleMobileMenu}
                    aria-label="Toggle mobile menu"
                >
                    {isMobileMenuOpen ? <HiX /> : <HiMenu />}
                </button>
                
                <nav className={`${styles.links} ${isMobileMenuOpen ? styles.mobileOpen : ''}`}>
                    {isLoading ? (
                        <span className={styles.link}>Loading...</span>
                    ) : isLoggedIn ? (
                        <>
                            <Link href="/account" className={styles.link} onClick={closeMobileMenu}>
                                <MdOutlineSettings />
                                <span>Account</span>
                            </Link>
                            <Link href="/manager/dashboard" className={styles.link} onClick={closeMobileMenu}>
                                <FaServer />
                                <span>Dashboard</span>
                            </Link>
                            <button onClick={() => { handleLogout(); closeMobileMenu(); }} className={`${styles.link} ${styles.button}`}>
                                <IoMdLogOut />
                                <span>Logout</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/get-started" className={styles.link} onClick={closeMobileMenu}>
                                <FaRocket />
                                <span>Get Started</span>
                            </Link>
                            <Link href="/auth/login" className={`${styles.link} ${styles.button}`} onClick={closeMobileMenu}>
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