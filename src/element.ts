/*
 * <static-search>: a search box with results, for sites that want search
 * without writing any JavaScript. It renders plain light-DOM markup (so your
 * CSS reaches it), loads the index on first use, and is keyboard friendly.
 *
 *   <static-search src="/search-index.json"></static-search>
 *
 * Attributes: src, placeholder, label, limit, empty-text, unstyled.
 * Styling: CSS variables listed in STYLE, or your own CSS (its specificity is zero).
 */
import { loadSearch, type Search } from './search.js';
import type { SearchResult } from './types.js';

const STYLE = `
:where(static-search){display:block;color:var(--static-search-text,inherit)}
:where(static-search input){box-sizing:border-box;width:100%;font:inherit;color:inherit;padding:.5em .75em;background:var(--static-search-bg,transparent);border:1px solid var(--static-search-border,#8889);border-radius:var(--static-search-radius,6px)}
:where(static-search .static-search-label){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
:where(static-search .static-search-status){margin:.5em 0 0;font-size:.875em;color:var(--static-search-muted,inherit)}
:where(static-search .static-search-status:empty){display:none}
:where(static-search .static-search-results){list-style:none;margin:.5em 0 0;padding:0}
:where(static-search .static-search-results:empty){display:none}
:where(static-search .static-search-results a){display:block;padding:.5em .75em;color:inherit;text-decoration:none;border-radius:var(--static-search-radius,6px)}
:where(static-search .static-search-results a:hover,static-search .static-search-results a:focus-visible){background:var(--static-search-hover,#8882)}
:where(static-search .static-search-title){display:block;font-weight:600}
:where(static-search .static-search-section){display:block;font-size:.875em;color:var(--static-search-muted,inherit)}
:where(static-search .static-search-snippet){display:block;font-size:.875em;margin-top:.25em}
:where(static-search mark){background:var(--static-search-mark,#fc05);color:inherit;border-radius:2px}
`;

const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;
let uid = 0;

/** Detail of the `results` event the element fires after each search. */
export interface ResultsEventDetail {
  query: string;
  results: SearchResult[];
}

/**
 * The `<static-search>` element. Importing this module registers it; you only
 * need the class to subclass it.
 *
 * Fires `results` (a `CustomEvent<ResultsEventDetail>`) after each search.
 */
export class StaticSearchElement extends Base {
  private loading?: Promise<Search>;
  private input?: HTMLInputElement;
  private status?: HTMLElement;
  private list?: HTMLUListElement;

  connectedCallback(): void {
    if (this.input) return;
    if (!this.hasAttribute('unstyled') && !document.querySelector('style[data-static-search]')) {
      const style = document.createElement('style');
      style.setAttribute('data-static-search', '');
      style.textContent = STYLE;
      document.head.append(style);
    }
    const id = `static-search-${++uid}`;
    const label = document.createElement('label');
    label.className = 'static-search-label';
    label.htmlFor = `${id}-input`;
    label.textContent = this.getAttribute('label') || 'Search this site';
    const input = document.createElement('input');
    input.type = 'search';
    input.id = `${id}-input`;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = this.getAttribute('placeholder') ?? 'Search';
    input.setAttribute('aria-controls', `${id}-results`);
    const status = document.createElement('p');
    status.className = 'static-search-status';
    status.setAttribute('role', 'status');
    const list = document.createElement('ul');
    list.className = 'static-search-results';
    list.id = `${id}-results`;
    list.setAttribute('aria-label', 'Search results');
    this.append(label, input, status, list);
    Object.assign(this, { input, status, list });

    input.addEventListener('focus', () => void this.load().catch(() => {}), { once: true });
    input.addEventListener('input', () => void this.run());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') this.focusResult(0, e);
      else if (e.key === 'Enter') {
        const first = list.querySelector('a');
        if (first) {
          e.preventDefault();
          first.click();
        }
      } else if (e.key === 'Escape') this.clear();
    });
    list.addEventListener('keydown', (e) => {
      const links = [...list.querySelectorAll('a')];
      const at = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (e.key === 'ArrowDown') this.focusResult(at + 1, e);
      else if (e.key === 'ArrowUp') at <= 0 ? (e.preventDefault(), input.focus()) : this.focusResult(at - 1, e);
      else if (e.key === 'Escape') {
        this.clear();
        input.focus();
      }
    });
  }

  /** The loaded index (fetched once, on first focus or input). */
  load(): Promise<Search> {
    return (this.loading ??= loadSearch(this.getAttribute('src') || '/search-index.json'));
  }

  /** Search for `text` as if it had been typed. */
  async run(text?: string): Promise<SearchResult[]> {
    const input = this.input!;
    if (text !== undefined) input.value = text;
    const q = input.value;
    if (!q.trim()) {
      this.render(q, []);
      return [];
    }
    let search: Search;
    try {
      search = await this.load();
    } catch (err) {
      this.status!.textContent = 'Search is unavailable right now.';
      console.error(err);
      return [];
    }
    if (input.value !== q) return [];
    const limit = Number(this.getAttribute('limit')) || 8;
    const results = search.query(q, { limit });
    this.render(q, results);
    return results;
  }

  private clear(): void {
    this.input!.value = '';
    this.render('', []);
  }

  private focusResult(i: number, e: KeyboardEvent): void {
    const links = this.list!.querySelectorAll('a');
    const link = links[Math.min(i, links.length - 1)];
    if (link) {
      e.preventDefault();
      link.focus();
    }
  }

  private render(query: string, results: SearchResult[]): void {
    const list = this.list!;
    list.replaceChildren(
      ...results.map((r) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = r.url;
        a.append(span('static-search-title', r.title));
        if (r.section) a.append(span('static-search-section', r.section));
        const snippet = span('static-search-snippet', '');
        let at = 0;
        for (const [s, e] of r.highlights) {
          const mark = document.createElement('mark');
          mark.textContent = r.snippet.slice(s, e);
          snippet.append(r.snippet.slice(at, s), mark);
          at = e;
        }
        snippet.append(r.snippet.slice(at));
        a.append(snippet);
        li.append(a);
        return li;
      }),
    );
    this.status!.textContent = !query.trim()
      ? ''
      : results.length
        ? `${results.length} result${results.length === 1 ? '' : 's'}`
        : this.getAttribute('empty-text') || 'No results.';
    this.dispatchEvent(new CustomEvent<ResultsEventDetail>('results', { detail: { query, results } }));
  }
}

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

/** Register the element under another tag name (it is registered as `static-search` on import). */
export function defineStaticSearch(name = 'static-search'): void {
  if (typeof customElements === 'undefined' || customElements.get(name)) return;
  customElements.define(name, name === 'static-search' ? StaticSearchElement : class extends StaticSearchElement {});
}

defineStaticSearch();

declare global {
  interface HTMLElementTagNameMap {
    'static-search': StaticSearchElement;
  }
}
