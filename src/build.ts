import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { buildIndex, type BuildIndexOptions, type SearchDocument } from './documents.js';
import { extractHtml } from './html.js';
import type { SearchIndexData } from './types.js';

export { buildIndex, markdownToText, slugify, splitMarkdown } from './documents.js';
export type { BuildIndexOptions, DocumentSection, SearchDocument } from './documents.js';
export { DEFAULT_IGNORE, decodeEntities, extractHtml } from './html.js';
export type { ExtractedPage, ExtractedSection, ExtractOptions } from './html.js';
export type { IndexedChunk, IndexedPage, SearchIndexData } from './types.js';

/** Files skipped unless you pass your own `exclude` list. */
export const DEFAULT_EXCLUDE: readonly string[] = ['404.html', '500.html', '404/index.html'];

/** Options for {@link buildFromDirectory}. */
export interface DirectoryOptions extends BuildIndexOptions {
  /** Prefix for every URL, such as `/docs` or `https://example.com`. Default: none, so URLs are root paths (`/about`). */
  baseUrl?: string;
  /**
   * Glob patterns (relative to the folder) of HTML files to skip. A pattern
   * without a `/` matches a file name at any depth. `*` matches within a
   * folder, `**` across folders. Default {@link DEFAULT_EXCLUDE}.
   */
  exclude?: readonly string[];
  /**
   * `true` turns `about.html` into `/about`; `false` keeps `/about.html`.
   * Default `'auto'`: follow the site's own links, keeping `.html` when its pages
   * link to each other that way and dropping it otherwise. `docs/index.html`
   * becomes `/docs/` either way.
   */
  cleanUrls?: boolean | 'auto';
  /** Remove a site-name suffix shared by most titles ("Install | Acme Docs" becomes "Install"). Default `true`. */
  stripTitleSuffix?: boolean;
}

/** What {@link buildFromDirectory} produced. */
export interface DirectoryResult {
  /** The index, ready to save as JSON. */
  data: SearchIndexData;
  /** HTML files read, relative to the folder. */
  files: string[];
  /** HTML files left out, and why. */
  skipped: { file: string; reason: 'excluded' | 'noindex' | 'empty' }[];
  /** Whether URLs were written without `.html` (decided from the site's links when `cleanUrls` is `'auto'`). */
  cleanUrls: boolean;
}

/** Turn a glob into a regular expression over `/`-separated relative paths. */
export function globToRegExp(glob: string): RegExp {
  const anchored = glob.includes('/');
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${re.replace(/^\//, '')}$`);
}

/** The URL a built file is served at: `docs/index.html` becomes `/docs/`, `about.html` becomes `/about`. */
export function fileToUrl(file: string, options: { baseUrl?: string; cleanUrls?: boolean } = {}): string {
  let path = ('/' + file.split(sep).join('/')).replace(/(^|\/)index\.html?$/i, '$1');
  if (options.cleanUrls ?? true) path = path.replace(/\.html?$/i, '');
  return (options.baseUrl ?? '').replace(/\/+$/, '') + path;
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, full, out);
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) out.push(relative(root, full));
  }
}

/**
 * Whether a site links to its own pages without `.html`: counts internal links
 * to each page in both forms, and says yes unless the `.html` form wins.
 */
export function prefersCleanUrls(pages: { file: string; html: string }[]): boolean {
  const raw = new Set<string>();
  const clean = new Set<string>();
  for (const { file } of pages) {
    const path = '/' + file.split(sep).join('/');
    if (/(^|\/)index\.html?$/i.test(path)) continue;
    raw.add(path);
    clean.add(path.replace(/\.html?$/i, ''));
  }
  let rawLinks = 0;
  let cleanLinks = 0;
  for (const { file, html } of pages) {
    const base = new URL('/' + file.split(sep).join('/'), 'http://site.invalid');
    for (const m of html.matchAll(/\shref\s*=\s*["']?([^"'\s>]+)/gi)) {
      let url: URL;
      try {
        url = new URL(m[1]!, base);
      } catch {
        continue;
      }
      if (url.origin !== base.origin) continue;
      const path = decodeURI(url.pathname).replace(/\/$/, '');
      if (raw.has(path)) rawLinks++;
      else if (clean.has(path)) cleanLinks++;
    }
  }
  return rawLinks <= cleanLinks;
}

const SEPARATORS = [' | ', ' - ', ' — ', ' – ', ' · ', ' :: '];

/** Remove a suffix such as " | Site name" that most titles share. */
export function stripCommonTitleSuffix(titles: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of titles) {
    for (const s of SEPARATORS) {
      const at = t.lastIndexOf(s);
      if (at > 0) counts.set(t.slice(at), (counts.get(t.slice(at)) ?? 0) + 1);
    }
  }
  let suffix = '';
  let best = 0;
  for (const [s, n] of counts) if (n > best) [suffix, best] = [s, n];
  if (best < 2 || best < titles.length / 2) return titles;
  return titles.map((t) => (t.endsWith(suffix) && t.length > suffix.length ? t.slice(0, -suffix.length).trim() : t));
}

/**
 * Index every HTML file in a built site folder (Next.js `out/`, Astro or
 * Vite `dist/`, Hugo `public/`, or any folder of pages).
 *
 * @example
 * const { data } = await buildFromDirectory('dist');
 * await writeFile('dist/search-index.json', JSON.stringify(data));
 */
export async function buildFromDirectory(dir: string, options: DirectoryOptions = {}): Promise<DirectoryResult> {
  const all: string[] = [];
  await walk(dir, dir, all);
  all.sort();
  const exclude = (options.exclude ?? DEFAULT_EXCLUDE).map(globToRegExp);
  const skipped: DirectoryResult['skipped'] = [];
  const files: string[] = [];
  const read: { file: string; html: string }[] = [];
  for (const file of all) {
    const posix = file.split(sep).join('/');
    if (exclude.some((re) => re.test(posix))) skipped.push({ file: posix, reason: 'excluded' });
    else read.push({ file, html: await readFile(join(dir, file), 'utf8') });
  }
  const cleanUrls = options.cleanUrls === undefined || options.cleanUrls === 'auto' ? prefersCleanUrls(read) : options.cleanUrls;
  const docs: (SearchDocument & { title: string })[] = [];
  for (const { file, html } of read) {
    const posix = file.split(sep).join('/');
    files.push(posix);
    const page = extractHtml(html, options);
    if (!page.indexable) skipped.push({ file: posix, reason: 'noindex' });
    else if (!page.sections.length) skipped.push({ file: posix, reason: 'empty' });
    else docs.push({ url: fileToUrl(file, { ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}), cleanUrls }), title: page.title, sections: page.sections });
  }
  if (options.stripTitleSuffix ?? true) {
    const titles = stripCommonTitleSuffix(docs.map((d) => d.title));
    docs.forEach((d, i) => (d.title = titles[i]!));
  }
  skipped.sort((x, y) => (x.file < y.file ? -1 : 1));
  return { data: buildIndex(docs, options), files, skipped, cleanUrls };
}
