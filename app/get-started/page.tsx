"use client";

import React from 'react';
import Link from 'next/link';
import styles from './get-started.module.scss';
import { FaUserPlus, FaServer, FaRocket } from 'react-icons/fa';

interface Step {
    title: string;
    description: string;
    icon?: React.ReactNode;
}

const initialSteps: Step[] = [
    {
        title: 'Create Your Account',
        description: 'Sign up for a free account in seconds. No credit card is required to get started.',
        icon: <FaUserPlus />,
    },
    {
        title: 'Configure Your Server',
        description: 'Follow our simple guides to connect your server and configure your deployment settings.',
        icon: <FaServer />,
    },
    {
        title: 'Deploy with One Click',
        description: 'Once configured, deploy your applications effortlessly and watch the magic happen.',
        icon: <FaRocket />,
    },
];

const detailedSteps: Step[] = [
    {
        title: 'Step 1: In-Depth Configuration',
        description: 'Dive deeper into the configuration options available. Customize environment variables, set up build commands, and link your repositories with ease. Our UI makes it simple.',
    },
    {
        title: 'Step 2: Monitor Your Deployments',
        description: 'Watch your build process in real-time with live logs. Our animated dashboard provides instant feedback on the status of your deployment, from cloning to completion.',
    },
];

export default function GetStartedPage() {
    return (
        <main className={styles.getStartedPage}>
            <header className={styles.header}>
                <h1 className={styles.header__title}>Get Started</h1>
                <p className={styles.header__subtitle}>
                    Deploying your project has never been easier. Follow these three simple steps to get up and running.
                </p>
            </header>

            <div className={styles.stepsContainer}>
                {initialSteps.map((step, index) => (
                    <div key={index} className={styles.stepCard}>
                        <div className={styles.stepCard__icon}>{step.icon}</div>
                        <h2 className={styles.stepCard__title}>{step.title}</h2>
                        <p className={styles.stepCard__description}>{step.description}</p>
                    </div>
                ))}
            </div>

            <section className={styles.videoSection}>
                <h2 className={styles.videoSection__title}>Getting started - Video Tutorial</h2>
                <div className={styles.videoSection__playerWrapper}>
                    <iframe
                        src="https://www.youtube.com/embed/your_video_id_here"
                        title="Video Tutorial"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    ></iframe>
                </div>
            </section>

            <section className={styles.detailedSteps}>
                {detailedSteps.map((step: Step, index: number) => (
                    <div key={index} className={styles.detailedStep}>
                        <div className={styles.detailedStep__content}>
                            <h3 className={styles.detailedStep__title}>{step.title}</h3>
                            <p className={styles.detailedStep__description}>{step.description}</p>
                        </div>
                        <div className={styles.detailedStep__visual}>
                            <span>Animation / Image Placeholder</span>
                        </div>
                    </div>
                ))}
            </section>

            <div className={styles.cta}>
                <p className={styles.cta__text}>Ready to launch?</p>
                <Link href="/signup" className="button button--primary">
                    Create Account Now
                </Link>
            </div>
        </main>
    );
}