import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** A temporary folder holding `files` (path -> content). */
export async function site(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'static-search-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

export const html = (title: string, main: string, head = ''): string =>
  `<!doctype html><html><head><title>${title}</title>${head}</head><body><nav>Menu</nav><main>${main}</main><footer>Footer</footer></body></html>`;
