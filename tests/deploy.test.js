import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, pagesUrl } from '../site.config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('GitHub Pages deployment', () => {
  it('builds with relative paths, so any repository name works', () => {
    expect(site.base).toBe('./');
    expect(read('vite.config.js')).toMatch(/base: site\.base/);
    // index.html must not hard-code the repository path either.
    expect(read('index.html')).not.toMatch(new RegExp(`/${site.repo}/`));
  });

  it('the workflow tests, builds, and deploys dist/ from main only', () => {
    const yml = read('.github/workflows/pages.yml');
    expect(yml).toMatch(/run: npm ci/);
    expect(yml).toMatch(/run: npm test/);
    expect(yml).toMatch(/run: npm run build/);
    expect(yml).toMatch(/upload-pages-artifact@v3[\s\S]*path: dist/);
    expect(yml).toMatch(/deploy:\s+if: github\.ref == 'refs\/heads\/main'/);
  });

  it('the README links to the right Pages URL (case-sensitive repository name)', () => {
    expect(read('README.md')).toContain(pagesUrl);
  });
});
