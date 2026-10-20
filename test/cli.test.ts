import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LARGE_INDEX_BYTES, main } from '../src/commands.js';
import { VERSION } from '../src/version.js';
import { html, site } from './helpers.js';

async function run(argv: string[], uiScript?: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (l) => out.push(l), err: (l) => err.push(l), ...(uiScript ? { uiScript } : {}) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('cli', () => {
  it('keeps VERSION equal to package.json', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
    expect((await run(['--version'])).out).toBe(VERSION);
  });

  it('builds the index and copies the browser script (exit 0)', async () => {
    const dir = await site({ 'index.html': html('Home', '<h2 id="price">Pricing</h2><p>Plans and prices.</p>'), 'ui.js': '// ui' });
    const r = await run(['build', dir], join(dir, 'ui.js'));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/indexed 1 pages, 1 sections/);
    expect(r.out).toMatch(/gzipped/);
    const data = JSON.parse(await readFile(join(dir, 'search-index.json'), 'utf8'));
    expect(data.pages).toEqual([{ url: '/', title: 'Home' }]);
    expect(await readFile(join(dir, 'static-search.js'), 'utf8')).toBe('// ui');
  });

  it('writes elsewhere with --out, and skips the script with --no-ui', async () => {
    const dir = await site({ 'index.html': html('Home', '<p>Hello there.</p>') });
    const out = join(dir, 'nested', 'idx.json');
    const r = await run(['build', dir, '--out', out, '--no-ui', '--quiet']);
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect((await stat(out)).isFile()).toBe(true);
    await expect(stat(join(dir, 'nested', 'static-search.js'))).rejects.toThrow();
  });

  it('exits 1 when nothing can be indexed', async () => {
    const dir = await site({ 'index.html': html('Home', '<p>x</p>', '<meta name="robots" content="noindex">') });
    const r = await run(['build', dir, '--no-ui']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no pages to index/);
    expect((await run(['build', join(dir, 'missing')])).code).toBe(1);
  });

  it('exits 2 on usage errors', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['frobnicate'])).code).toBe(2);
    expect((await run(['build'])).code).toBe(2);
    expect((await run(['build', '.', '--bogus'])).code).toBe(2);
    expect((await run(['build', '.', '--max-chunk-length', 'ten'])).code).toBe(2);
    expect((await run(['build', '.', '--split', 'p'])).code).toBe(2);
    expect((await run(['query', 'index.json'])).code).toBe(2);
  });

  it('warns when the index is large', async () => {
    const words = Array.from({ length: 120_000 }, (_, i) => `w${(i * 7919) % 1_000_003}`).join(' ');
    const dir = await site({ 'index.html': html('Big', `<p>${words}</p>`) });
    const r = await run(['build', dir, '--no-ui']);
    expect(r.code).toBe(0);
    expect(LARGE_INDEX_BYTES).toBe(300 * 1024);
    expect(r.err).toMatch(/warning: the index is .* gzipped/);
  });

  it('runs a query from the terminal', async () => {
    const dir = await site({});
    const file = join(dir, 'idx.json');
    await writeFile(
      file,
      JSON.stringify({ version: 1, pages: [{ url: '/billing', title: 'Billing' }], chunks: [{ page: 0, anchor: 'inv', section: 'Invoices', text: 'Download invoices.' }] }),
    );
    const r = await run(['query', file, 'invoices']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/1\. Billing > Invoices/);
    expect(r.out).toMatch(/\/billing#inv/);
    expect((await run(['query', file, 'nothing'])).out).toBe('No results.');
  });
});

describe('element module outside a browser', () => {
  it('can be imported in Node without a DOM', async () => {
    const mod = await import('../src/element.js');
    expect(typeof mod.defineStaticSearch).toBe('function');
  });
});
