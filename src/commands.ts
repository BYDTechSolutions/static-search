import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { buildFromDirectory } from './build.js';
import { createSearch } from './search.js';
import type { SearchIndexData } from './types.js';
import { VERSION } from './version.js';

/** Where the CLI writes; tests pass their own. */
export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
  /** The browser script copied next to the index. Default: `static-search.js` beside this file. */
  uiScript?: string;
}

/** Above this gzipped size, the build suggests ways to shrink the index. */
export const LARGE_INDEX_BYTES = 300 * 1024;

const HELP = `static-search ${VERSION}: full-text search for static sites

Usage:
  static-search build <dir> [options]     index the HTML files in <dir>
  static-search query <index> <words...>  try a query from the terminal

Build options:
  -o, --out <file>             where to write the index (default: <dir>/search-index.json)
  --base-url <url>             prefix for every URL, e.g. /docs or https://example.com
  --exclude <glob>             skip matching files; repeatable (default: 404.html, 500.html)
  --split <tags>               headings that start a section (default: h2,h3)
  --max-chunk-length <chars>   cut each section's text to about this length
  --clean-urls                 link to /about, not /about.html
  --keep-extensions            link to /about.html, not /about
                               (default: whichever form the site's own links use)
  --no-ui                      do not copy static-search.js next to the index
  -v, --verbose                list skipped files
  -q, --quiet                  print nothing but errors

Query options:
  -n, --limit <n>              number of results (default: 5)

  -h, --help                   show this help
  --version                    show the version

Exit codes: 0 done, 1 nothing indexed or a file could not be read, 2 usage error.`;

const kb = (n: number): string => `${(n / 1024).toFixed(1)} kB`;
/** A path as the user would type it: relative to the working folder when inside it. */
const show = (p: string): string => {
  const r = relative(process.cwd(), p);
  return !r ? '.' : r.startsWith('..') ? p : r;
};

class UsageError extends Error {}

