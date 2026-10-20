'use client';
/*
 * Next.js App Router: a client component that renders the drop-in element.
 *
 * Static export (`output: 'export'` in next.config):
 *   "build": "next build && static-search build out"
 *
 * Server-rendered apps have no folder of finished HTML at build time; build the
 * index from your content instead, before `next build` (see ../markdown).
 */
import { useEffect } from 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'static-search': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        placeholder?: string;
        limit?: number;
      };
    }
  }
}

export function Search() {
  useEffect(() => {
    // Registers <static-search> in the browser only.
    void import('@bydtech/static-search/element');
  }, []);
  return <static-search src="/search-index.json" placeholder="Search" />;
}
