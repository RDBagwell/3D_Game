/**
 * `node tools/measure.mjs` (after `npm run build`): measures the build in
 * headless Chromium and prints a report for docs/PERFORMANCE.md.
 *
 *   - download size: every file the page requests, raw and gzipped
 *   - renderer.info: draw calls and triangles in three views (GPU-independent)
 *   - simulation cost: Sandbox.step() timed in the page (CPU)
 *   - frame rate: reported, but headless Chromium renders WebGL in SOFTWARE
 *     (SwiftShader), so it says nothing about real devices
 *
 * It starts `vite preview` itself on port 4174.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4174;
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  /** @type {Map<string, number>} */
  const requests = new Map();
  page.on('requestfinished', async (req) => {
    const url = new URL(req.url());
    if (url.port !== String(port)) return;
    const file = path.join(root, 'dist', decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (fs.existsSync(file)) requests.set(path.relative(path.join(root, 'dist'), file), fs.statSync(file).size);
  });
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => /** @type {any} */ (window).game?.mode === 'title', null, { timeout: 120000 });
  const loadMs = Date.now() - t0;

  let raw = 0;
  let gz = 0;
  const rows = [];
  for (const [file, size] of [...requests].sort((a, b) => b[1] - a[1])) {
    const zipped = zlib.gzipSync(fs.readFileSync(path.join(root, 'dist', file)), { level: 9 }).length;
    raw += size;
    gz += zipped;
    rows.push(`| \`${file}\` | ${(size / 1e6).toFixed(2)} MB | ${(zipped / 1e6).toFixed(2)} MB |`);
  }

  // A new game, then sample the renderer in the places that matter.
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => /** @type {any} */ (window).game.mode === 'play', null, { timeout: 120000 });
  const sample = async (/** @type {string} */ name, /** @type {string} */ setup) => {
    await page.evaluate((code) => new Function('g', `return (async () => { ${code} })()`)(/** @type {any} */ (window).game), setup);
    await page.waitForTimeout(3000);
    return page.evaluate((name) => {
      const g = /** @type {any} */ (window).game;
      const info = g.view.renderer.info;
      return { name, calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, fps: g.perf.stats.fps, frameMs: g.perf.stats.frameMs };
    }, name);
  };
  const put = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ yaw) => `g.sandbox.player.body.teleport({x:${x},y:0.2,z:${z}}); g.sandbox.player.facing=${yaw}; g.sandbox.camera.reset(g.sandbox.player.position, ${yaw});`;
  const quality = (/** @type {string} */ q) => `g.applySettings({ ...g.settingsValues(), quality: '${q}' });`;
  const views = [
    await sample('Village square, High', quality('high') + put(0, 14, Math.PI)),
    await sample('Village square, Medium', quality('medium') + put(0, 14, Math.PI)),
    await sample('Village square, Low', quality('low') + put(0, 14, Math.PI)),
    await sample('Hearth Halls, Switch Hall fight, High', quality('high') + "g.adventure.state.flags.add('gate_open'); await g.travel('halls', 'start');" + put(0, -16, Math.PI)),
    await sample('The Warden\'s chamber, High', "for (const f of ['hall_gate_open','vault_door_open']) g.adventure.state.flags.add(f); await g.travel('halls', 'ante');" + put(0, -76, Math.PI)),
    await sample('Training grounds, lab open with every debug view, High', "await g.openLab(); g.setShow({ ...g.show, colliders: true, boxes: true, states: true, buffer: true, camera: true, perf: true });"),
  ];

  // Simulation cost: the full Sandbox.step (input buffer, AI, character controllers, physics, combat, camera),
  // in the Switch Hall with its enemies coming for you.
  const sim = await page.evaluate(async () => {
    const g = /** @type {any} */ (window).game;
    await g.travel('halls', 'start');
    g.sandbox.player.body.teleport({ x: 0, y: 0.2, z: -16 });
    g.loop.pause();
    const frame = { move: { x: 0.3, y: 1 }, look: { x: 0.01, y: 0 }, buttons: {} };
    const times = [];
    let physics = 0;
    for (let i = 0; i < 600; i++) {
      const t = performance.now();
      g.sandbox.step(frame);
      times.push(performance.now() - t);
      physics += g.sandbox.physics.lastStepMs;
    }
    times.sort((a, b) => a - b);
    return { mean: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], physics: physics / 600 };
  });

  const chromeVersion = browser.version();
  console.log(`# Measured ${new Date().toISOString().slice(0, 10)}: headless Chromium ${chromeVersion}, SwiftShader (software WebGL), ${os.cpus()[0]?.model ?? 'unknown CPU'} × ${os.cpus().length}, Node ${process.version}\n`);
  console.log(`## Download (files the page requested before the title screen)\n`);
  console.log('| File | Raw | Gzipped |\n| --- | --- | --- |');
  console.log(rows.join('\n'));
  console.log(`| **Total** | **${(raw / 1e6).toFixed(2)} MB** | **${(gz / 1e6).toFixed(2)} MB** |\n`);
  console.log(`Time to the title screen (local preview server, no network): ${(loadMs / 1000).toFixed(1)} s\n`);
  console.log('## Rendering (renderer.info; frame rate is SOFTWARE-RENDERED)\n');
  console.log('| View | Draw calls | Triangles | Geometries | Textures | fps (software) | frame ms (software) |\n| --- | --- | --- | --- | --- | --- | --- |');
  for (const v of views) console.log(`| ${v.name} | ${v.calls} | ${v.triangles.toLocaleString('en')} | ${v.geometries} | ${v.textures} | ${v.fps} | ${v.frameMs.toFixed(1)} |`);
  console.log(`\n## Simulation (600 steps of Sandbox.step in the Switch Hall, CPU)\n`);
  console.log(`mean ${sim.mean.toFixed(3)} ms, 95th percentile ${sim.p95.toFixed(3)} ms per step; of which Rapier world.step ${sim.physics.toFixed(3)} ms`);
} finally {
  await browser.close();
  server.kill();
}
