import type { Metadata } from 'next';
import DocsNav from './_components/DocsNav';
import DocsSearch from './_components/DocsSearch';
import styles from './docs.module.scss';

export const metadata: Metadata = {
    title: { default: 'Documentation', template: '%s · Documentation' },
    description: 'Guides and reference for creating, running and administering Minecraft servers with MC Server Creator.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={styles.shell}>
            <aside className={styles.sidebar}>
                <DocsSearch />
                <DocsNav />
            </aside>
            <main className={styles.main}>{children}</main>
        </div>
    );
}
