"use client";

import Link from 'next/link';
import { FaRocket, FaCubes, FaBook } from 'react-icons/fa';

export default function Navbar() {
    return (
        <header className="navbar">
            <div className="container">
                <Link href="/" className="logo">
                    MC-Deploy
                </Link>
                <nav className="links">
                    <Link href="/#features" className="link">
                        <FaCubes />
                        <span>Features</span>
                    </Link>
                    <Link href="/documentation" className="link">
                        <FaBook />
                        <span>Docs</span>
                    </Link>
                    <Link href="/get-started" className="link button">
                        <FaRocket />
                        <span>Get Started</span>
                    </Link>
                </nav>
            </div>
        </header>
    );
}