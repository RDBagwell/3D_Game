/**
 * `npm run assets`: turns downloaded asset packs into the small files the
 * game loads.
 *
 *   1. Download the packs listed in docs/ASSETS-TODO.md and unzip (or
 *      git clone) them anywhere under art/incoming/.
 *   2. Run `npm run assets`. For each entry in tools/asset-sources.mjs it
 *      finds the file by name, then runs gltf-transform's `optimize`:
 *      meshopt geometry and animation compression, textures resized and
 *      converted to WebP. The result goes to public/<to>.
 *
 * Options:
 *   --incoming <dir>   look somewhere other than art/incoming/
 *   --only <name>      only process sources whose file name contains <name>
 *
 * Node names are kept (no joining, flattening or instancing), because the game
 * finds the knight's sword and shield, and the dummy's parts, by name.
 * Simplification is off: these models are already low-poly.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, PACKS } from './asset-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (/** @type {string} */ name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const incoming = path.resolve(root, option('--incoming') ?? 'art/incoming');
const only = option('--only');
const cli = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform');

if (!fs.existsSync(incoming)) {
  console.error(`No ${path.relative(root, incoming)}/ folder. Download the packs in docs/ASSETS-TODO.md into it first.`);
  process.exit(1);
}

/**
 * Every file under a folder, by base name (first match wins; .git is skipped).
 * @param {string} dir
 * @param {Map<string, string>} [found]
 */
function index(dir, found = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) index(full, found);
    else if (!found.has(entry.name)) found.set(entry.name, full);
  }
  return found;
}

const files = index(incoming);
let failed = 0;
for (const source of SOURCES) {
  if (only && !source.file.includes(only)) continue;
  const from = files.get(source.file);
  const pack = PACKS[/** @type {keyof typeof PACKS} */ (source.pack)];
  if (!from) {
    console.error(`missing  ${source.file}  (from ${pack.name}: ${pack.url})`);
    failed++;
    continue;
  }
  const to = path.join(root, 'public', source.to);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  execFileSync(cli, [
    'optimize', from, to,
    '--compress', 'meshopt',
    '--texture-compress', 'webp',
    '--texture-size', String(source.textureSize),
    '--simplify', 'false',
    '--join', 'false',
    '--flatten', 'false',
    '--instance', 'false',
    '--palette', 'false',
  ], { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
  const before = fs.statSync(from).size;
  const after = fs.statSync(to).size;
  console.log(`ok       ${source.file} -> public/${source.to}  (${kb(before)} -> ${kb(after)})`);
}

if (failed > 0) {
  console.error(`\n${failed} file(s) not found under ${path.relative(root, incoming)}/. The game uses placeholder shapes for anything missing.`);
  process.exit(1);
}

/** @param {number} bytes */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