/** Run the CLI with `argv` (without `node` and the script). Returns the exit code. */
export async function main(argv: string[], io: Io = { out: console.log, err: console.error }): Promise<number> {
  try {
    const [command, ...rest] = argv;
    if (!command || command === '-h' || command === '--help' || command === 'help') {
      io.out(HELP);
      return command ? 0 : 2;
    }
    if (command === '--version' || command === '-V') {
      io.out(VERSION);
      return 0;
    }
    if (command === 'build') return await build(rest, io);
    if (command === 'query') return await query(rest, io);
    throw new UsageError(`unknown command "${command}"`);
  } catch (err) {
    if (err instanceof UsageError || (err as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      io.err(`static-search: ${(err as Error).message}\nRun "static-search --help" for usage.`);
      return 2;
    }
    io.err(`static-search: ${(err as Error).message}`);
    return 1;
  }
}

async function build(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      'base-url': { type: 'string' },
      exclude: { type: 'string', multiple: true },
      split: { type: 'string' },
      'max-chunk-length': { type: 'string' },
      'keep-extensions': { type: 'boolean' },
      'clean-urls': { type: 'boolean' },
      'no-ui': { type: 'boolean' },
      verbose: { type: 'boolean', short: 'v' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    io.out(HELP);
    return 0;
  }
  if (positionals.length !== 1) throw new UsageError('build needs exactly one folder, e.g. "static-search build dist"');
  const dir = resolve(positionals[0]!);
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) {
    io.err(`static-search: ${positionals[0]} is not a folder. Build your site first, then point this at its output (out/, dist/, public/...).`);
    return 1;
  }
  let maxChunkLength: number | undefined;
  if (values['max-chunk-length'] !== undefined) {
    maxChunkLength = Number(values['max-chunk-length']);
    if (!Number.isInteger(maxChunkLength) || maxChunkLength < 50) throw new UsageError('--max-chunk-length must be a whole number of at least 50');
  }
  const splitOn = values.split?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (splitOn && !splitOn.every((s) => /^h[1-6]$/.test(s))) throw new UsageError('--split takes heading tags, e.g. h2,h3');

  const log = values.quiet ? () => {} : io.out;
  if (values['keep-extensions'] && values['clean-urls']) throw new UsageError('use --clean-urls or --keep-extensions, not both');
  const { data, files, skipped, cleanUrls } = await buildFromDirectory(dir, {
    ...(values['base-url'] ? { baseUrl: values['base-url'] } : {}),
    ...(values.exclude ? { exclude: values.exclude } : {}),
    ...(splitOn ? { splitOn } : {}),
    ...(maxChunkLength ? { maxChunkLength } : {}),
    cleanUrls: values['keep-extensions'] ? false : values['clean-urls'] ? true : 'auto',
  });
  const shown = show(dir);
  if (!data.pages.length) {
    io.err(
      `static-search: no pages to index in ${shown} (${files.length} HTML file${files.length === 1 ? '' : 's'} read, ${skipped.length} skipped).` +
        (files.length ? ' Check that pages have text inside <main>, <article> or <body>, and are not marked noindex.' : ' Is this the built output folder?'),
    );
    return 1;
  }

  const out = resolve(values.out ?? join(dir, 'search-index.json'));
  const json = JSON.stringify(data);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, json);
  const raw = Buffer.byteLength(json);
  const gz = gzipSync(json).length;
  log(`static-search: indexed ${data.pages.length} pages, ${data.chunks.length} sections from ${shown}`);
  log(`  wrote ${show(out)} (${kb(raw)}, ${kb(gz)} gzipped)`);
  log(`  URLs look like ${data.pages.find((p) => !p.url.endsWith('/'))?.url ?? data.pages[0]!.url}${cleanUrls ? '' : ' (kept .html to match the site links)'}`);

  if (!values['no-ui']) {
    const script = io.uiScript ?? fileURLToPath(new URL('./static-search.js', import.meta.url));
    const target = join(dirname(out), 'static-search.js');
    try {
      await copyFile(script, target);
      log(`  wrote ${show(target)}: add <script type="module" src="/static-search.js"></script> and <static-search></static-search> to a page`);
    } catch {
      io.err(`static-search: could not copy the browser script from ${script}; the index was written.`);
    }
  }

  if (skipped.length) {
    const by = (r: string) => skipped.filter((s) => s.reason === r).length;
    const parts = (['excluded', 'noindex', 'empty'] as const).filter(by).map((r) => `${by(r)} ${r}`);
    log(`  skipped ${skipped.length} file${skipped.length === 1 ? '' : 's'}: ${parts.join(', ')}${values.verbose ? '' : ' (--verbose lists them)'}`);
    if (values.verbose) for (const s of skipped) log(`    ${s.file} (${s.reason})`);
  }
  if (gz > LARGE_INDEX_BYTES) {
    io.err(
      `static-search: warning: the index is ${kb(gz)} gzipped, and visitors download all of it on their first search. To shrink it:\n` +
        `  - skip pages nobody searches for: --exclude 'tags/**' --exclude 'page/*/**'\n` +
        `  - mark repeated blocks (related posts, banners) with data-search-ignore\n` +
        `  - cap each section's text: --max-chunk-length 1000\n` +
        `  For sites with thousands of pages, a tool that loads only part of its index per query (such as Pagefind) fits better.`,
    );
  }
  return 0;
}

async function query(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { limit: { type: 'string', short: 'n' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) {
    io.out(HELP);
    return 0;
  }
  const [file, ...words] = positionals;
  if (!file || !words.length) throw new UsageError('query needs an index file and some words, e.g. "static-search query dist/search-index.json reset password"');
  const limit = values.limit === undefined ? 5 : Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new UsageError('--limit must be a positive whole number');
  const data = JSON.parse(await readFile(file, 'utf8')) as SearchIndexData;
  // A complete query from the terminal: no prefix matching on the last word.
  const results = createSearch(data).query(words.join(' '), { limit, prefix: false });
  if (!results.length) io.out('No results.');
  results.forEach((r, i) => {
    io.out(`${i + 1}. ${r.title}${r.section ? ` > ${r.section}` : ''}  (${r.score.toFixed(2)})`);
    io.out(`   ${r.url}`);
    io.out(`   ${r.snippet}`);
  });
  return 0;
}
