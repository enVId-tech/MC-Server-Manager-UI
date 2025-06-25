"use client";

import Link from 'next/link';
import { FaRocket, FaServer } from 'react-icons/fa';
import { IoMdLogIn, IoMdLogOut } from "react-icons/io";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Navbar() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Check authentication status on component mount
        const checkAuthStatus = () => {
            const token = localStorage.getItem('authToken');
            setIsLoggedIn(!!token);
        };

        checkAuthStatus();

        // Listen for storage events (in case token is updated in another tab)
        window.addEventListener('storage', checkAuthStatus);

        return () => {
            window.removeEventListener('storage', checkAuthStatus);
        };
    }, []);

    const handleLogout = () => {
        // Remove auth token
        localStorage.removeItem('authToken');
        setIsLoggedIn(false);

        // Redirect to home page
        router.push('/');
    };

    return (
        <header className="navbar">
            <div className="container">
                <Link href="/" className="logo">
                    MC Server Manager
                </Link>
                <nav className="links">
                    {isLoggedIn ? (
                        <>
                            <Link href="/manager/dashboard" className="link">
                                <FaServer />
                                <span>Dashboard</span>
                            </Link>
                            <button onClick={handleLogout} className="link button">
                                <IoMdLogOut />
                                <span>Logout</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/get-started" className="link">
                                <FaRocket />
                                <span>Get Started</span>
                            </Link>
                            <Link href="/auth/login" className="link button">
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