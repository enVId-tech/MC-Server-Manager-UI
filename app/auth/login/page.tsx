"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import loginBg from '@/public/auth-bg.png';
import PasswordInput from '@/app/_components/Inputs/PasswordInput/PasswordInput';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const router = useRouter();

    // Set up an effect to check if the user is already logged in
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
                    router.push('/manager/dashboard'); // Redirect to dashboard if already logged in
                } else {
                    console.error('Not authenticated');
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

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            });

            if (response.ok) {
                // Dispatch the login-success event
                window.dispatchEvent(new Event('login-success'));

                // Navigate to dashboard
                router.push('/manager/dashboard');
            } else {
                // Handle login error
                const data = await response.json();
                setError(data.message || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            setError('An unexpected error occurred');
        } finally {
            setSubmitting(false);
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
                        autoComplete="email"
                        placeholder="you@example.com"
                        autoFocus
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <PasswordInput
                        id="password"
                        value={password}
                        onChange={setPassword}
                        autoComplete="current-password"
                        placeholder="Your password"
                    />
                </div>
                <button type="submit" className="button button--primary" style={{ width: '100%' }} disabled={submitting}>
                    {submitting ? 'Logging in…' : 'Log In'}
                </button>
                {error && <p className="message message--error" role="alert">{error}</p>}
                <p className="redirect-link">
                    Don&#39;t have an account? <Link href="/auth/signup">Sign Up</Link>
                </p>
            </form>
        </main>
    );
}