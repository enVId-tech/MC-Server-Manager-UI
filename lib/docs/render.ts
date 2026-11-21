import fs from 'node:fs';
import path from 'node:path';
import { Marked, type Tokens } from 'marked';
import { ALL_DOC_PAGES } from '@/lib/docs/pages';

export interface DocHeading {
    id: string;
    text: string;
    depth: number;
}

export interface RenderedDoc {
    html: string;
    headings: DocHeading[];
    /** The page as plain text, for the search index */
    text: string;
}

const CALLOUTS: Record<string, string> = { NOTE: 'Note', TIP: 'Tip', WARNING: 'Warning', IMPORTANT: 'Important' };

function slugify(text: string): string {
    return text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-') || 'section';
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Renders one markdown page of /docs. The files are part of the repository, so their HTML is trusted. */
export function renderDoc(slug: string): RenderedDoc | null {
    if (!ALL_DOC_PAGES.some(page => page.slug === slug)) return null;
    let source: string;
    try {
        source = fs.readFileSync(path.join(process.cwd(), 'docs', `${slug}.md`), 'utf8');
    } catch {
        return null;
    }

    const headings: DocHeading[] = [];
    const used = new Set<string>();
    const marked = new Marked({ gfm: true });
    marked.use({
        renderer: {
            heading(this, token: Tokens.Heading) {
                const text = this.parser.parseInline(token.tokens);
                let id = slugify(token.text);
                for (let n = 2; used.has(id); n++) id = `${slugify(token.text)}-${n}`;
                used.add(id);
                if (token.depth >= 2 && token.depth <= 3) headings.push({ id, text: token.text.replace(/[`*_]/g, ''), depth: token.depth });
                return `<h${token.depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${text}</h${token.depth}>\n`;
            },
            link(this, token: Tokens.Link) {
                const text = this.parser.parseInline(token.tokens);
                const external = /^https?:\/\//.test(token.href);
                return `<a href="${escapeHtml(token.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
            },
            code(token: Tokens.Code) {
                return `<pre><code${token.lang ? ` data-lang="${escapeHtml(token.lang)}"` : ''}>${escapeHtml(token.text)}</code></pre>\n`;
            },
            blockquote(this, token: Tokens.Blockquote) {
                const inner = this.parser.parse(token.tokens);
                const match = /^<p>\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*/.exec(inner);
                if (!match) return `<blockquote>${inner}</blockquote>\n`;
                return `<aside class="callout callout-${match[1].toLowerCase()}"><strong class="callout-title">${CALLOUTS[match[1]]}</strong>${inner.replace(match[0], '<p>')}</aside>\n`;
            },
            table(this, token: Tokens.Table) {
                const cell = (item: Tokens.TableCell, tag: string) => `<${tag}${item.align ? ` style="text-align:${item.align}"` : ''}>${this.parser.parseInline(item.tokens)}</${tag}>`;
                const head = `<tr>${token.header.map(item => cell(item, 'th')).join('')}</tr>`;
                const rows = token.rows.map(row => `<tr>${row.map(item => cell(item, 'td')).join('')}</tr>`).join('');
                return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
            },
        },
    });

    // The page title is shown by the page itself, so a leading "# Title" is not rendered twice
    const body = source.replace(/^# .*\n+/, '');
    const html = marked.parse(body, { async: false });
    const text = body
        .replace(/```[\s\S]*?```/g, match => match.replace(/```\w*/g, ' '))
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^> \[!\w+\]\s*/gm, '')
        .replace(/[#>*_`|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return { html, headings, text };
}
