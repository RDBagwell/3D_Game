import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, MUSIC_TRACKS } from '../src/game/data/assets.js';
import { SOURCES } from '../tools/asset-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsMd = fs.readFileSync(path.join(root, 'ASSETS.md'), 'utf8');

/** @param {string} dir @returns {string[]} */
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full) : [full];
  });
}

describe('asset manifest', () => {
  it('every model the game loads exists, with the size the loading bar expects', () => {
    for (const [key, model] of Object.entries(MODELS)) {
      const file = path.join(root, 'public', model.url);
      expect(fs.existsSync(file), `${key}: ${model.url}`).toBe(true);
      expect(model.bytes, `${key}: update bytes in src/game/data/assets.js`).toBe(fs.statSync(file).size);
    }
  });

  it('every music track the game may request exists', () => {
    for (const name of MUSIC_TRACKS) expect(fs.existsSync(path.join(root, 'public', 'music', `${name}.ogg`)), name).toBe(true);
  });

  it('every file in public/ (what gets deployed) is listed in ASSETS.md', () => {
    for (const file of files(path.join(root, 'public'))) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      expect(assetsMd.includes(`\`${rel}\``), `${rel} is not in ASSETS.md`).toBe(true);
    }
  });

  it('every non-code file in the repository is listed in ASSETS.md', () => {
    const skip = /^(node_modules|\.git|dist|coverage|test-results|playwright-report|art\/incoming|docs\/screenshots)\//;
    const binary = /\.(png|jpe?g|webp|gif|ico|svg|glb|gltf|bin|blend1?|wav|mp3|ogg|m4a|ktx2|fbx|obj)$/i;
    const all = files(root).map((f) => path.relative(root, f).split(path.sep).join('/')).filter((f) => !skip.test(f) && binary.test(f));
    for (const rel of all) {
      const name = path.basename(rel);
      const dir = path.dirname(rel);
      // Listed by full path, or by name in a row about its folder ("color1-4.png" style rows count).
      const listed = assetsMd.includes(`\`${rel}\``) || (assetsMd.includes(dir) && assetsMd.includes(name.replace(/\d+(\.[a-z]+)$/i, '')));
      expect(listed, `${rel} is not in ASSETS.md`).toBe(true);
    }
  });

  it('every imported model is in the game\'s manifest', () => {
    const urls = Object.values(MODELS).map((m) => m.url);
    for (const s of SOURCES) expect(urls, s.to).toContain(s.to);
  });

  it('nothing Nintendo-derived is left (no hearts, rupees or the old sound files)', () => {
    // "heart" as a word (heart.png, ui_heart_full), not inside "hearth".
    const banned = /(rupee|rubis|(^|[^a-z])hearts?([^a-z]|$)|sprite_ui|rollvoice|get_heart|secret\.wav)/i;
    const all = files(path.join(root, 'public')).concat(files(path.join(root, 'src')));
    for (const f of all) expect(path.basename(f), f).not.toMatch(banned);
  });
});
