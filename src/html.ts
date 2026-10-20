/*
 * Reads the searchable text out of a built HTML page, without a DOM or any
 * dependency: a small tag scanner that is tolerant of real-world markup
 * (unclosed <p> and <li>, attributes without quotes, comments, CDATA).
 * It is not a full HTML5 parser; it only needs to tell text from markup and
 * know which element a piece of text sits in.
 */

/** A section of a page, as extracted. */
export interface ExtractedSection {
  /** The heading text; empty for text before the first heading. */
  heading: string;
  /** The heading's id (or a nearby id), for linking to `#anchor`. */
  anchor?: string;
  /** The section's text, whitespace collapsed. */
  text: string;
}

/** What {@link extractHtml} found in one page. */
export interface ExtractedPage {
  /** `<title>`, or the first `<h1>` when there is no title. Empty when neither exists. */
  title: string;
  /** False when the page asks not to be indexed (`<meta name="robots" content="noindex">`) or is a redirect (`<meta http-equiv="refresh">`). */
  indexable: boolean;
  /** The page's text split at headings. Empty sections are left out. */
  sections: ExtractedSection[];
}

/** Options for {@link extractHtml}. */
export interface ExtractOptions {
  /** Headings that start a new section. Default `['h2', 'h3']`. */
  splitOn?: readonly string[];
  /**
   * Elements whose content is never indexed. Default: `nav`, `header`, `footer`,
   * `aside`, `script`, `style`, `noscript`, `template`, `svg`, `form`, `button`,
   * `select`, `iframe`, `dialog`. Any element with `data-search-ignore` or `hidden`
   * is skipped too.
   */
  ignore?: readonly string[];
}

/** Elements skipped by default: page chrome and things that are not prose. */
export const DEFAULT_IGNORE: readonly string[] = [
  'nav',
  'header',
  'footer',
  'aside',
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'math',
  'form',
  'button',
  'select',
  'iframe',
  'dialog',
];

const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW = new Set(['script', 'style', 'textarea', 'title']);
// Text inside these runs on with its neighbors; any other tag separates words.
// Links and spans are not in the list: sites often lay them out as blocks with CSS
// alone, and "Pricing</a><a>Docs" must not become one word. Stray spaces before
// punctuation are removed afterwards.
const INLINE = new Set('abbr b bdi bdo cite code data dfn em i kbd mark q s samp small strong sub sup time u var wbr'.split(' '));

type Token =
  | { kind: 'open'; name: string; attrs: Map<string, string>; selfClosing: boolean }
  | { kind: 'close'; name: string }
  | { kind: 'text'; text: string };

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®',
  trade: '™', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', middot: '·', bull: '•', times: '×',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ccedil: 'ç',
  uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', euro: '€', pound: '£', yen: '¥', deg: '°', shy: '',
};

/** Decode HTML character references: `&amp;`, `&#39;`, `&#x2014;` and the common named ones. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[ref.toLowerCase()] ?? m;
  });
}

function parseAttrs(src: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const m of src.matchAll(re)) attrs.set(m[1]!.toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  return attrs;
}

function tokenize(html: string): Token[] {
  const out: Token[] = [];
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][\w:-]*)[^>]*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > at) out.push({ kind: 'text', text: html.slice(at, m.index) });
    at = re.lastIndex;
    if (m[1]) out.push({ kind: 'close', name: m[1].toLowerCase() });
    else if (m[2]) {
      const name = m[2].toLowerCase();
      const rest = m[3] ?? '';
      const selfClosing = /\/\s*$/.test(rest);
      out.push({ kind: 'open', name, attrs: parseAttrs(rest), selfClosing });
      if (RAW.has(name) && !selfClosing) {
        // Raw text runs until the matching end tag, markup or not.
        const end = html.toLowerCase().indexOf(`</${name}`, at);
        const stop = end === -1 ? html.length : end;
        out.push({ kind: 'text', text: html.slice(at, stop) });
        at = stop;
        re.lastIndex = stop;
      }
    }
  }
  if (at < html.length) out.push({ kind: 'text', text: html.slice(at) });
  return out;
}

const isOpen = (t: Token, name?: string): t is Extract<Token, { kind: 'open' }> =>
  t.kind === 'open' && (name === undefined || t.name === name);

/** Index just past the end tag matching the element opened at `i` (or the end). */
function matchEnd(tokens: Token[], i: number): number {
  const open = tokens[i] as Extract<Token, { kind: 'open' }>;
  if (open.selfClosing || VOID.has(open.name)) return i + 1;
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.kind === 'open' && t.name === open.name && !t.selfClosing) depth++;
    else if (t.kind === 'close' && t.name === open.name && --depth === 0) return j + 1;
  }
  return tokens.length;
}

