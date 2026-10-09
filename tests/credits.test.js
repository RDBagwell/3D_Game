import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseCredits } from '../src/game/content/credits.js';
import { PACKS } from '../tools/asset-sources.mjs';

const md = fs.readFileSync(new URL('../ASSETS.md', import.meta.url), 'utf8');

describe('credits', () => {
  it('are read from ASSETS.md', () => {
    const credits = parseCredits(md);
    expect(credits.length).toBeGreaterThan(5);
    expect(credits[0]).toEqual({ work: 'KayKit Character Pack: Adventurers 1.0', by: 'Kay Lousberg', licence: 'CC0 1.0', links: [{ text: 'kaylousberg.com', url: 'https://kaylousberg.com' }] });
  });

  it('credit every asset pack the game ships', () => {
    const works = parseCredits(md).map((c) => c.work);
    for (const pack of Object.values(PACKS)) expect(works, pack.name).toContain(pack.name);
  });

  it('credit the music once Robert adds it, and the ported Island RPG systems', () => {
    const all = parseCredits(md).map((c) => `${c.work} ${c.by}`).join('\n');
    expect(all).toMatch(/Music/);
    expect(all).toMatch(/Island RPG/);
  });
});
