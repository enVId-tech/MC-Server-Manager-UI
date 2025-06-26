"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import loginBg from '@/public/auth-bg.png';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();
    const [fullyLoaded, setFullyLoaded] = useState(false);

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

            setFullyLoaded(true);
        }

        checkAuth();

        window.addEventListener('storage', checkAuth);

        return () => {
            window.removeEventListener('storage', checkAuth);
        };
    }, [router]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();

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
                {fullyLoaded && (
                    <button type="submit" className="button button--primary" style={{ width: '100%' }}>
                        Log In
                    </button>
                )}
                {error && <p className="message message--error">{error}</p>}
                <p className="redirect-link">
                    Don&#39;t have an account? <Link href="/auth/signup">Sign Up</Link>
                </p>
            </form>
        </main>
    );
}