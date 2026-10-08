import { test } from '@playwright/test';
import { openGame } from './helpers.js';

/**
 * Regenerates docs/screenshots/ (`npm run build && npm run screenshots`).
 *
 * Each shot freezes the game on a chosen simulation frame: the loop is
 * paused (rendering continues) and the simulation is stepped by hand, so the
 * same frame is captured every time. Rendered by headless Chromium in
 * software (SwiftShader): lighting and anti-aliasing match a real GPU, frame
 * rates don't.
 */

/** @typedef {any} Game */

const OUT = 'docs/screenshots';

const SIZES = [
  { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
  // A mid-size phone held sideways, with a touch screen (so the touch controls show).
  { name: 'phone', use: { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

/**
 * Pause the loop and step the simulation by hand until `until` is true.
 * @param {import('@playwright/test').Page} page
 * @param {string} until  JS expression over `g` (the game)
 * @param {{ attack?: boolean }} [opts]
 */
async function stepUntil(page, until, opts = {}) {
  await page.evaluate(
    ([until, attack]) => {
      const g = /** @type {Game} */ (window).game;
      g.loop.pause();
      // Slow the view's clock too, so sparks, flashes and damage numbers stay on screen.
      g.show = { ...g.show, speed: 0.02 };
      const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
      const press = { ...idle, buttons: { attack: { down: true, pressed: true, released: false } } };
      if (attack) g.sandbox.step(press);
      const test = new Function('g', `return (${until});`);
      for (let i = 0; i < 600 && !test(g); i++) g.sandbox.step(idle);
    },
    [until, opts.attack ?? false],
  );
  // Let a few frames render the frozen state.
  await page.waitForTimeout(400);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number, z: number }} at
 * @param {number} facing
 */
async function place(page, at, facing) {
  await page.evaluate(
    ([x, z, facing]) => {
      const g = /** @type {Game} */ (window).game;
      g.sandbox.player.body.teleport({ x, y: 0, z });
      g.sandbox.player.facing = facing;
      g.sandbox.camera.reset(g.sandbox.player.position, facing);
    },
    [at.x, at.z, facing],
  );
}

for (const size of SIZES) {
  test.describe(`screenshots @screenshots (${size.name})`, () => {
    test.use(size.use);

    test(`sandbox (${size.name})`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('3d:settings', JSON.stringify({ touch: 'auto' })));
      await openGame(page);
      await page.getByRole('button', { name: 'Play' }).click();
      await page.evaluate(() => (/** @type {Game} */ (window).game.hud.banner.hidden = true));
      await place(page, { x: 0.5, z: -2.55 }, Math.PI - 0.12);
      // Freeze just after the slash lands: sparks, flash and a damage number.
      await stepUntil(page, 'g.sandbox.dummies[0].hits > 0 && g.sandbox.hitstop > 0', { attack: true });
      await page.screenshot({ path: `${OUT}/sandbox-${size.name}.png` });
    });

    test(`lab with the hitbox view (${size.name})`, async ({ page }) => {
      // No performance HUD here: software-rendered frame rates would mislead.
      await openGame(page, '?lab&show=boxes,states,buffer,damage');
      await page.evaluate(() => (/** @type {Game} */ (window).game.hud.banner.hidden = true));
      await place(page, { x: 0.4, z: -2.0 }, Math.PI - 0.1);
      // Freeze on the first active frame of the slash: the red hitbox is out.
      await stepUntil(page, "g.sandbox.player.state === 'attack' && g.sandbox.player.attackFrameNow === g.sandbox.player.attack.startup", { attack: true });
      await page.screenshot({ path: `${OUT}/lab-hitboxes-${size.name}.png` });
    });

    test(`grunt telegraph (${size.name})`, async ({ page }) => {
      await openGame(page, '?lab&show=boxes,damage');
      await page.evaluate(() => {
        const g = /** @type {Game} */ (window).game;
        g.lab.close();
        g.hud.banner.hidden = true;
      });
      await place(page, { x: 0, z: -24.5 }, Math.PI);
      // Mid wind-up: the shrinking ring, the "!" sign, the glowing blade.
      await stepUntil(page, "g.sandbox.grunts.some((x) => x.state === 'windup' && x.brain.fsm.frames === 20)");
      await page.evaluate(() => {
        const g = /** @type {Game} */ (window).game;
        const grunt = g.sandbox.grunts.find((x) => x.state === 'windup');
        const p = g.sandbox.player.position;
        // Frame the camera from behind the player towards the grunt.
        const yaw = Math.atan2(grunt.position.x - p.x, grunt.position.z - p.z);
        g.sandbox.camera.reset(p, yaw);
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/telegraph-${size.name}.png` });
    });
  });
}
