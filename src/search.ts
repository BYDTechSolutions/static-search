import { ENGLISH_STOP_WORDS, fold, keep, term, terms, words, type Analyzer } from './text.js';
import type { SearchIndexData, SearchResult } from './types.js';

/** Relative weight of a match in each field. A word in the title counts `title` times a word in the body. */
export interface FieldWeights {
  /** Page title. Default `3`. */
  title?: number;
  /** Section heading. Default `2`. */
  section?: number;
  /** Section text. Default `1`. */
  body?: number;
}

/** Options for {@link createSearch} and {@link loadSearch}. Every option has a default. */
export interface SearchOptions {
  /** Field weights. Default `{ title: 3, section: 2, body: 1 }`. */
  weights?: FieldWeights;
  /** Words ignored in pages and queries. Default {@link ENGLISH_STOP_WORDS}; pass `[]` to keep every word. */
  stopWords?: Iterable<string>;
  /** Strip common English suffixes so "pages" finds "page". Default `true`; turn off for other languages. */
  stem?: boolean;
  /** Default number of results per query. Default `10`. */
  limit?: number;
  /** At most this many sections from one page, so one long page cannot fill the list. Default `2`. */
  perPage?: number;
  /** Treat the last word as a prefix while it is being typed ("pass" finds "password"). Default `true`. */
  prefix?: boolean;
  /** Approximate snippet length in characters. Default `160`. */
  snippetLength?: number;
  /** BM25 term-frequency saturation. Default `1.2`. */
  k1?: number;
  /** BM25 length normalization, from 0 (none) to 1 (full). Default `0.75`. */
  b?: number;
}

/** Per-query overrides. */
export interface QueryOptions {
  /** Number of results. Default: the `limit` given to {@link createSearch} (10). */
  limit?: number;
  /** Sections per page. Default: the `perPage` given to {@link createSearch} (2). */
  perPage?: number;
  /** Prefix-match the last word. Default: the `prefix` given to {@link createSearch} (true). */
  prefix?: boolean;
}

/** A loaded index, ready to query. */
export interface Search {
  /**
   * The best sections for `text`, best first; empty when nothing matches.
   * While the last word is still being typed (no trailing space), it also
   * matches longer words that start with it.
   */
  query(text: string, options?: QueryOptions): SearchResult[];
  /** Number of pages in the index. */
  readonly pageCount: number;
  /** Number of sections (chunks) in the index. */
  readonly chunkCount: number;
}

interface Doc {
  page: number;
  len: number;
}

const MAX_EXPANSIONS = 50;
const PREFIX_WEIGHT = 0.9;

