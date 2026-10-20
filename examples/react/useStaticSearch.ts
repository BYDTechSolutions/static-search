/*
 * React: your own UI on the headless API. Loads the index once, on first use.
 *
 *   const results = useStaticSearch(query);
 *   results.map((r) => <a key={r.url} href={r.url} dangerouslySetInnerHTML={{ __html: highlight(r) }} />)
 *
 * (`highlight` escapes the text, so its output is safe to set as HTML.)
 */
import { useEffect, useState } from 'react';
import { loadSearch, type Search, type SearchResult } from '@bydtech/static-search';

let loading: Promise<Search> | undefined;

export function useStaticSearch(query: string, src = '/search-index.json'): SearchResult[] {
  const [results, setResults] = useState<SearchResult[]>([]);
  useEffect(() => {
    if (!query.trim()) return setResults([]);
    let current = true;
    (loading ??= loadSearch(src)).then((search) => current && setResults(search.query(query)));
    return () => {
      current = false;
    };
  }, [query, src]);
  return results;
}
