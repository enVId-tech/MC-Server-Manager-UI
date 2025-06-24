"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '@/app/page.module.scss';
import backgroundImage from '@/public/main-bg.png';

export default function HeroSection() {
    const [offsetY, setOffsetY] = useState(0);
    const handleScroll = () => setOffsetY(window.pageYOffset);

    useEffect(() => {
        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    // This style applies the background image and the transform that creates the parallax effect.
    // The background scrolls at half the speed of the page (0.5).
    const backgroundStyle = {
        backgroundImage: `url(${backgroundImage.src})`,
        transform: `translateY(${offsetY * 0.5}px)`,
    };

    return (
        <section className={styles.hero}>
            <div className={styles.hero__background} style={backgroundStyle} />
            <div className={styles.hero__container}>
                <h1 className={styles.hero__title}>
                    Minecraft Servers Made Simple
                </h1>
                <p className={styles.hero__subtitle}>
                    Create, manage, and deploy Minecraft servers automatically with Docker and Portainer.
                </p>
                <div className={styles.hero__buttons}>
                    <Link href="/get-started" className={`${styles.button} ${styles['button--primary']}`}>
                        Get Started
                    </Link>
                    <Link href="/documentation" className={`${styles.button} ${styles['button--outline']}`}>
                        Documentation
                    </Link>
                </div>
            </div>
        </section>
    );
}