/** Build a {@link Search} from index data you already have (parsed JSON, or the result of `buildIndex`). */
export function createSearch(data: SearchIndexData, options: SearchOptions = {}): Search {
  if (!data || data.version !== 1 || !Array.isArray(data.pages) || !Array.isArray(data.chunks)) {
    throw new Error('static-search: not a version 1 search index. Rebuild it with `static-search build`.');
  }
  const analyzer: Analyzer = {
    stopWords: new Set([...(options.stopWords ?? ENGLISH_STOP_WORDS)].map(fold)),
    stem: options.stem ?? true,
  };
  const w = { title: 3, section: 2, body: 1, ...options.weights };
  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;
  const defaults = { limit: options.limit ?? 10, perPage: options.perPage ?? 2, prefix: options.prefix ?? true };
  const snippetLength = options.snippetLength ?? 160;

  // Inverted index: term -> [doc, weighted term frequency, doc, tf, ...].
  const postings = new Map<string, number[]>();
  const pageTerms = data.pages.map((p) => terms(p.title, analyzer));
  let total = 0;
  const docs: Doc[] = data.chunks.map((c, i) => {
    const tf = new Map<string, number>();
    const add = (list: string[], weight: number) => {
      for (const t of list) tf.set(t, (tf.get(t) ?? 0) + weight);
    };
    add(pageTerms[c.page] ?? [], w.title);
    add(terms(c.section ?? '', analyzer), w.section);
    add(terms(c.text, analyzer), w.body);
    let len = 0;
    for (const [t, f] of tf) {
      len += f;
      let list = postings.get(t);
      if (!list) postings.set(t, (list = []));
      list.push(i, f);
    }
    total += len;
    return { page: c.page, len };
  });
  const avgLen = total / Math.max(1, docs.length) || 1;
  const n = docs.length;
  let vocab: string[] | undefined;

  /** Indexed terms that start with `prefix`, most common first. */
  function expand(prefix: string): string[] {
    vocab ??= [...postings.keys()].sort();
    let lo = 0;
    let hi = vocab.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vocab[mid]! < prefix) lo = mid + 1;
      else hi = mid;
    }
    const out: string[] = [];
    for (let i = lo; i < vocab.length && vocab[i]!.startsWith(prefix); i++) out.push(vocab[i]!);
    if (out.length > MAX_EXPANSIONS) {
      out.sort((x, y) => postings.get(y)!.length - postings.get(x)!.length);
      out.length = MAX_EXPANSIONS;
    }
    return out;
  }

  function query(text: string, o: QueryOptions = {}): SearchResult[] {
    const limit = o.limit ?? defaults.limit;
    const perPage = o.perPage ?? defaults.perPage;
    const folded = words(text).map((x) => fold(x.text));
    const partial = (o.prefix ?? defaults.prefix) && folded.length > 0 && !/[\s\p{P}]$/u.test(text) ? folded[folded.length - 1]! : '';

    // Each group is one query word; a document matches the group with its best term.
    const groups: { term: string; weight: number }[][] = [];
    const exact = new Set<string>();
    folded.forEach((f, i) => {
      const t = term(f, analyzer);
      const group: { term: string; weight: number }[] = [];
      if (t && !exact.has(t)) group.push({ term: t, weight: 1 });
      if (t) exact.add(t);
      if (partial && i === folded.length - 1 && f.length >= 2) {
        for (const v of expand(f)) if (v !== t) group.push({ term: v, weight: PREFIX_WEIGHT });
      }
      if (group.length) groups.push(group);
    });
    if (!groups.length) return [];

    const score = new Float64Array(n);
    const matched = new Uint16Array(n);
    for (const group of groups) {
      const best = new Map<number, number>();
      for (const { term: t, weight } of group) {
        const list = postings.get(t);
        if (!list) continue;
        const df = list.length / 2;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        for (let j = 0; j < list.length; j += 2) {
          const d = list[j]!;
          const f = list[j + 1]!;
          const s = weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * docs[d]!.len) / avgLen)));
          if (s > (best.get(d) ?? 0)) best.set(d, s);
        }
      }
      for (const [d, s] of best) {
        score[d]! += s;
        matched[d]!++;
      }
    }

    const ranked: number[] = [];
    for (let d = 0; d < n; d++) {
      if (matched[d]) {
        // Sections that match more of the query's words come first.
        score[d] = score[d]! * (matched[d]! / groups.length);
        ranked.push(d);
      }
    }
    ranked.sort((x, y) => score[y]! - score[x]!);

    const isMatch = (word: string): boolean => {
      const f = fold(word);
      const t = term(f, analyzer);
      return (t !== null && exact.has(t)) || (partial.length >= 2 && keep(f) && f.startsWith(partial));
    };
    const perPageCount = new Map<number, number>();
    const out: SearchResult[] = [];
    for (const d of ranked) {
      if (out.length >= limit) break;
      const c = data.chunks[d]!;
      const used = perPageCount.get(c.page) ?? 0;
      if (used >= perPage) continue;
      perPageCount.set(c.page, used + 1);
      const page = data.pages[c.page]!;
      out.push({
        url: c.anchor ? `${page.url}#${c.anchor}` : page.url,
        pageUrl: page.url,
        title: page.title,
        section: c.section ?? '',
        ...makeSnippet(c.text, isMatch, snippetLength),
        score: score[d]!,
      });
    }
    return out;
  }

  return { query, pageCount: data.pages.length, chunkCount: docs.length };
}

