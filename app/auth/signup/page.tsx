"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import authBg from '@/public/auth-bg.png';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [fullyLoaded, setFullyLoaded] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const checkAuth = () => {
            const res = fetch('/api/auth/check', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            res.then(response => {
                if (response.ok) {
                    router.push('/manager/dashboard'); // Redirect to dashboard if authenticated
                } else {
                    setFullyLoaded(true); // Set fully loaded state if not authenticated
                }
            }).catch(error => {
                console.error('Error checking authentication:', error);
            });
        }

        checkAuth();

        window.addEventListener('storage', checkAuth);

        return () => {
            window.removeEventListener('storage', checkAuth);
        };
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setError('');

        const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (res.ok) {
            setMessage(data.message);
            setTimeout(() => router.push('/auth/login'), 3000);
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
                {fullyLoaded && (
                    <button type="submit" className="button button--primary" style={{ width: '100%' }}>
                        Sign Up
                    </button>
                )}
                {error && <p className="message message--error">{error}</p>}
                {message && <p className="message message--success">{message}</p>}
                <p className="redirect-link">
                    Already have an account? <Link href="/auth/login">Login</Link>
                </p>
            </form>
        </main>
    );
}