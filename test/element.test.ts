// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIndex } from '../src/build.js';
import '../src/element.js';
import type { StaticSearchElement } from '../src/element.js';

const index = buildIndex([
  { url: '/billing', title: 'Billing', sections: [{ heading: 'Invoices', anchor: 'invoices', text: 'Download invoices as PDF.' }] },
  { url: '/account', title: 'Account', text: 'Change your email address.' },
]);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify(index)));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function mount(attrs = ''): StaticSearchElement {
  document.body.innerHTML = `<static-search ${attrs}></static-search>`;
  return document.querySelector('static-search')!;
}

async function type(el: StaticSearchElement, text: string) {
  const input = el.querySelector('input')!;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await vi.waitFor(() => expect(el.querySelector('.static-search-status')!.textContent).not.toBe(''));
}

describe('<static-search>', () => {
  it('is registered and renders a labeled search input', () => {
    const el = mount('placeholder="Find docs" label="Search the docs"');
    expect(customElements.get('static-search')).toBeDefined();
    const input = el.querySelector('input')!;
    expect(input.type).toBe('search');
    expect(input.placeholder).toBe('Find docs');
    expect(el.querySelector(`label[for="${input.id}"]`)!.textContent).toBe('Search the docs');
    expect(document.querySelector('style[data-static-search]')).not.toBeNull();
  });

  it('loads the index lazily from src and shows highlighted results', async () => {
    const el = mount('src="/assets/idx.json"');
    expect(fetchMock).not.toHaveBeenCalled();
    await type(el, 'invoices');
    expect(fetchMock).toHaveBeenCalledWith('/assets/idx.json');
    const links = el.querySelectorAll('.static-search-results a');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('/billing#invoices');
    expect(links[0]!.querySelector('.static-search-title')!.textContent).toBe('Billing');
    expect(links[0]!.querySelector('.static-search-section')!.textContent).toBe('Invoices');
    expect(links[0]!.querySelector('mark')!.textContent).toBe('invoices');
    expect(el.querySelector('.static-search-status')!.textContent).toBe('1 result');
  });

  it('fetches /search-index.json by default, once', async () => {
    const el = mount();
    await type(el, 'invoices');
    await type(el, 'email');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/search-index.json');
  });

  it('says when nothing matches, with configurable text', async () => {
    const el = mount('empty-text="Nothing found."');
    await type(el, 'zebra');
    expect(el.querySelectorAll('.static-search-results li')).toHaveLength(0);
    expect(el.querySelector('.static-search-status')!.textContent).toBe('Nothing found.');
  });

  it('fires a results event', async () => {
    const el = mount();
    const seen: unknown[] = [];
    el.addEventListener('results', (e) => seen.push((e as CustomEvent).detail));
    await type(el, 'email');
    expect(seen).toEqual([{ query: 'email', results: [expect.objectContaining({ url: '/account' })] }]);
  });

  it('moves focus with the arrow keys and clears with Escape', async () => {
    const el = mount();
    await type(el, 'invoices');
    const input = el.querySelector('input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(el.querySelector('.static-search-results a'));
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    expect(el.querySelectorAll('.static-search-results li')).toHaveLength(0);
    expect(document.activeElement).toBe(input);
  });

  it('reports a missing index instead of failing silently', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 404 }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount();
    await type(el, 'invoices');
    expect(el.querySelector('.static-search-status')!.textContent).toBe('Search is unavailable right now.');
    expect(spy).toHaveBeenCalled();
  });

  it('can run a search from code, and skips its styles when unstyled', async () => {
    document.head.innerHTML = '';
    const el = mount('unstyled');
    expect(document.querySelector('style[data-static-search]')).toBeNull();
    const results = await el.run('email');
    expect(results.map((r) => r.url)).toEqual(['/account']);
  });
});
