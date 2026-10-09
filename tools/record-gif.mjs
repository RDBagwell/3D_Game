/**
 * `node tools/record-gif.mjs` (after `npm run build`; needs ffmpeg): records
 * docs/screenshots/boss-fight.gif, the README's animation.
 *
 * It plays the real game in headless Chromium with scripted inputs (the
 * same tactics as tests/helpers/bossBot.js: roll aside as the slam comes
 * down, then punish the stuck axe) and captures it frame by frame: the loop
 * is stopped, and for each GIF frame the simulation takes three fixed steps
 * and the game renders once. So the clip runs at true speed and stays smooth
 * even though software rendering is slow. Nothing is drawn or edited: every
 * frame is the game's own render.
 *
 * It starts `vite preview` itself on port 4175.
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'screenshots', 'boss-fight.gif');
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'gif-'));
const port = 4175;
const FPS = 15;
const SECONDS = 7;
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('3d:settings', JSON.stringify({ quality: 'high', hints: false }));
  });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => /** @type {any} */ (window).game?.mode === 'title', null, { timeout: 120000 });
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => /** @type {any} */ (window).game.mode === 'play');
  await page.evaluate(async () => {
    const g = /** @type {any} */ (window).game;
    for (const f of ['gate_open', 'hall_gate_open', 'vault_door_open', 'warden_seen']) g.adventure.state.flags.add(f);
    await g.travel('halls', 'ante');
    const sb = g.sandbox;
    sb.player.body.teleport({ x: 0.6, y: 0.2, z: -83.6 });
    sb.player.facing = Math.PI;
    sb.camera.reset(sb.player.position, Math.PI);
    const boss = sb.boss;
    boss.brain.aware = true;
    boss.brain.rest = 30;
    // Its last two attacks were sweeps, so it slams next (the opening).
    boss.brain.lastAttacks = ['wardenSweep', 'wardenSweep'];
    sb.setLock(boss);
    g.loop.stop();
    g.hud.banner.hidden = true;
    // The scripted player (tests/helpers/bossBot.js, cut down).
    let rolledAt = -1;
    let attackTimer = 0;
    g.__script = () => {
      const p = sb.player.position;
      const d = Math.hypot(boss.position.x - p.x, boss.position.z - p.z);
      const st = boss.brain.state;
      const { forward, right } = sb.camera.groundAxes();
      const stick = (dx, dz) => {
        const l = Math.hypot(dx, dz) || 1;
        return { x: (dx * right.x + dz * right.z) / l, y: (dx * forward.x + dz * forward.z) / l };
      };
      let move = { x: 0, y: 0 };
      const buttons = {};
      if (st === 'windup' && boss.attack) {
        const side = { x: -(boss.position.z - p.z), z: boss.position.x - p.x };
        move = stick(side.x, side.z);
        if (boss.brain.windupProgress >= (boss.attack.startup - 8) / boss.attack.startup && rolledAt !== boss.brain.fsm.history.length) {
          rolledAt = boss.brain.fsm.history.length;
          buttons.roll = { down: true, pressed: true, released: false };
        }
      } else if (st === 'stuck') {
        if (d > 2.2) move = stick(boss.position.x - p.x, boss.position.z - p.z);
        else if (attackTimer-- <= 0) {
          buttons.attack = { down: true, pressed: true, released: false };
          attackTimer = 12;
        }
      } else if (d < 4) {
        move = stick(p.x - boss.position.x, p.z - boss.position.z);
      }
      return { move, look: { x: 0, y: 0 }, buttons };
    };
  });

  for (let i = 0; i < FPS * SECONDS; i++) {
    await page.evaluate((steps) => {
      const g = /** @type {any} */ (window).game;
      for (let s = 0; s < steps; s++) g.adventure.step(g.__script(), 1 / 60);
      g.hud.toasts.replaceChildren();
      g.hud.saved.hidden = true;
      g.render(1, 1 / 15);
    }, 60 / FPS);
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
  }

  // Two-pass palette for a clean GIF, scaled to 480 wide.
  const palette = path.join(frames, 'palette.png');
  const input = ['-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png')];
  execFileSync('ffmpeg', ['-y', ...input, '-vf', 'scale=480:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff', palette], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', ...input, '-i', palette, '-lavfi', 'scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', out], { stdio: 'ignore' });
  console.log(`${path.relative(root, out)}: ${(fs.statSync(out).size / 1e6).toFixed(2)} MB, ${FPS * SECONDS} frames`);
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(frames, { recursive: true, force: true });
}
