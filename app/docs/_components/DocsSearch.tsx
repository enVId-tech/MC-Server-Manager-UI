'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styles from '../docs.module.scss';

interface Entry {
    slug: string;
    title: string;
    section: string;
    summary: string;
    headings: Array<{ id: string; text: string }>;
    text: string;
}

interface Hit {
    href: string;
    title: string;
    context: string;
    score: number;
}

/** A few words of the text around the first match */
function snippet(text: string, term: string): string {
    const at = text.toLowerCase().indexOf(term);
    if (at === -1) return '';
    const start = Math.max(0, at - 40);
    return `${start > 0 ? '…' : ''}${text.slice(start, at + 90).trim()}…`;
}

/** Search over every page of the wiki. The index is fetched the first time the box is used. */
export default function DocsSearch() {
    const [query, setQuery] = useState('');
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [open, setOpen] = useState(false);
    const loading = useRef(false);

    const load = () => {
        if (entries || loading.current) return;
        loading.current = true;
        fetch('/docs/search.json')
            .then(response => response.json())
            .then((data: Entry[]) => setEntries(data))
            .catch(() => { loading.current = false; });
    };

    const hits = useMemo<Hit[]>(() => {
        const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 1);
        if (!entries || terms.length === 0) return [];
        const found: Hit[] = [];
        for (const entry of entries) {
            const title = entry.title.toLowerCase();
            const summary = entry.summary.toLowerCase();
            const body = `${summary} ${entry.text}`.toLowerCase();
            if (!terms.every(term => title.includes(term) || body.includes(term) || entry.headings.some(heading => heading.text.toLowerCase().includes(term)))) continue;
            let score = 0;
            for (const term of terms) {
                if (title.includes(term)) score += 10;
                if (summary.includes(term)) score += 3;
                score += Math.min(5, body.split(term).length - 1);
            }
            const context = snippet(entry.text, terms[0]);
            found.push({ href: `/docs/${entry.slug}`, title: entry.title, context: context ? `${entry.section} · ${context}` : entry.section, score });
            // Headings that match are listed too, so a search lands on the right part of a page
            for (const heading of entry.headings) {
                if (terms.every(term => heading.text.toLowerCase().includes(term))) {
                    found.push({ href: `/docs/${entry.slug}#${heading.id}`, title: heading.text, context: entry.title, score: score + 4 });
                }
            }
        }
        return found.sort((a, b) => b.score - a.score).slice(0, 8);
    }, [entries, query]);

    return (
        <div className={styles.search}>
            <input
                type="search"
                value={query}
                placeholder="Search the docs"
                aria-label="Search the documentation"
                onFocus={() => { load(); setOpen(true); }}
                onChange={event => { setQuery(event.target.value); setOpen(true); }}
                onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}
            />
            {open && query.trim().length > 1 && (
                <div className={styles.results} role="listbox">
                    {!entries && <p>Loading…</p>}
                    {entries && hits.length === 0 && <p>No page matches “{query.trim()}”.</p>}
                    {hits.map(hit => (
                        <Link key={hit.href} href={hit.href} onClick={() => { setOpen(false); setQuery(''); }}>
                            <strong>{hit.title}</strong>
                            <span>{hit.context}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
