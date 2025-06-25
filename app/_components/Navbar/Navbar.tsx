"use client";

import Link from 'next/link';
import { FaRocket } from 'react-icons/fa';
import { IoMdLogIn } from "react-icons/io";

export default function Navbar() {
    return (
        <header className="navbar">
            <div className="container">
                <Link href="/" className="logo">
                    MC Server Manager
                </Link>
                <nav className="links">
                    <Link href="/get-started" className="link">
                        <FaRocket />
                        <span>Get Started</span>
                    </Link>
                    <Link href="/auth/login" className="link button">
                        <IoMdLogIn />
                        <span>Login</span>
                    </Link>
                </nav>
            </div>
        </header>
    );
}