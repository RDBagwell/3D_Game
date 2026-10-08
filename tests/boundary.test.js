import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: on Windows .pathname gives "/C:/..." which breaks paths.
const engineDir = fileURLToPath(new URL('../src/engine/', import.meta.url));
const simDirs = ['../src/game/sim/', '../src/game/player/', '../src/game/enemies/', '../src/game/combat/'].map((d) => fileURLToPath(new URL(d, import.meta.url)));

/** @param {string} dir */
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : full.endsWith('.js') ? [full] : [];
  });
}

/** @param {string} file */
function imports(file) {
  return [...fs.readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

describe('engine / game boundary', () => {
  it('src/engine never imports game code', () => {
    for (const file of files(engineDir)) {
      for (const spec of imports(file)) {
        if (!spec.startsWith('.')) continue; // packages (three, rapier)
        const resolved = path.resolve(path.dirname(file), spec);
        expect(resolved.startsWith(engineDir), `${path.relative(engineDir, file)} imports ${spec}`).toBe(true);
      }
    }
  });

  it('the simulation never imports the view, the UI or the lab (so it runs in Node)', () => {
    for (const dir of simDirs) {
      for (const file of files(dir)) {
        for (const spec of imports(file)) expect(spec, path.basename(file)).not.toMatch(/\/(view|ui|lab)\//);
      }
    }
  });
});
