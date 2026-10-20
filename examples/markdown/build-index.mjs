// Build an index from Markdown files instead of built HTML.
// Run: node examples/markdown/build-index.mjs   (writes examples/markdown/search-index.json)
// In a real project, write it into your static folder (public/) before your site build.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { buildIndex } from '@bydtech/static-search/build';

const dir = new URL('./content/', import.meta.url);
const docs = [];
for (const name of await readdir(dir)) {
  if (!name.endsWith('.md')) continue;
  docs.push({ url: `/docs/${name.replace(/\.md$/, '')}`, markdown: await readFile(new URL(name, dir), 'utf8') });
}
const data = buildIndex(docs);
await writeFile(new URL('./search-index.json', import.meta.url), JSON.stringify(data));
console.log(`indexed ${data.pages.length} pages, ${data.chunks.length} sections`);
