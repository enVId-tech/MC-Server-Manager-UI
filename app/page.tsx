import Image from 'next/image';
import Link from 'next/link';
import styles from "./page.module.scss";
import HeroSection from "@/app/_components/HeroSection";

// Images
import mcServer from '@/public/minecraft-server.png';
export default function Home() {
    return (
        <>
            <main className={styles.home}>
                {/* Hero Section with Parallax Effect */}
                <HeroSection />

                {/* Features Section */}
                <section className={styles.features}>
                    <div className={styles.features__container}>
                        <h2 className={styles.features__title}>How It Works</h2>
                        <div className={styles.features__grid}>
                            <div className={styles.features__item}>
                                <div className={styles.features__icon}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect width="18" height="18" x="3" y="3" rx="2" />
                                        <path d="M3 9h18" /><path d="M9 21V9" />
                                    </svg>
                                </div>
                                <h3 className={styles.features__item_title}>1. Choose Server</h3>
                                <p className={styles.features__item_desc}>Select from different Minecraft server types and versions.</p>
                            </div>
                            <div className={styles.features__item}>
                                <div className={styles.features__icon}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
                                    </svg>
                                </div>
                                <h3 className={styles.features__item_title}>2. Configure</h3>
                                <p className={styles.features__item_desc}>Customize your server settings with just a few clicks.</p>
                            </div>
                            <div className={styles.features__item}>
                                <div className={styles.features__icon}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    </svg>
                                </div>
                                <h3 className={styles.features__item_title}>3. Deploy Instantly</h3>
                                <p className={styles.features__item_desc}>Your server is deployed automatically using Docker.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Benefits Section */}
                <section className={styles.benefits}>
                    <div className={styles.benefits__container}>
                        <div className={styles.benefits__content}>
                            <h2 className={styles.benefits__title}>Our Features</h2>
                            <ul className={styles.benefits__list}>
                                <li className={styles.benefits__list_item}>
                                    <svg className={styles.benefits__list_icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    <span><strong>No Technical Skills Required</strong> - Create servers with zero Docker knowledge.</span>
                                </li>
                                <li className={styles.benefits__list_item}>
                                    <svg className={styles.benefits__list_icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    <span><strong>Resource Efficient</strong> - Optimized containers for better performance.</span>
                                </li>
                                <li className={styles.benefits__list_item}>
                                    <svg className={styles.benefits__list_icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    <span><strong>One-Click Updates</strong> - Keep your server updated easily.</span>
                                </li>
                                <li className={styles.benefits__list_item}>
                                    <svg className={styles.benefits__list_icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    <span><strong>Automatic Backups</strong> - Never lose your world progress.</span>
                                </li>
                            </ul>
                        </div>
                        <div className={styles.benefits__image_container}>
                            <Image src={mcServer} alt="Minecraft Server Dashboard" fill style={{ objectFit: 'cover' }} priority />
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className={styles.cta}>
                    <div className={styles.cta__container}>
                        <h2 className={styles.cta__title}>Ready to Create Your Server?</h2>
                        <p className={styles.cta__subtitle}>Get your server up and running in minutes with our simple deployment tool.</p>
                        <Link href="/register" className={styles.button}>
                            Create Your Server Now
                        </Link>
                    </div>
                </section>
            </main>
            <footer className={styles.footer}>
                <div className={styles.footer__container}>
                    <div className={styles.footer__links}>
                        <Link href="/get-started">Get Started</Link>
                        <Link href="/documentation">Docs</Link>
                        <Link href="/contact">Contact</Link>
                    </div>
                    <div className={styles.footer__copy}>
                        &copy; {new Date().getFullYear()} <a href={"https://github.com/enVId-tech"} target="_blank">enVId Tech</a>. All Rights Reserved.
                    </div>
                </div>
            </footer>
        </>
    );
}