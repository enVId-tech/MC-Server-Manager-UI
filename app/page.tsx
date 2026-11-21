import Link from 'next/link';
import type { IconType } from 'react-icons';
import {
    FaBoxOpen, FaCloudDownloadAlt, FaCogs, FaFolderOpen, FaGlobeAmericas, FaGlobe,
    FaPuzzlePiece, FaSlidersH, FaSyncAlt, FaTerminal, FaUsersCog, FaCheck,
} from 'react-icons/fa';
import styles from './page.module.scss';
import landing from '@/app/_components/Landing/Landing.module.scss';
import HeroSection from '@/app/_components/HeroSection';
import DemoPanel from '@/app/_components/Landing/DemoPanel';

const STEPS: { title: string; text: string; icon: IconType }[] = [
    { title: 'Pick a server', text: 'Choose a type and a version from live lists, or start from a modpack.', icon: FaBoxOpen },
    { title: 'Set it up', text: 'Name it, size it, add plugins or mods from a link and bring your own world.', icon: FaSlidersH },
    { title: 'Play', text: 'The panel builds the container for you and gives you an address to join.', icon: FaCloudDownloadAlt },
];

const FEATURES: { title: string; text: string; icon: IconType }[] = [
    { title: 'No Docker knowledge needed', text: 'Every server runs in its own container, created and updated for you.', icon: FaCogs },
    { title: 'Plugins and mods from a link', text: 'Paste a Modrinth, Hangar, Spigot or GitHub link. Updates install automatically, or wait for a restart on running servers.', icon: FaPuzzlePiece },
    { title: 'Bring your world', text: 'Upload a world and the panel checks its version first, so a bad downgrade does not corrupt it.', icon: FaGlobeAmericas },
    { title: 'Console and files in the browser', text: 'Run commands, edit configuration files and upload content without an SSH session.', icon: FaTerminal },
    { title: 'Many servers, one address', text: 'Put servers behind a Velocity proxy so players join one address and move between them.', icon: FaGlobe },
    { title: 'Built for shared hosts', text: 'Memory limits, per-user quotas, file access switches and administrator controls.', icon: FaUsersCog },
    { title: 'Updates and backups', text: 'Pull newer images in a quiet window and download a backup of any server as a zip.', icon: FaSyncAlt },
    { title: 'Every setting available', text: 'The full itzg option catalog, shown only where it applies to your server type and version.', icon: FaFolderOpen },
];

const TYPES = ['Vanilla', 'Paper', 'Purpur', 'Folia', 'Spigot', 'Fabric', 'Quilt', 'Forge', 'NeoForge', 'Mohist', 'Arclight', 'Modrinth modpacks', 'CurseForge modpacks', 'Custom jar'];

const FAQ: { q: string; a: string }[] = [
    { q: 'Do I need to know Docker?', a: 'No. You choose options in the browser and the panel creates and manages the containers.' },
    { q: 'Which servers can I run?', a: 'More than twenty types, including Paper, Purpur, Fabric, Forge and NeoForge, and modpacks from Modrinth and CurseForge.' },
    { q: 'Can I use my existing world?', a: 'Yes. Upload it while creating a server or later from the World tab. The panel compares versions and keeps a copy of the old world.' },
    { q: 'Can servers share one address?', a: 'Yes. An administrator can set up Velocity proxies and the panel links each server to the proxy that fits its version.' },
    { q: 'Is this an official Minecraft product?', a: 'No. It is an independent project and has no affiliation with Mojang Studios or Microsoft.' },
];

export default function Home() {
    return (
        <>
            <main className={styles.home}>
                <HeroSection />

                <section className={landing.section} aria-labelledby="steps-title">
                    <div className={landing.container}>
                        <h2 id="steps-title" className={landing.title}>How it works</h2>
                        <p className={landing.lead}>From nothing to a running server in three steps.</p>
                        <ol className={landing.steps}>
                            {STEPS.map(({ title, text, icon: Icon }, index) => (
                                <li key={title} className={landing.step}>
                                    <span className={landing.stepNumber}>{index + 1}</span>
                                    <Icon className={landing.stepIcon} aria-hidden="true" />
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section className={`${landing.section} ${landing.alt}`} aria-labelledby="demo-title">
                    <div className={landing.container}>
                        <h2 id="demo-title" className={landing.title}>See the panel</h2>
                        <p className={landing.lead}>This is a mock server you can click through. Start and stop it, send console commands, browse files and add a plugin.</p>
                        <DemoPanel />
                    </div>
                </section>

                <section className={landing.section} aria-labelledby="features-title">
                    <div className={landing.container}>
                        <h2 id="features-title" className={landing.title}>What you get</h2>
                        <ul className={landing.features}>
                            {FEATURES.map(({ title, text, icon: Icon }) => (
                                <li key={title} className={landing.feature}>
                                    <Icon className={landing.featureIcon} aria-hidden="true" />
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className={`${landing.section} ${landing.alt}`} aria-labelledby="types-title">
                    <div className={landing.container}>
                        <h2 id="types-title" className={landing.title}>Run what you like</h2>
                        <ul className={landing.chips}>
                            {TYPES.map(name => <li key={name}><FaCheck aria-hidden="true" />{name}</li>)}
                        </ul>
                    </div>
                </section>

                <section className={landing.section} aria-labelledby="faq-title">
                    <div className={`${landing.container} ${landing.narrow}`}>
                        <h2 id="faq-title" className={landing.title}>Questions</h2>
                        <div className={landing.faq}>
                            {FAQ.map(({ q, a }) => (
                                <details key={q}>
                                    <summary>{q}</summary>
                                    <p>{a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                <section className={landing.cta}>
                    <div className={landing.container}>
                        <h2 className={landing.ctaTitle}>Ready to create your server?</h2>
                        <p className={landing.lead}>Sign up and have it running in a few minutes.</p>
                        <Link href="/auth/signup" className={`${styles.button} ${styles['button--primary']}`}>
                            Create your server
                        </Link>
                    </div>
                </section>
            </main>
            <footer className={styles.footer}>
                <div className={styles.footer__container}>
                    <div className={styles.footer__links}>
                        <Link href="/docs">Documentation</Link>
                        <Link href="https://github.com/enVId-tech/MinecraftServerCreator" target="_blank">GitHub Page</Link>
                    </div>
                    <div className={styles.footer__copy}>
                        &copy; {new Date().getFullYear()} <a href="https://github.com/enVId-tech" target="_blank">enVId Tech</a>. All Rights Reserved.
                    </div>
                    <div className={styles.footer__copy}>
                        This website is not an official Minecraft website and is not associated with Mojang Studios or Microsoft. All product and company names are trademarks or registered trademarks of their respective holders. Use of these names does not imply any affiliation or endorsement by them.
                    </div>
                </div>
            </footer>
        </>
    );
}
