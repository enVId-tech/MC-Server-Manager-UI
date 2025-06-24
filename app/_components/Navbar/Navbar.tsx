"use client";

import Link from 'next/link';
import { FaRocket, FaCubes, FaBook } from 'react-icons/fa';

export default function Navbar() {
    return (
        <header className="navbar">
            <div className="container">
                <Link href="/" className="logo">
                    MC Server Manager
                </Link>
                <nav className="links">
                    <Link href="/get-started" className="link button">
                        <FaRocket />
                        <span>Get Started</span>
                    </Link>
                </nav>
            </div>
        </header>
    );
}