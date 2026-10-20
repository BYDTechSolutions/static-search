# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-21

### Added

- `static-search build <dir>`: index a folder of built HTML into `search-index.json`, split into sections at `h2`/`h3` with anchors; prefers `data-search-body`, `<main>`, `<article>`; drops page chrome and `data-search-ignore`; skips `noindex` and redirect pages; reports the index size and warns above 300 kB gzipped; copies the browser script next to the index.
- `static-search query <index> <words...>`: try a query from the terminal.
- Browser runtime: `loadSearch`, `createSearch`, `highlight`, with BM25 field weights, prefix matching for the last word, a per-page result cap, accent folding, a light English suffix stripper and configurable stop words.
- `<static-search>` element: a keyboard-friendly search box with results, styled through CSS variables.
- Build API: `buildFromDirectory`, `buildIndex` (text, Markdown, HTML or sections), `extractHtml`, Markdown helpers.

[Unreleased]: https://github.com/BYDTechSolutions/static-search/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/BYDTechSolutions/static-search/releases/tag/v0.1.0
