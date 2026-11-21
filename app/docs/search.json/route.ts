import { NextResponse } from 'next/server';
import { ALL_DOC_PAGES, DOC_SECTIONS } from '@/lib/docs/pages';
import { renderDoc } from '@/lib/docs/render';

export const dynamic = 'force-static';

/** Everything the search box needs, built once when the app is built */
export function GET() {
    const entries = ALL_DOC_PAGES.map(page => {
        const doc = renderDoc(page.slug);
        const section = DOC_SECTIONS.find(candidate => candidate.pages.includes(page))?.title ?? '';
        return {
            slug: page.slug,
            title: page.title,
            section,
            summary: page.summary,
            headings: doc?.headings.map(heading => ({ id: heading.id, text: heading.text })) ?? [],
            text: doc?.text ?? '',
        };
    });
    return NextResponse.json(entries);
}
