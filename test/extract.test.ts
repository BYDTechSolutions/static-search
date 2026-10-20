import { describe, expect, it } from 'vitest';
import { extractHtml } from '../src/build.js';

const page = (body: string, head = '<title>Docs</title>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe('extractHtml', () => {
  it('prefers <main> over the rest of the body', () => {
    const p = extractHtml(page('<div>Sidebar promo</div><main><p>Install the tool.</p></main><div>Cookie banner</div>'));
    expect(p.sections).toEqual([{ heading: '', text: 'Install the tool.' }]);
  });

  it('falls back to <article>, then <body>', () => {
    expect(extractHtml(page('<div>Promo</div><article>The story.</article>')).sections[0]!.text).toBe('The story.');
    expect(extractHtml(page('<p>Just a body.</p>')).sections[0]!.text).toBe('Just a body.');
  });

  it('lets data-search-body choose the region', () => {
    const p = extractHtml(page('<main><div>Chrome</div><div data-search-body>Real content</div></main>'));
    expect(p.sections[0]!.text).toBe('Real content');
  });

  it('drops navigation, headers, footers, scripts and styles', () => {
    const p = extractHtml(
      page(
        '<header>Site name</header><nav><a href="/">Home</a></nav><main><p>Kept text.</p><script>var secret = 1;</script><style>.a{}</style><footer>Footer links</footer></main>',
      ),
    );
    expect(p.sections.map((s) => s.text).join(' ')).toBe('Kept text.');
  });

  it('respects data-search-ignore and hidden', () => {
    const p = extractHtml(page('<main><p>Keep.</p><div data-search-ignore><p>Related posts <b>here</b></p></div><p hidden>Hidden.</p><p>Also keep.</p></main>'));
    expect(p.sections[0]!.text).toBe('Keep. Also keep.');
  });

  it('marks noindex pages and redirects as not indexable', () => {
    expect(extractHtml(page('<main>x</main>', '<meta name="robots" content="noindex, follow">')).indexable).toBe(false);
    expect(extractHtml(page('<main>x</main>', '<meta name="ROBOTS" content="none">')).indexable).toBe(false);
    expect(extractHtml(page('<main>x</main>', '<meta http-equiv="refresh" content="0; url=/new">')).indexable).toBe(false);
    expect(extractHtml(page('<main>x</main>', '<meta name="robots" content="index">')).indexable).toBe(true);
  });

  it('splits at h2 and h3, keeping anchors', () => {
    const p = extractHtml(
      page(`<main>
        <h1>Guide</h1><p>Intro.</p>
        <h2 id="install">Install</h2><p>Run npm.</p>
        <section id="config"><h2>Configure</h2><p>Edit the file.</p></section>
        <h3><a id="env"></a>Environment</h3><p>Set the vars.</p>
        <h3>No anchor</h3><p>Plain.</p>
        <h4 id="deep">Deep</h4><p>Stays in the h3 section.</p>
      </main>`),
    );
    expect(p.sections).toEqual([
      { heading: '', text: 'Guide Intro.' },
      { heading: 'Install', anchor: 'install', text: 'Run npm.' },
      { heading: 'Configure', anchor: 'config', text: 'Edit the file.' },
      { heading: 'Environment', anchor: 'env', text: 'Set the vars.' },
      { heading: 'No anchor', text: 'Plain. Deep Stays in the h3 section.' },
    ]);
  });

  it('honors splitOn', () => {
    const p = extractHtml(page('<main><h2 id="a">A</h2><p>1</p><h3 id="b">B</h3><p>2</p></main>'), { splitOn: ['h2'] });
    expect(p.sections).toEqual([{ heading: 'A', anchor: 'a', text: '1 B 2' }]);
  });

  it('decodes entities and keeps inline text together', () => {
    const p = extractHtml(page('<main><p>Fish &amp; chips &mdash; caf&eacute; &#39;ok&#x27; <strong>bold</strong>ly</p></main>'));
    expect(p.sections[0]!.text).toBe("Fish & chips — café 'ok' boldly");
  });

  it('separates links laid out side by side', () => {
    const p = extractHtml(page('<main><a href="/p">Pricing</a><a href="/d">Docs</a>. <span>Label</span><span>Title</span></main>'));
    expect(p.sections[0]!.text).toBe('Pricing Docs. Label Title');
  });

  it('takes the title from <title>, else the first h1', () => {
    expect(extractHtml(page('<main>x</main>', '<title>Install &amp; setup</title>')).title).toBe('Install & setup');
    expect(extractHtml(page('<main><h1>Heading <em>one</em></h1>x</main>', '')).title).toBe('Heading one');
  });

  it('survives messy markup', () => {
    const p = extractHtml('<main><p>One<p>Two<!-- a comment <b> --><li>Three<br>Four<img src=x alt=y>Five</main>');
    expect(p.sections[0]!.text).toBe('One Two Three Four Five');
  });
});

describe('extractHtml introductions', () => {
  it('leaves out an introduction that is only the h1', () => {
    const p = extractHtml(page('<main><h1>About</h1><h2 id="team">Team</h2><p>Small.</p></main>'));
    expect(p.sections).toEqual([{ heading: 'Team', anchor: 'team', text: 'Small.' }]);
  });
});
