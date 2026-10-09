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
 *
 * Animations: KayKit characters ship 76 to 95 clips each, most of which the
 * game never plays. A source with `keep: [...]` has every other clip removed
 * before optimising (gltf-transform's prune step then drops the data they
 * used), which cuts a character from about 2 MB to a few hundred KB.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
 * Every file under a folder (.git is skipped), as forward-slash paths.
 * @param {string} dir
 * @param {string[]} [found]
 */
function index(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) index(full, found);
    else found.push(full.split(path.sep).join('/'));
  }
  return found;
}

const allFiles = index(incoming);
/** A source's `file` is a name, or the end of a path ("red/building_home_A_red.gltf"). */
const files = { get: (/** @type {string} */ file) => allFiles.find((f) => f.endsWith(`/${file}`)) };

/**
 * Copy a .glb keeping only the named animations.
 * @param {string} from
 * @param {string[]} keep
 * @returns {{ file: string, kept: number, of: number }}
 */
function trimAnimations(from, keep) {
  const data = fs.readFileSync(from);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error(`${from}: keep needs a .glb source`);
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = data.subarray(20 + jsonLength);
  const all = json.animations ?? [];
  json.animations = all.filter((/** @type {any} */ a) => keep.includes(a.name));
  const missing = keep.filter((name) => !all.some((/** @type {any} */ a) => a.name === name));
  if (missing.length) console.warn(`warning  ${path.basename(from)} has no clip(s): ${missing.join(', ')}`);
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4) text += ' ';
  const jsonBuf = Buffer.from(text);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + jsonBuf.length + bin.length, 8);
  header.writeUInt32LE(jsonBuf.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const out = path.join(os.tmpdir(), `trim-${process.pid}-${path.basename(from)}`);
  fs.writeFileSync(out, Buffer.concat([header, jsonBuf, bin]));
  return { file: out, kept: json.animations.length, of: all.length };
}
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
  let input = from;
  let note = '';
  if (source.keep) {
    const trimmed = trimAnimations(from, source.keep);
    input = trimmed.file;
    note = `, ${trimmed.kept} of ${trimmed.of} animations`;
  }
  execFileSync(cli, [
    'optimize', input, to,
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
  if (input !== from) fs.rmSync(input);
  console.log(`ok       ${source.file} -> public/${source.to}  (${kb(before)} -> ${kb(after)}${note})`);
}

if (failed > 0) {
  console.error(`\n${failed} file(s) not found under ${path.relative(root, incoming)}/. The game uses placeholder shapes for anything missing.`);
  process.exit(1);
}

/** @param {number} bytes */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
