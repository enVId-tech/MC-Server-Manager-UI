"use client";

import Link from 'next/link';
import { FaBook, FaServer } from 'react-icons/fa';
import { IoMdLogIn, IoMdLogOut } from "react-icons/io";
import { HiMenu, HiX } from "react-icons/hi";
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './Navbar.module.scss';
import mcSvgLogo from '@/public/minecraft-server.png';
import { MdOutlineSettings } from 'react-icons/md';

export default function Navbar() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

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
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the session state comes from the server
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
        }, 60 * 1000); // Check every 30 seconds

        // Add event listeners
        window.addEventListener('login-success', handleLoginSuccess);
        window.addEventListener('storage', checkAuthStatus);
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('popstate', handleRouteChange);
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMobileMenuOpen(false);
        };
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('keydown', handleEscape);
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
                <Link href="/" className={styles.logoContainer} onClick={closeMobileMenu} aria-label="MC Server Manager home">
                    <span className={styles.logoImage}>
                        <img src={mcSvgLogo.src} alt="" />
                    </span>
                    <span className={styles.logo}>MC Server Manager</span>
                </Link>

                <button
                    className={styles.mobileToggle}
                    onClick={toggleMobileMenu}
                    aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={isMobileMenuOpen}
                    aria-controls="main-navigation"
                >
                    {isMobileMenuOpen ? <HiX /> : <HiMenu />}
                </button>

                <nav id="main-navigation" aria-label="Main" className={`${styles.links} ${isMobileMenuOpen ? styles.mobileOpen : ''}`}>
                    <Link href="/docs" className={`${styles.link} ${isActive('/docs') ? styles.active : ''}`} aria-current={isActive('/docs') ? 'page' : undefined} onClick={closeMobileMenu}>
                        <FaBook />
                        <span>Docs</span>
                    </Link>
                    {isLoading ? (
                        <span className={styles.link}>Loading...</span>
                    ) : isLoggedIn ? (
                        <>
                            <Link href="/account" className={`${styles.link} ${isActive('/account') ? styles.active : ''}`} aria-current={isActive('/account') ? 'page' : undefined} onClick={closeMobileMenu}>
                                <MdOutlineSettings />
                                <span>Account</span>
                            </Link>
                            <Link href="/manager/dashboard" className={`${styles.link} ${isActive('/manager') ? styles.active : ''}`} aria-current={isActive('/manager') ? 'page' : undefined} onClick={closeMobileMenu}>
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