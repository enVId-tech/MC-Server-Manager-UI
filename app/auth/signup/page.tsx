"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import authBg from '@/public/auth-bg.png';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setError('');

        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (res.ok) {
            setMessage(data.message);
            setTimeout(() => router.push('/login'), 3000);
        } else {
            setError(data.message || 'An error occurred.');
        }
    };

    return (
        <main className="auth-page" style={{ backgroundImage: `url(${authBg.src})` }}>
            <form onSubmit={handleSubmit} className="auth-form">
                <h1 className="auth-form__title">Create Account</h1>
                <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="button button--primary" style={{ width: '100%' }}>
                    Sign Up
                </button>
                {error && <p className="message message--error">{error}</p>}
                {message && <p className="message message--success">{message}</p>}
                <p className="redirect-link">
                    Already have an account? <Link href="/auth/login">Login</Link>
                </p>
            </form>
        </main>
    );
}