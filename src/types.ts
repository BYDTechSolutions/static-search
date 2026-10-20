/** The file `static-search build` writes: plain JSON, readable by anything. */
export interface SearchIndexData {
  /** Format version. This package reads version 1. */
  version: 1;
  /** One entry per page. Chunks refer to pages by position in this array. */
  pages: IndexedPage[];
  /** The searchable pieces: one per page section. */
  chunks: IndexedChunk[];
}

/** A page in the index. */
export interface IndexedPage {
  /** Where the page lives, as a path (`/docs/install`) or a full URL. */
  url: string;
  /** The page title. */
  title: string;
}

/** A section of a page: the text between two headings. */
export interface IndexedChunk {
  /** Position of the page in `pages`. */
  page: number;
  /** The heading's `id`, so a result can link to `url#anchor`. Absent for text before the first heading, or a heading without an id. */
  anchor?: string;
  /** The section heading. Absent for text before the first heading. */
  section?: string;
  /** The section's text, whitespace collapsed. */
  text: string;
}

/** One search result. */
export interface SearchResult {
  /** Link to the section: the page URL, plus `#anchor` when the section has one. */
  url: string;
  /** The page URL without the anchor. */
  pageUrl: string;
  /** The page title. */
  title: string;
  /** The section heading, or an empty string for text before the first heading. */
  section: string;
  /** A short excerpt of the section around the words that matched. */
  snippet: string;
  /** `[start, end)` character ranges in `snippet` of the words that matched, in order. */
  highlights: [number, number][];
  /** Relevance (BM25). Only meaningful compared with other results of the same query. */
  score: number;
}
