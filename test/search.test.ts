import { describe, expect, it, vi } from 'vitest';
import { buildIndex } from '../src/build.js';
import { createSearch, highlight, loadSearch, type SearchIndexData } from '../src/index.js';

const site: SearchIndexData = buildIndex([
  { url: '/account', title: 'Reset your password', sections: [{ text: 'Open settings and choose a new one. It takes a minute.' }] },
  {
    url: '/guide',
    title: 'Long guide',
    sections: [
      { heading: 'Intro', anchor: 'intro', text: 'This guide covers the password policy in depth.' },
      { heading: 'Rules', anchor: 'rules', text: 'A password must be long. Password managers help with every password.' },
      { heading: 'Rotation', anchor: 'rotation', text: 'Rotate the password yearly. Password history is kept.' },
      { heading: 'Storage', anchor: 'storage', text: 'Each password is hashed. A password is never logged.' },
    ],
  },
  { url: '/billing', title: 'Billing', sections: [{ heading: 'Invoices', anchor: 'invoices', text: 'Download invoices as PDF files from the billing page.' }] },
  { url: '/cafe', title: 'Café menu', text: 'Espresso, naïve latte art and pastries.' },
]);

describe('createSearch', () => {
  const search = createSearch(site);

  it('counts pages and sections', () => {
    expect(search.pageCount).toBe(4);
    expect(search.chunkCount).toBe(7);
  });

  it('ranks a title match above body matches', () => {
    expect(search.query('password')[0]!.url).toBe('/account');
  });

  it('caps results per page (default 2)', () => {
    const results = search.query('password');
    expect(results.filter((r) => r.pageUrl === '/guide')).toHaveLength(2);
    expect(search.query('password', { perPage: 4 }).filter((r) => r.pageUrl === '/guide')).toHaveLength(4);
  });

  it('does not let a short section win on the page title alone', () => {
    const data = buildIndex([
      {
        url: '/rejections',
        title: 'App store rejection reasons',
        sections: [
          { text: 'Why apps get turned down in review, and how to fix each reason before you submit again.' },
          { heading: 'Sources', anchor: 'sources', text: 'Official guidelines.' },
        ],
      },
    ]);
    expect(createSearch(data).query('app store rejection')[0]!.url).toBe('/rejections');
  });

  it('links to the section anchor', () => {
    const r = search.query('invoices pdf')[0]!;
    expect(r).toMatchObject({ url: '/billing#invoices', pageUrl: '/billing', title: 'Billing', section: 'Invoices' });
  });

  it('matches the last word as a prefix while typing', () => {
    expect(search.query('invo')[0]?.url).toBe('/billing#invoices');
    expect(search.query('invo ')).toEqual([]);
    expect(search.query('invo', { prefix: false })).toEqual([]);
  });

  it('prefers sections that match more of the query', () => {
    expect(search.query('password hashed')[0]!.url).toBe('/guide#storage');
  });

  it('matches across accents and plural forms', () => {
    expect(search.query('cafe naive')[0]!.url).toBe('/cafe');
    expect(search.query('invoice')[0]!.url).toBe('/billing#invoices');
  });

  it('ignores stop words, and returns nothing for a query of only stop words', () => {
    expect(search.query('the and of ')).toEqual([]);
    expect(search.query('how do I reset the password')[0]!.url).toBe('/account');
  });

  it('respects limit', () => {
    expect(search.query('password', { limit: 1 })).toHaveLength(1);
  });

  it('highlights the matching words in the snippet', () => {
    const r = search.query('invoices pdf')[0]!;
    const marked = r.highlights.map(([s, e]) => r.snippet.slice(s, e));
    expect(marked).toEqual(['invoices', 'PDF']);
    expect(highlight(r)).toBe('Download <mark>invoices</mark> as <mark>PDF</mark> files from the billing page.');
  });

  it('highlights prefix matches too', () => {
    const r = search.query('pastr')[0]!;
    expect(r.highlights.map(([s, e]) => r.snippet.slice(s, e))).toEqual(['pastries']);
  });

  it('takes the snippet from around the matches in long text', () => {
    const long = buildIndex([{ url: '/l', title: 'L', text: `${'filler words here. '.repeat(40)}the needle is here. ${'more filler text. '.repeat(40)}` }]);
    const r = createSearch(long).query('needle')[0]!;
    expect(r.snippet.startsWith('…')).toBe(true);
    expect(r.snippet.endsWith('…')).toBe(true);
    expect(r.snippet.length).toBeLessThanOrEqual(162);
    expect(r.highlights.map(([s, e]) => r.snippet.slice(s, e))).toEqual(['needle']);
  });

  it('accepts other weights, stop words and no stemming', () => {
    const bodyFirst = createSearch(site, { weights: { title: 0 } });
    expect(bodyFirst.query('password')[0]!.pageUrl).toBe('/guide');
    expect(createSearch(site, { stopWords: [] }).query('the', { prefix: false }).length).toBeGreaterThan(0);
    expect(createSearch(site, { stem: false }).query('invoice', { prefix: false })).toEqual([]);
  });

  it('survives a JSON round trip', () => {
    const copy = JSON.parse(JSON.stringify(site)) as SearchIndexData;
    expect(createSearch(copy).query('password reset')).toEqual(search.query('password reset'));
  });

  it('refuses data that is not an index', () => {
    expect(() => createSearch({ version: 2 } as never)).toThrow(/version 1/);
  });
});

describe('highlight', () => {
  it('escapes HTML and accepts a custom tag', () => {
    expect(highlight('<b>a</b> & b', [[3, 4]], 'em')).toBe('&lt;b&gt;<em>a</em>&lt;/b&gt; &amp; b');
    expect(() => highlight('x', [], 'img onerror=1')).toThrow(/invalid tag/);
  });
});

describe('loadSearch', () => {
  it('fetches the index (default /search-index.json)', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(site)));
    const search = await loadSearch(undefined, { fetch });
    expect(fetch).toHaveBeenCalledWith('/search-index.json');
    expect(search.query('billing')[0]!.pageUrl).toBe('/billing');
  });

  it('explains a missing index', async () => {
    const fetch = async () => new Response('nope', { status: 404 });
    await expect(loadSearch('/x.json', { fetch })).rejects.toThrow(/HTTP 404.*static-search build/);
  });
});