/** An excerpt of `text` around the densest run of matching words. */
export function makeSnippet(
  text: string,
  isMatch: (word: string) => boolean,
  length = 160,
): { snippet: string; highlights: [number, number][] } {
  const all = words(text);
  const hits = all.filter((x) => isMatch(x.text));
  let start = 0;
  let end = text.length;
  if (text.length > length) {
    if (hits.length) {
      let bestAt = 0;
      let bestCount = 0;
      for (let i = 0; i < hits.length; i++) {
        let j = i;
        while (j < hits.length && hits[j]!.end - hits[i]!.start <= length) j++;
        if (j - i > bestCount) {
          bestCount = j - i;
          bestAt = i;
        }
      }
      start = Math.max(0, hits[bestAt]!.start - Math.floor(length / 4));
      if (start > 0) start = all.find((x) => x.start >= start)?.start ?? start;
    }
    end = Math.min(text.length, start + length);
    if (end < text.length) {
      const last = all.filter((x) => x.end <= end && x.start >= start).pop();
      if (last) end = last.end;
    }
  }
  const lead = start > 0 ? '…' : '';
  const snippet = lead + text.slice(start, end) + (end < text.length ? '…' : '');
  const shift = lead.length - start;
  const highlights: [number, number][] = hits
    .filter((x) => x.start >= start && x.end <= end)
    .map((x) => [x.start + shift, x.end + shift]);
  return { snippet, highlights };
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/**
 * The snippet as HTML, escaped, with each match wrapped in `<mark>`
 * (or another tag). Safe to assign to `innerHTML`.
 *
 * @example
 * el.innerHTML = highlight(result);
 */
export function highlight(result: Pick<SearchResult, 'snippet' | 'highlights'>, tag?: string): string;
export function highlight(text: string, ranges: readonly (readonly [number, number])[], tag?: string): string;
export function highlight(
  input: string | Pick<SearchResult, 'snippet' | 'highlights'>,
  rangesOrTag?: readonly (readonly [number, number])[] | string,
  maybeTag?: string,
): string {
  const text = typeof input === 'string' ? input : input.snippet;
  const ranges = typeof input === 'string' ? (rangesOrTag as readonly (readonly [number, number])[]) ?? [] : input.highlights;
  const tag = (typeof input === 'string' ? maybeTag : (rangesOrTag as string | undefined)) ?? 'mark';
  if (!/^[a-z][a-z0-9-]*$/i.test(tag)) throw new Error(`static-search: invalid tag name "${tag}"`);
  let out = '';
  let at = 0;
  for (const [s, e] of ranges) {
    if (s < at) continue;
    out += escapeHtml(text.slice(at, s)) + `<${tag}>` + escapeHtml(text.slice(s, e)) + `</${tag}>`;
    at = e;
  }
  return out + escapeHtml(text.slice(at));
}

/** Options for {@link loadSearch}: the search options, plus a `fetch` to use instead of the global one. */
export interface LoadOptions extends SearchOptions {
  fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * Fetch an index and get it ready to query.
 *
 * @param src URL of the index. Default `/search-index.json`.
 * @example
 * const search = await loadSearch('/search-index.json');
 * search.query('reset password'); // [{ url, title, section, snippet, highlights, score }]
 */
export async function loadSearch(src: string | URL = '/search-index.json', options: LoadOptions = {}): Promise<Search> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const res = await doFetch(src);
  if (!res.ok) {
    throw new Error(
      `static-search: could not load ${String(src)} (HTTP ${res.status}). Run \`npx static-search build <your output folder>\` after your site build.`,
    );
  }
  return createSearch((await res.json()) as SearchIndexData, options);
}
