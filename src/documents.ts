import { extractHtml, type ExtractOptions, type ExtractedSection } from './html.js';
import type { IndexedChunk, IndexedPage, SearchIndexData } from './types.js';

/** A section you already split yourself. */
export interface DocumentSection {
  /** The heading; omit for an introduction. */
  heading?: string;
  /** The id to link to (`url#anchor`). */
  anchor?: string;
  text: string;
}

/**
 * One page to index. Give its content in exactly one form: plain `text`,
 * `markdown` (split at `##`/`###` headings, with GitHub-style anchors), `html`
 * (extracted the same way as the CLI does), or ready-made `sections`.
 */
export type SearchDocument = { url: string; title?: string } & (
  | { text: string; markdown?: never; html?: never; sections?: never }
  | { markdown: string; text?: never; html?: never; sections?: never }
  | { html: string; text?: never; markdown?: never; sections?: never }
  | { sections: DocumentSection[]; text?: never; markdown?: never; html?: never }
);

/** Options for {@link buildIndex}. */
export interface BuildIndexOptions extends ExtractOptions {
  /** Cut each section's stored text to about this many characters, to shrink the index. Default: no limit. */
  maxChunkLength?: number;
}

/** A GitHub-style heading anchor: "Reset your password!" becomes "reset-your-password". */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Markdown down to plain text: links keep their text, images their alt text, markup goes. */
export function markdownToText(md: string): string {
  return md
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, '')
    .replace(/[|]/g, ' ')
    .replace(/(\*\*|__|\*|_|~~|`)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split Markdown at headings of the given levels (default `##` and `###`). */
export function splitMarkdown(md: string, splitOn: readonly string[] = ['h2', 'h3']): { title: string; sections: ExtractedSection[] } {
  const levels = new Set(splitOn.map((h) => Number(h.replace(/^h/i, ''))));
  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const sections: ExtractedSection[] = [];
  const seen = new Map<string, number>();
  let title = '';
  let current: { heading: string; anchor?: string; lines: string[] } = { heading: '', lines: [] };
  let fence = false;
  const flush = () => {
    const text = markdownToText(current.lines.join('\n'));
    if (text) sections.push({ heading: current.heading, ...(current.anchor ? { anchor: current.anchor } : {}), text });
  };
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = fence ? null : /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h && h[1]!.length === 1 && !title) {
      title = markdownToText(h[2]!);
      continue;
    }
    if (h && levels.has(h[1]!.length)) {
      flush();
      const heading = markdownToText(h[2]!);
      let anchor = slugify(heading);
      const n = seen.get(anchor) ?? 0;
      seen.set(anchor, n + 1);
      if (n) anchor = `${anchor}-${n}`;
      current = { heading, ...(anchor ? { anchor } : {}), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  flush();
  return { title, sections };
}

function truncate(text: string, max: number | undefined): string {
  if (!max || text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return space > max * 0.6 ? cut.slice(0, space) : cut;
}

/**
 * Build index data from documents you already have, such as Markdown files,
 * CMS entries or JSON. Save the result as JSON and load it with `loadSearch`,
 * or pass it straight to `createSearch`.
 *
 * @example
 * const data = buildIndex([
 *   { url: '/docs/install', title: 'Install', markdown: '## With npm\nRun `npm install`.' },
 *   { url: '/pricing', title: 'Pricing', text: 'Free for open source.' },
 * ]);
 */
export function buildIndex(documents: Iterable<SearchDocument>, options: BuildIndexOptions = {}): SearchIndexData {
  const pages: IndexedPage[] = [];
  const chunks: IndexedChunk[] = [];
  for (const doc of documents) {
    if (!doc || typeof doc.url !== 'string') throw new TypeError('static-search: every document needs a `url` string.');
    let title = doc.title ?? '';
    let sections: ExtractedSection[] | DocumentSection[];
    if (typeof doc.text === 'string') sections = [{ heading: '', text: doc.text }];
    else if (typeof doc.markdown === 'string') {
      const md = splitMarkdown(doc.markdown, options.splitOn);
      title ||= md.title;
      sections = md.sections;
    } else if (typeof doc.html === 'string') {
      const page = extractHtml(doc.html, options);
      if (!page.indexable) continue;
      title ||= page.title;
      sections = page.sections;
    } else if (Array.isArray(doc.sections)) sections = doc.sections;
    else throw new TypeError(`static-search: document ${doc.url} has no text, markdown, html or sections.`);

    const page = pages.length;
    let added = 0;
    for (const s of sections) {
      const text = truncate(s.text.replace(/\s+/g, ' ').trim(), options.maxChunkLength);
      if (!text) continue;
      chunks.push({ page, ...(s.anchor ? { anchor: s.anchor } : {}), ...(s.heading ? { section: s.heading.trim() } : {}), text });
      added++;
    }
    if (added) pages.push({ url: doc.url, title: title.trim() || doc.url });
  }
  return { version: 1, pages, chunks };
}
