import { defineConfig } from 'tsup';

// Both builds write into dist/ at once, so neither cleans it: `npm run build` empties it first.

export default defineConfig([
  {
    // The library: the browser runtime, the Node build API, the element and the CLI.
    entry: { index: 'src/index.ts', build: 'src/build.ts', element: 'src/element.ts', cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'neutral',
    external: [/^node:/],
    dts: { entry: { index: 'src/index.ts', build: 'src/build.ts', element: 'src/element.ts' } },
    removeNodeProtocol: false,
    clean: false,
    sourcemap: false,
    splitting: true,
  },
  {
    // One self-contained, minified file the CLI copies next to the index, so a
    // plain HTML page can load it with a single <script> tag and no bundler.
    entry: { 'static-search': 'src/element.ts' },
    format: ['esm'],
    target: 'es2020',
    platform: 'browser',
    minify: true,
    splitting: false,
    sourcemap: false,
    clean: false,
  },
]);
