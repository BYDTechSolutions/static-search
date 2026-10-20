import { describe, expect, it } from 'vitest';
import { buildFromDirectory, fileToUrl, globToRegExp, stripCommonTitleSuffix } from '../src/build.js';
import { html, site } from './helpers.js';

describe('fileToUrl', () => {
  it('cleans URLs by default', () => {
    expect(fileToUrl('index.html')).toBe('/');
    expect(fileToUrl('docs/index.html')).toBe('/docs/');
    expect(fileToUrl('about.html')).toBe('/about');
    expect(fileToUrl('about.html', { cleanUrls: false })).toBe('/about.html');
    expect(fileToUrl('about.html', { baseUrl: 'https://example.com/docs/' })).toBe('https://example.com/docs/about');
  });
});

describe('globToRegExp', () => {
  it('matches names at any depth without a slash, and paths with one', () => {
    expect(globToRegExp('404.html').test('404.html')).toBe(true);
    expect(globToRegExp('404.html').test('fr/404.html')).toBe(true);
    expect(globToRegExp('tags/**').test('tags/a/index.html')).toBe(true);
    expect(globToRegExp('tags/**').test('blog/tags/a.html')).toBe(false);
    expect(globToRegExp('**/draft-*.html').test('blog/2026/draft-one.html')).toBe(true);
    expect(globToRegExp('page/*/index.html').test('page/2/index.html')).toBe(true);
    expect(globToRegExp('page/*/index.html').test('page/2/3/index.html')).toBe(false);
  });
});

describe('stripCommonTitleSuffix', () => {
  it('removes a suffix most titles share', () => {
    expect(stripCommonTitleSuffix(['Install | Acme', 'Config | Acme', 'Acme'])).toEqual(['Install', 'Config', 'Acme']);
    expect(stripCommonTitleSuffix(['A - one', 'B - two', 'C'])).toEqual(['A - one', 'B - two', 'C']);
  });
});

describe('buildFromDirectory', () => {
  it('indexes a folder of built pages', async () => {
    const dir = await site({
      'index.html': html('Home | Acme', '<p>Welcome to Acme.</p>'),
      'about.html': html('About | Acme', '<h2 id="team">Team</h2><p>We are small.</p>'),
      'docs/index.html': html('Docs | Acme', '<p>Start here.</p>'),
      'docs/private.html': html('Private | Acme', '<p>secret</p>', '<meta name="robots" content="noindex">'),
      'empty.html': html('Empty | Acme', '   '),
      '404.html': html('Not found | Acme', '<p>Nothing here.</p>'),
      'assets/app.js': 'console.log(1)',
      'node_modules/x/index.html': html('Dependency', 'no'),
    });
    const { data, files, skipped } = await buildFromDirectory(dir);
    expect(data.pages).toEqual([
      { url: '/about', title: 'About' },
      { url: '/docs/', title: 'Docs' },
      { url: '/', title: 'Home' },
    ]);
    expect(data.chunks).toContainEqual({ page: 0, anchor: 'team', section: 'Team', text: 'We are small.' });
    expect(files).toEqual(['about.html', 'docs/index.html', 'docs/private.html', 'empty.html', 'index.html']);
    expect(skipped).toEqual([
      { file: '404.html', reason: 'excluded' },
      { file: 'docs/private.html', reason: 'noindex' },
      { file: 'empty.html', reason: 'empty' },
    ]);
  });

  it('applies exclude, baseUrl and maxChunkLength', async () => {
    const dir = await site({
      'a.html': html('A', `<p>${'word '.repeat(100)}</p>`),
      'tags/x.html': html('Tag', '<p>tag page</p>'),
    });
    const { data } = await buildFromDirectory(dir, { exclude: ['tags/**'], baseUrl: '/docs', maxChunkLength: 60 });
    expect(data.pages).toEqual([{ url: '/docs/a', title: 'A' }]);
    expect(data.chunks[0]!.text.length).toBeLessThanOrEqual(60);
  });
});
