'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOC_SECTIONS } from '@/lib/docs/pages';
import styles from '../docs.module.scss';

/** Sidebar with every section and page of the wiki. On small screens it folds away behind a button. */
export default function DocsNav() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    return (
        <nav className={styles.nav} aria-label="Documentation">
            <button type="button" className={styles.navToggle} aria-expanded={open} onClick={() => setOpen(value => !value)}>
                {open ? 'Hide pages' : 'All pages'}
            </button>
            <div className={`${styles.navList} ${open ? styles.navOpen : ''}`}>
                <Link href="/docs" className={`${styles.navHome} ${pathname === '/docs' ? styles.active : ''}`} onClick={() => setOpen(false)}>Documentation home</Link>
                {DOC_SECTIONS.map(section => (
                    <div key={section.title} className={styles.navSection}>
                        <h2>{section.title}</h2>
                        <ul>
                            {section.pages.map(page => {
                                const href = `/docs/${page.slug}`;
                                return (
                                    <li key={page.slug}>
                                        <Link href={href} className={pathname === href ? styles.active : ''} aria-current={pathname === href ? 'page' : undefined} onClick={() => setOpen(false)}>
                                            {page.title}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>
        </nav>
    );
}
