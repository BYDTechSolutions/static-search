/**
 * The browser (and Node) side of static-search: load an index, query it,
 * highlight the results. Building an index lives in `@bydtech/static-search/build`
 * and the `static-search` CLI; the drop-in element in `@bydtech/static-search/element`.
 *
 * @example
 * import { loadSearch, highlight } from '@bydtech/static-search';
 * const search = await loadSearch('/search-index.json');
 * for (const r of search.query('reset password')) console.log(r.title, r.url, highlight(r));
 */
export { createSearch, highlight, loadSearch, makeSnippet } from './search.js';
export type { FieldWeights, LoadOptions, QueryOptions, Search, SearchOptions } from './search.js';
export { ENGLISH_STOP_WORDS, fold, stem, words } from './text.js';
export type { Word } from './text.js';
export type { IndexedChunk, IndexedPage, SearchIndexData, SearchResult } from './types.js';
