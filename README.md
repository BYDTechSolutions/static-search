# @bydtech/static-search

Full-text search for static sites: one build command over your HTML, a 2.5 kB browser runtime, and an optional drop-in `<static-search>` element.

[![npm version](https://img.shields.io/npm/v/@bydtech/static-search.svg)](https://www.npmjs.com/package/@bydtech/static-search)
[![CI](https://github.com/BYDTechSolutions/static-search/actions/workflows/ci.yml/badge.svg)](https://github.com/BYDTechSolutions/static-search/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Why it exists

A static site has no server to run a search, and a hosted search service is one more account, bill and privacy question. Most sites with up to a few hundred pages do not need either: the text fits in one JSON file the browser can search in a millisecond. This package builds that file from the HTML your site generator already wrote, and gives you a search box or a small API to query it. It started as the in-browser search behind a site assistant, where the server had no CPU budget for search.

## Quick start

```sh
npm install --save-dev @bydtech/static-search

# after your site build; point it at the output folder (out/, dist/, public/...)
npx static-search build dist
```

That writes `dist/search-index.json` and `dist/static-search.js`. Put a search box on any page:

```html
<script type="module" src="/static-search.js"></script>
<static-search></static-search>
```

Done. Results link to the section that matched (`/docs/account#reset-password`), with the matching words highlighted.

To build your own UI instead, use the headless API. With a bundler, import it from the package; without one, the same functions come from the script the build wrote:

```js
import { loadSearch } from '@bydtech/static-search'; // or: from '/static-search.js'

const search = await loadSearch('/search-index.json');
const results = search.query('reset password');
// [{ url: '/docs/account#reset-password', title: 'Account', section: 'Reset your password',
//    snippet: 'Open settings and pick a new password…', highlights: [[29, 37]], score: 7.1 }]
```

Run the build after every site build, for example in `package.json`:

```json
{ "scripts": { "build": "astro build && static-search build dist" } }
```

## Framework recipes

| Site | Build script |
|---|---|
| Plain HTML | `static-search build public` (any folder of `.html` files) |
| Next.js, static export (`output: 'export'`) | `next build && static-search build out` |
| Astro, Vite | `astro build && static-search build dist` |
| Eleventy | `eleventy && static-search build _site` |
| Hugo | `hugo && static-search build public` |
| Next.js with server rendering | no finished HTML folder: build the index from your content with `buildIndex` before `next build` (see [Markdown, JSON or a CMS](#markdown-json-or-a-cms)) |

**Next.js App Router** ([examples/nextjs/Search.tsx](examples/nextjs/Search.tsx)): the element must load in the browser only.

```tsx
'use client';
import { useEffect } from 'react';

export function Search() {
  useEffect(() => void import('@bydtech/static-search/element'), []);
  return <static-search src="/search-index.json" placeholder="Search" />;
}
```

TypeScript needs to be told about the tag once; the example file has the five-line `declare module 'react'` block.

**Astro** ([examples/astro/Search.astro](examples/astro/Search.astro)):

```astro
<static-search src="/search-index.json"></static-search>
<script>
  import '@bydtech/static-search/element';
</script>
```

**React hook** on the headless API ([examples/react/useStaticSearch.ts](examples/react/useStaticSearch.ts)):

```ts
import { useEffect, useState } from 'react';
import { loadSearch, type Search, type SearchResult } from '@bydtech/static-search';

let loading: Promise<Search> | undefined;

export function useStaticSearch(query: string): SearchResult[] {
  const [results, setResults] = useState<SearchResult[]>([]);
  useEffect(() => {
    if (!query.trim()) return setResults([]);
    let current = true;
    (loading ??= loadSearch('/search-index.json')).then((s) => current && setResults(s.query(query)));
    return () => void (current = false);
  }, [query]);
  return results;
}
```

Render a snippet with `highlight(result)`, which returns escaped HTML with `<mark>` around the matches.

## The `<static-search>` element

Renders a labeled search input and a list of result links, in the light DOM so your CSS applies. The index is fetched once, on first focus. Arrow keys move through results, Enter opens the first one, Escape clears.

| Attribute | Default | |
|---|---|---|
| `src` | `/search-index.json` | URL of the index |
| `placeholder` | `Search` | input placeholder |
| `label` | `Search this site` | accessible label (visually hidden) |
| `limit` | `8` | number of results |
| `empty-text` | `No results.` | shown when nothing matches |
| `unstyled` | off | do not add the default styles |

Its built-in styles have zero specificity, so any rule of yours wins. Or set these CSS variables: `--static-search-text`, `--static-search-muted`, `--static-search-bg`, `--static-search-border`, `--static-search-radius`, `--static-search-hover`, `--static-search-mark`. Class names: `static-search-label`, `static-search-status`, `static-search-results`, `static-search-title`, `static-search-section`, `static-search-snippet`.

After each search it fires a `results` event with `{ query, results }` in `detail`, and `el.run('text')` searches from code.

Without a bundler, the CLI's copy of `static-search.js` is all you need; it also exports `loadSearch`, `createSearch` and `highlight`. With a bundler, `import '@bydtech/static-search/element'`.

## CLI reference

```
static-search build <dir> [options]     index the HTML files in <dir>
static-search query <index> <words...>  try a query from the terminal
```

| Option | Default | |
|---|---|---|
| `-o, --out <file>` | `<dir>/search-index.json` | where to write the index |
| `--base-url <url>` | none | prefix every URL, such as `/docs` or `https://example.com` |
| `--exclude <glob>` | `404.html`, `500.html`, `404/index.html` | skip matching files; repeatable. A pattern without `/` matches a file name at any depth; `*` stays in one folder, `**` crosses folders |
| `--split <tags>` | `h2,h3` | headings that start a new section |
| `--max-chunk-length <chars>` | no limit | cut each section's stored text to about this length |
| `--clean-urls` / `--keep-extensions` | auto | link results to `/about` or to `/about.html`. By default the build follows the site's own links: if its pages link to each other with `.html`, results do too, so they work on any static server; otherwise `.html` is dropped, as Next.js, Astro and most hosts expect. `docs/index.html` is always `/docs/` |
| `--no-ui` | off | do not copy `static-search.js` next to the index |
| `-v, --verbose` | off | list skipped files |
| `-q, --quiet` | off | print only errors |
| `-n, --limit <n>` (query) | `5` | number of results |

The build prints the page and section counts and the index size, raw and gzipped. Above 300 kB gzipped it warns and suggests ways to shrink the index.

| Exit code | Meaning |
|---|---|
| `0` | Index written (or query run). |
| `1` | Nothing to index, the folder does not exist, or a file could not be read. |
| `2` | Usage error: unknown command or option, bad value. |

### What gets indexed

For each `.html` file (dot-folders and `node_modules` are skipped):

- **Content**: the first element with a `data-search-body` attribute, else the first `<main>`, else the first `<article>`, else `<body>`.
- **Left out**: `nav`, `header`, `footer`, `aside`, `script`, `style`, `noscript`, `template`, `svg`, `math`, `form`, `button`, `select`, `iframe`, `dialog`, and any element with `data-search-ignore` or `hidden`. Use `data-search-ignore` on "related posts", banners and other text that repeats across pages.
- **Skipped pages**: `<meta name="robots" content="noindex">` (or `none`), redirect pages (`<meta http-equiv="refresh" content="0; url=...">`), and pages with no text.
- **Sections**: the text is split at each `h2` and `h3`. A section links to the heading's `id`, or to an `id` inside the heading, or to the `id` of an element that wraps it (`<section id="setup"><h2>`). Text before the first heading is the page's introduction.
- **Title**: `<title>`, or the first `<h1>`. A suffix most titles share (`Install | Acme Docs`) is removed.

## API reference

### Browser and Node: `@bydtech/static-search`

| Export | What it does |
|---|---|
| `loadSearch(src?, options?)` | Fetches the index (default `/search-index.json`) and returns a `Search`. Rejects with a clear message on a 404. Options: everything `createSearch` takes, plus `fetch`. |
| `createSearch(data, options?)` | Builds a `Search` from index data you already have: parsed JSON, or the result of `buildIndex`. |
| `search.query(text, { limit?, perPage?, prefix? })` | Results, best first. Synchronous. |
| `search.pageCount`, `search.chunkCount` | Size of the index. |
| `highlight(result, tag?)` / `highlight(text, ranges, tag?)` | The snippet as escaped HTML with matches wrapped in `<mark>` (or `tag`). Safe for `innerHTML`. |
| `makeSnippet(text, isMatch, length?)` | The snippet logic on its own. |
| `fold`, `stem`, `words`, `ENGLISH_STOP_WORDS` | The text analysis, for custom pipelines. |

Each result is `{ url, pageUrl, title, section, snippet, highlights, score }`: `url` includes the `#anchor`, `highlights` are `[start, end)` ranges in `snippet`. All types are exported, with TSDoc.

### Build: `@bydtech/static-search/build` (Node)

| Export | What it does |
|---|---|
| `buildFromDirectory(dir, options?)` | What the CLI does. Returns `{ data, files, skipped, cleanUrls }`; save `data` with `JSON.stringify`. |
| `buildIndex(documents, options?)` | Index data from documents you already have (below). Works anywhere. |
| `extractHtml(html, options?)` | One page's `{ title, indexable, sections }`. |
| `splitMarkdown(md)`, `markdownToText(md)`, `slugify(heading)` | The Markdown helpers `buildIndex` uses. |
| `fileToUrl(file, options?)`, `prefersCleanUrls(pages)`, `globToRegExp(glob)` | URL and glob rules the CLI uses. |

### Markdown, JSON or a CMS

Give each document one of `text`, `markdown`, `html` or `sections`:

```js
import { writeFile } from 'node:fs/promises';
import { buildIndex } from '@bydtech/static-search/build';

const data = buildIndex([
  { url: '/docs/install', markdown: '# Install\n## With npm\nRun `npm install`.' }, // title from the # heading
  { url: '/pricing', title: 'Pricing', text: 'Free for open source.' },
  { url: '/faq', title: 'FAQ', sections: [{ heading: 'Refunds', anchor: 'refunds', text: 'Within 30 days.' }] },
]);
await writeFile('public/search-index.json', JSON.stringify(data));
```

Markdown is split at `##` and `###` with GitHub-style anchors (`## Reset your password` → `#reset-your-password`); front matter and markup are stripped. See [examples/markdown](examples/markdown).

## Configuration

Search options, for `loadSearch` and `createSearch`:

| Option | Default | |
|---|---|---|
| `weights` | `{ title: 3, section: 2, body: 1 }` | how much a match in the page title, section heading and text counts |
| `limit` | `10` | results per query |
| `perPage` | `2` | at most this many sections from one page, so one long page cannot fill the list |
| `prefix` | `true` | while the last word is being typed (no trailing space), match words that start with it |
| `stopWords` | `ENGLISH_STOP_WORDS` (69 words) | words ignored in pages and queries; `[]` keeps all |
| `stem` | `true` | strip common English suffixes; turn off for other languages |
| `snippetLength` | `160` | approximate snippet length in characters |
| `k1`, `b` | `1.2`, `0.75` | BM25 parameters |

Build options (`buildFromDirectory`, `buildIndex`, `extractHtml`): `splitOn` (`['h2', 'h3']`), `ignore` (the element list above), `maxChunkLength`, and for folders `baseUrl`, `exclude`, `cleanUrls` (`'auto'`), `stripTitleSuffix` (`true`).

All text analysis runs in the browser when the index loads, so changing search options never needs a rebuild.

## How it compares

Checked on 2026-10-21. Sizes are the main import bundled with esbuild `--minify` and compressed with `gzip -9`, measured the same way for every library (the projects' own figures differ slightly).

| | Indexes | Runtime (min+gzip) | Index in the browser |
|---|---|---|---|
| **@bydtech/static-search** 0.1.1 | built HTML, or your documents | 2.5 kB (4.3 kB with the element) | one JSON file, loaded whole |
| [Pagefind](https://pagefind.app) 1.5.2 | built HTML | not measured | split into fragments, loaded per query |
| [MiniSearch](https://github.com/lucaong/minisearch) 7.2.0 | your documents | 5.9 kB | you load and add documents |
| [Lunr](https://lunrjs.com) 2.3.9 | your documents | 8.9 kB | prebuilt index or documents |
| [Fuse.js](https://www.fusejs.io) 7.5.0 | your list of items | 9.6 kB | the items themselves |
| [FlexSearch](https://github.com/nextapps-de/flexsearch) 0.8.212 | your documents | 17.2 kB (`Document`); 4.5 kB light build per its docs | you add documents, or import an export |

- **Pagefind** is the closest tool and the better one for large sites. It also indexes your build output, but its index is split into fragments so the browser downloads only what a query needs: its site says a 10,000-page site searches with under 300 kB of total transfer. It handles many languages without setup, has filters, metadata and a full search UI, and runs a Rust binary at build time (installed through npm). Pick it past a few hundred pages, for multilingual sites, or when you need filters. This package is smaller in scope: pure JavaScript with no binary, one readable JSON file, a synchronous `query()` that returns plain objects, and an API for indexing Markdown or CMS content as well as HTML. The trade-off is that the whole index loads on the first search.
- **MiniSearch** is a well-made in-memory engine: BM25+, fuzzy and prefix search, field boosts, auto-suggest, adding and removing documents, and `toJSON`/`loadJSON`. Pick it for typo tolerance or documents that change in the page. It does not read HTML, split pages into sections or make snippets; that is the part this package adds.
- **Lunr** offers a query language (wildcards, fuzzy terms, field scoping, boosts), a full Porter stemmer and other languages through the separate lunr-languages package. Its last release was in August 2020.
- **Fuse.js** does fuzzy (approximate) matching, comparing the query with each item. It is the right tool for a command palette or a list of names or titles, where typos matter, rather than for the full text of long pages.
- **FlexSearch** aims at raw speed and scale, with many language encoders, contextual scoring, workers and persistent storage. Pick it for large in-memory datasets. Its API has more to learn, and it does not read HTML.

Where this package is simpler: one command from a built site to working search, sections with anchors so results deep-link, snippets with highlight ranges, a cap on results per page, and a drop-in element. Where it is weaker: no typo tolerance, English-only stemming, no filters, no phrase queries, and the full index downloads on first use.

## How it works, and its limits

- **Build.** The CLI walks the folder, reads each `.html` file with a small tag scanner (no DOM, no dependency), keeps the text of the content region and splits it at headings. The index is plain JSON: `{ version: 1, pages: [{ url, title }], chunks: [{ page, anchor?, section?, text }] }`.
- **Load.** The browser downloads the whole file once, then breaks the text into words: lowercase, accents removed ("Café" matches "cafe"), stop words dropped, and a light English suffix stripper so "resetting", "resets" and "reset" meet. On a 120-page, 1,434-section site (664 kB raw, 190 kB gzipped) this took about 30 ms in Node on an Apple M3, and a query about 0.5 ms; expect slower phones to take several times longer to load.
- **Ranking.** BM25F over each section: the page title, section heading and text are each normalized by their own length, then weighted 3, 2 and 1, so a short section cannot win on the page title alone. When only the title matches, the page's first section comes first. For the last word of a query that is still being typed, words that start with it count too (slightly less than an exact match). Sections that match more of the query's words rank higher. At most 2 sections per page are returned, so a long page cannot crowd out the one that answers.
- **Size.** The index is roughly the size of your site's text: on the 120-page site above it came to about 1.6 kB gzipped per page. The build warns above 300 kB gzipped. To shrink it, exclude pages (`--exclude 'tags/**'`), mark repeated blocks with `data-search-ignore`, or cut sections with `--max-chunk-length`. Past a few hundred pages, use a fragmented index such as Pagefind.
- **Language.** Words are split on anything that is not a letter, digit or mark, so languages written without spaces (Chinese, Japanese, Thai) are indexed as long runs and match poorly. The suffix stripper is English only; it does not know irregular forms ("ran", "mice"). For other languages set `stem: false` and your own `stopWords`.
- **Queries.** Words are matched exactly (after the steps above), or as a prefix for the last word. There is no typo tolerance, no phrase or boolean syntax, and no filtering.
- **HTML.** The scanner copes with unclosed tags, comments and unquoted attributes, but it is not a full HTML5 parser, and it does not see text that JavaScript adds at runtime: index what the server sends.
- **No runtime dependencies.** The build uses Node's `fs`, `path`, `zlib` (for the size report) and `util.parseArgs`. The browser code uses `fetch` and, for the element, the Custom Elements API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

Maintained by [BYD Tech](https://bydtech.in), a software studio that builds MVPs, AI agents, and web & mobile apps.
