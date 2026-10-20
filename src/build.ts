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
  /** Turn `about.html` into `/about` and `docs/index.html` into `/docs/`. Default `true`; `false` keeps file paths as they are. */
  cleanUrls?: boolean;
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
export function fileToUrl(file: string, options: Pick<DirectoryOptions, 'baseUrl' | 'cleanUrls'> = {}): string {
  let path = '/' + file.split(sep).join('/');
  if (options.cleanUrls ?? true) path = path.replace(/(^|\/)index\.html?$/i, '$1').replace(/\.html?$/i, '');
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
  const docs: (SearchDocument & { title: string })[] = [];
  for (const file of all) {
    const posix = file.split(sep).join('/');
    if (exclude.some((re) => re.test(posix))) {
      skipped.push({ file: posix, reason: 'excluded' });
      continue;
    }
    files.push(posix);
    const page = extractHtml(await readFile(join(dir, file), 'utf8'), options);
    if (!page.indexable) skipped.push({ file: posix, reason: 'noindex' });
    else if (!page.sections.length) skipped.push({ file: posix, reason: 'empty' });
    else docs.push({ url: fileToUrl(file, options), title: page.title, sections: page.sections });
  }
  if (options.stripTitleSuffix ?? true) {
    const titles = stripCommonTitleSuffix(docs.map((d) => d.title));
    docs.forEach((d, i) => (d.title = titles[i]!));
  }
  return { data: buildIndex(docs, options), files, skipped };
}