const clean = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:!?)\]’”])/g, '$1')
    .trim();

/**
 * Extract the title and the searchable text of one HTML page, split into
 * sections at `h2`/`h3` headings.
 *
 * The content comes from the first element marked `data-search-body`, else
 * the first `<main>`, else the first `<article>`, else `<body>`. Navigation,
 * headers, footers, scripts and styles are dropped, as is any element with a
 * `data-search-ignore` or `hidden` attribute.
 */
export function extractHtml(html: string, options: ExtractOptions = {}): ExtractedPage {
  const tokens = tokenize(html);
  const splitOn = new Set((options.splitOn ?? ['h2', 'h3']).map((s) => s.toLowerCase()));
  const ignore = new Set((options.ignore ?? DEFAULT_IGNORE).map((s) => s.toLowerCase()));

  let title = '';
  let indexable = true;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (isOpen(t, 'title') && !title) title = clean(decodeEntities(tokens[i + 1]?.kind === 'text' ? (tokens[i + 1] as { text: string }).text : ''));
    if (isOpen(t, 'meta')) {
      const name = (t.attrs.get('name') ?? '').toLowerCase();
      const content = (t.attrs.get('content') ?? '').toLowerCase();
      if (name === 'robots' && /\b(noindex|none)\b/.test(content)) indexable = false;
      if ((t.attrs.get('http-equiv') ?? '').toLowerCase() === 'refresh' && /url\s*=/.test(content)) indexable = false;
    }
  }

  // The region to index: the first match of each rule, in order.
  const rules: ((t: Token) => boolean)[] = [
    (t) => isOpen(t) && t.attrs.has('data-search-body'),
    (t) => isOpen(t, 'main'),
    (t) => isOpen(t, 'article'),
    (t) => isOpen(t, 'body'),
  ];
  let from = 0;
  let to = tokens.length;
  for (const rule of rules) {
    const at = tokens.findIndex(rule);
    if (at < 0) continue;
    const end = matchEnd(tokens, at);
    const last = tokens[end - 1];
    from = at + 1;
    to = last?.kind === 'close' && last.name === (tokens[at] as { name: string }).name ? end - 1 : end;
    break;
  }

  const sections: ExtractedSection[] = [];
  let current: { heading: string; anchor?: string; parts: string[] } = { heading: '', parts: [] };
  let heading: { name: string; parts: string[]; anchor?: string } | null = null;
  let pendingId: string | undefined; // an id seen since the last text, e.g. <section id="x"><h2>
  let firstH1 = '';
  let inH1 = false;

  const flush = () => {
    const text = clean(current.parts.join(''));
    if (text) sections.push({ heading: current.heading, ...(current.anchor ? { anchor: current.anchor } : {}), text });
  };

  for (let i = from; i < to; i++) {
    const t = tokens[i]!;
    if (t.kind === 'open') {
      if (ignore.has(t.name) || t.attrs.has('data-search-ignore') || t.attrs.has('hidden')) {
        i = matchEnd(tokens, i) - 1;
        continue;
      }
      const id = t.attrs.get('id') || (t.name === 'a' ? t.attrs.get('name') : undefined);
      if (heading) {
        if (id && !heading.anchor) heading.anchor = id;
      } else if (splitOn.has(t.name)) {
        heading = { name: t.name, parts: [], ...(id || pendingId ? { anchor: id || pendingId } : {}) };
        continue;
      } else if (id) pendingId = id;
      if (t.name === 'h1') inH1 = true;
      if (!INLINE.has(t.name)) (heading ? heading.parts : current.parts).push(' ');
      continue;
    }
    if (t.kind === 'close') {
      if (heading && t.name === heading.name) {
        flush();
        current = { heading: clean(heading.parts.join('')), ...(heading.anchor ? { anchor: heading.anchor } : {}), parts: [] };
        heading = null;
        pendingId = undefined;
        continue;
      }
      if (t.name === 'h1') inH1 = false;
      if (!INLINE.has(t.name)) (heading ? heading.parts : current.parts).push(' ');
      continue;
    }
    const text = decodeEntities(t.text);
    if (/\S/.test(text)) pendingId = undefined;
    if (inH1 && !heading) firstH1 += text;
    (heading ? heading.parts : current.parts).push(text);
  }
  if (heading) current.parts.push(' ', ...heading.parts);
  flush();

  return { title: title || clean(firstH1), indexable, sections };
}
