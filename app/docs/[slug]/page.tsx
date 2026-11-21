import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ALL_DOC_PAGES, findDocPage } from '@/lib/docs/pages';
import { renderDoc } from '@/lib/docs/render';
import styles from '../docs.module.scss';

export const dynamicParams = false;

export function generateStaticParams() {
    return ALL_DOC_PAGES.map(page => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const found = findDocPage((await params).slug);
    return found ? { title: found.page.title, description: found.page.summary } : {};
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const found = findDocPage(slug);
    const doc = found ? renderDoc(slug) : null;
    if (!found || !doc) notFound();

    return (
        <div className={styles.articleWrap}>
            <article className={styles.article}>
                <header className={styles.header}>
                    <p className={styles.eyebrow}>{found.section.title}</p>
                    <h1>{found.page.title}</h1>
                    <p className={styles.lead}>{found.page.summary}</p>
                </header>
                <div className={styles.prose} dangerouslySetInnerHTML={{ __html: doc.html }} />
                <footer className={styles.footer}>
                    <a href={`https://github.com/enVId-tech/MC-Server-Manager-UI/blob/HEAD/docs/${slug}.md`} target="_blank" rel="noopener noreferrer">Edit this page on GitHub</a>
                    <div className={styles.pager}>
                        {found.previous ? <Link href={`/docs/${found.previous.slug}`}><span>Previous</span>{found.previous.title}</Link> : <span />}
                        {found.next ? <Link href={`/docs/${found.next.slug}`} className={styles.next}><span>Next</span>{found.next.title}</Link> : <span />}
                    </div>
                </footer>
            </article>
            {doc.headings.length > 1 && (
                <nav className={styles.toc} aria-label="On this page">
                    <h2>On this page</h2>
                    <ul>
                        {doc.headings.map(heading => (
                            <li key={heading.id} className={heading.depth === 3 ? styles.sub : ''}><a href={`#${heading.id}`}>{heading.text}</a></li>
                        ))}
                    </ul>
                </nav>
            )}
        </div>
    );
}
