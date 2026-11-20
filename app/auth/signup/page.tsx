"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import authBg from '@/public/auth-bg.png';
import PasswordInput from '@/app/_components/Inputs/PasswordInput/PasswordInput';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
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
        setSubmitting(true);

        try {
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
                setSubmitting(false);
            }
        } catch (err) {
            console.error('Signup error:', err);
            setError('An unexpected error occurred. Please try again.');
            setSubmitting(false);
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
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
                        minLength={6}
                        describedBy="password-hint"
                    />
                    <p id="password-hint" className="field-hint">Use at least 6 characters.</p>
                </div>
                <button type="submit" className="button button--primary" style={{ width: '100%' }} disabled={submitting}>
                    {submitting ? 'Creating account…' : 'Sign Up'}
                </button>
                {error && <p className="message message--error" role="alert">{error}</p>}
                {message && <p className="message message--success" role="status">{message}</p>}
                <p className="redirect-link">
                    Already have an account? <Link href="/auth/login">Login</Link>
                </p>
            </form>
        </main>
    );
}