import Link from 'next/link';
import { DOC_SECTIONS } from '@/lib/docs/pages';
import styles from './docs.module.scss';

const START_HERE = [
    { href: '/docs/quick-start', title: 'I want a server', text: 'Sign up, create a server and join it.' },
    { href: '/docs/installation', title: 'I want to run the manager', text: 'Docker Compose, environment and the first admin account.' },
    { href: '/docs/troubleshooting', title: 'Something is wrong', text: 'Errors you may meet and how to fix them.' },
];

export default function DocsHome() {
    return (
        <article className={styles.article}>
            <header className={styles.header}>
                <p className={styles.eyebrow}>Documentation</p>
                <h1>MC Server Creator wiki</h1>
                <p className={styles.lead}>Everything about creating, running and administering Minecraft servers with the manager: guides for players and server owners, a full administrator handbook and a configuration reference.</p>
            </header>

            <div className={styles.cards}>
                {START_HERE.map(item => (
                    <Link key={item.href} href={item.href} className={styles.card}>
                        <strong>{item.title}</strong>
                        <span>{item.text}</span>
                    </Link>
                ))}
            </div>

            {DOC_SECTIONS.map(section => (
                <section key={section.title} className={styles.indexSection}>
                    <h2>{section.title}</h2>
                    <ul>
                        {section.pages.map(page => (
                            <li key={page.slug}>
                                <Link href={`/docs/${page.slug}`}>{page.title}</Link>
                                <span>{page.summary}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </article>
    );
}
