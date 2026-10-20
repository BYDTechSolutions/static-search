import { describe, expect, it } from 'vitest';
import { buildIndex, markdownToText, slugify, splitMarkdown } from '../src/build.js';

describe('Markdown', () => {
  it('slugs headings like GitHub', () => {
    expect(slugify('Reset your password!')).toBe('reset-your-password');
    expect(slugify('What’s new in 2.0?')).toBe('whats-new-in-20');
  });

  it('strips markup but keeps the words', () => {
    expect(markdownToText('**Bold** and _em_, a [link](https://x.dev), ![alt text](a.png) and `code`.')).toBe(
      'Bold and em, a link, alt text and code.',
    );
  });

  it('splits at ## and ### with unique anchors, skipping front matter and fenced code headings', () => {
    const md = [
      '---',
      'title: ignored',
      '---',
      '# Guide',
      'Intro text.',
      '## Setup',
      'Run it.',
      '```sh',
      '# not a heading',
      '```',
      '### Setup',
      'Again.',
      '#### Detail',
      'Deeper.',
    ].join('\n');
    expect(splitMarkdown(md)).toEqual({
      title: 'Guide',
      sections: [
        { heading: '', text: 'Intro text.' },
        { heading: 'Setup', anchor: 'setup', text: 'Run it. not a heading' },
        { heading: 'Setup', anchor: 'setup-1', text: 'Again. Detail Deeper.' },
      ],
    });
  });
});

describe('buildIndex', () => {
  it('accepts text, markdown, html and sections', () => {
    const data = buildIndex([
      { url: '/a', title: 'A', text: '  plain   text ' },
      { url: '/b', markdown: '# B title\n## One\nfirst' },
      { url: '/c', html: '<title>C</title><main><h2 id="x">X</h2>html text</main>' },
      { url: '/d', title: 'D', sections: [{ heading: 'S', anchor: 's', text: 'given' }] },
    ]);
    expect(data).toEqual({
      version: 1,
      pages: [
        { url: '/a', title: 'A' },
        { url: '/b', title: 'B title' },
        { url: '/c', title: 'C' },
        { url: '/d', title: 'D' },
      ],
      chunks: [
        { page: 0, text: 'plain text' },
        { page: 1, anchor: 'one', section: 'One', text: 'first' },
        { page: 2, anchor: 'x', section: 'X', text: 'html text' },
        { page: 3, anchor: 's', section: 'S', text: 'given' },
      ],
    });
  });

  it('skips noindex HTML and documents with no text', () => {
    const data = buildIndex([
      { url: '/hidden', html: '<meta name="robots" content="noindex"><main>secret</main>' },
      { url: '/empty', title: 'Empty', text: '   ' },
      { url: '/ok', title: 'OK', text: 'fine' },
    ]);
    expect(data.pages).toEqual([{ url: '/ok', title: 'OK' }]);
    expect(data.chunks).toEqual([{ page: 0, text: 'fine' }]);
  });

  it('cuts long sections at a word boundary with maxChunkLength', () => {
    const data = buildIndex([{ url: '/', title: 'T', text: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu' }], {
      maxChunkLength: 30,
    });
    expect(data.chunks[0]!.text).toBe('alpha beta gamma delta epsilon');
  });

  it('rejects a document without content', () => {
    expect(() => buildIndex([{ url: '/x' } as never])).toThrow(/no text, markdown, html or sections/);
  });
});
