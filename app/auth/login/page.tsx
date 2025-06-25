"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import loginBg from '@/public/auth-bg.png';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (res.ok) {
            router.push('/dashboard'); // Redirect to a protected dashboard page
            router.refresh(); // Refresh to update server-side state if needed
        } else {
            const data = await res.json();
            setError(data.message || 'An error occurred.');
        }
    };

    return (
        <main className="auth-page" style={{ backgroundImage: `url(${loginBg.src})` }}>
            <form onSubmit={handleSubmit} className="auth-form">
                <h1 className="auth-form__title">Login</h1>
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
                    Log In
                </button>
                {error && <p className="message message--error">{error}</p>}
                <p className="redirect-link">
                    Don&#39;t have an account? <Link href="/auth/signup">Sign Up</Link>
                </p>
            </form>
        </main>
    );
}