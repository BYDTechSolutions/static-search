/*
 * Text analysis shared by indexing and querying: split into words, fold case
 * and accents, drop stop words, strip a few English suffixes. Both sides must
 * run the same steps, so the index stores plain text and the browser analyzes
 * it at load time: changing these options never needs a rebuild.
 */

/** Common English words that carry no meaning in a search. Pass `stopWords: []` to keep them all. */
export const ENGLISH_STOP_WORDS: readonly string[] = (
  'a an and are as at be but by can do does for from how i if in into is it its me my of on or our so that the their them then there these this to us was we what when where which who why will with you your about would could should have has any some than too very just also more most not no yes'
).split(' ');

/** A word in the original text, with its position. */
export interface Word {
  /** The word as written. */
  text: string;
  /** Offset of its first character in the source string. */
  start: number;
  /** Offset just past its last character. */
  end: number;
}

const WORD = /[\p{L}\p{N}\p{M}]+/gu;
const MARKS = /\p{M}/gu;

/** Every word in `text`, with positions, in order. Punctuation and spaces separate words. */
export function words(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(WORD)) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** Lowercase and remove accents: "Café" becomes "cafe". */
export function fold(word: string): string {
  return word.normalize('NFKD').replace(MARKS, '').toLowerCase();
}

const undouble = (w: string): string => (/([b-df-hj-km-np-rtv-y])\1$/.test(w) ? w.slice(0, -1) : w);

/**
 * A light English suffix stripper, not a full stemmer. It removes plural `-s`
 * and `-ies`, `-ing`, `-ed` and a final `-e`, so "resetting", "resets" and
 * "reset" meet, as do "pages" and "page" or "making" and "make". Words with
 * digits and words under four letters are left alone. It does not know
 * irregular forms ("ran", "mice") or other languages.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length < 4 || /\d/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = undouble(w.slice(0, -3));
  else if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed')) w = undouble(w.slice(0, -2));
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/** How words become search terms. */
export interface Analyzer {
  stopWords: ReadonlySet<string>;
  stem: boolean;
}

/** Whether a folded word is long enough to search for: two characters, or one digit. */
export const keep = (w: string): boolean => w.length > 1 || /\d/.test(w);

/** The term a folded word is indexed under, or null when it is not indexed. */
export function term(folded: string, a: Analyzer): string | null {
  if (!keep(folded) || a.stopWords.has(folded)) return null;
  return a.stem ? stem(folded) : folded;
}

/** The search terms in `text`, in order, repeats kept. */
export function terms(text: string, a: Analyzer): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WORD)) {
    const t = term(fold(m[0]), a);
    if (t) out.push(t);
  }
  return out;
}
