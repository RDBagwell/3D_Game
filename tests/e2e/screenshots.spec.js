import { test } from '@playwright/test';
import { openGame } from './helpers.js';

/**
 * Regenerates docs/screenshots/ (`npm run build && npm run screenshots`).
 *
 * Each shot is the real game, set up through its own API (a new game, a
 * few flags, the player placed), then frozen on a chosen simulation frame:
 * the loop is paused (rendering continues) and the simulation is stepped by
 * hand until the moment we want, so the same frame is captured every time.
 * Rendered by headless Chromium in software (SwiftShader): lighting and
 * anti-aliasing match a real GPU, frame rates don't.
 */

/** @typedef {any} Game */

const OUT = 'docs/screenshots';

const SIZES = [
  { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
  // A mid-size phone held sideways, with a touch screen (so the touch controls show).
  { name: 'phone', use: { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

/**
 * Start a new game (a finger on the phone, so its touch controls show).
 * @param {import('@playwright/test').Page} page
 * @param {string} size
 */
async function newGame(page, size) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('3d:settings', JSON.stringify({ touch: 'auto', quality: 'high' }));
  });
  await openGame(page);
  const button = page.getByRole('button', { name: 'New game' });
  await (size === 'phone' ? button.tap() : button.click());
  await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play');
}

/**
 * Run code in the page with `g` (the game) and `put(x, z, yaw)`.
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 */
function setup(page, code) {
  return page.evaluate(async (code) => {
    const g = /** @type {Game} */ (window).game;
    const put = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ yaw) => {
      g.sandbox.player.body.teleport({ x, y: 0.2, z });
      g.sandbox.player.facing = yaw;
      g.sandbox.camera.reset(g.sandbox.player.position, yaw);
    };
    await new Function('g', 'put', `return (async () => { ${code} })()`)(g, put);
  }, code);
}

/**
 * Hide the messages that would cover the shot.
 * @param {import('@playwright/test').Page} page
 */
function quiet(page) {
  return page.evaluate(() => {
    const g = /** @type {Game} */ (window).game;
    g.hud.banner.hidden = true;
    g.hud.toasts.replaceChildren();
    g.hud.saved.hidden = true;
  });
}

/**
 * Pause the loop and step the simulation by hand until `until` is true.
 * @param {import('@playwright/test').Page} page
 * @param {string} until  JS expression over `g` (the game)
 */
async function stepUntil(page, until) {
  const reached = await page.evaluate((until) => {
    const g = /** @type {Game} */ (window).game;
    g.loop.pause();
    // Slow the view's clock too, so sparks, flashes and rings hold still.
    g.show = { ...g.show, speed: 0.02 };
    const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
    const test = new Function('g', `return (${until});`);
    for (let i = 0; i < 1200; i++) {
      if (test(g)) return true;
      if (g.adventure) g.adventure.step(idle, 1 / 60);
      else g.sandbox.step(idle);
    }
    return false;
  }, until);
  if (!reached) throw new Error(`Never reached: ${until}`);
  await page.waitForTimeout(500);
}

for (const size of SIZES) {
  test.describe(`screenshots @screenshots (${size.name})`, () => {
    test.use(size.use);

    test(`a conversation in the village (${size.name})`, async ({ page }) => {
      await newGame(page, size.name);
      await setup(page, `
        const ina = g.sandbox.npcs.find((n) => n.id === 'ina');
        put(ina.position.x - 0.4, ina.position.z + 1.7, Math.PI - 0.2);
        g.adventure.events.emit('dialogue', { id: 'ina', npc: 'ina' });
        // Through her greeting to the question, the whole line showing.
        for (let i = 0; i < 6 && !g.dialogue.page?.choices; i++) { g.dialogue.confirm(); g.dialogue.confirm(); }
        g.dialogue.confirm();`);
      await quiet(page);
      await page.waitForTimeout(2500); // the camera swings round to frame them
      await page.screenshot({ path: `${OUT}/talk-${size.name}.png` });
    });

    test(`a locked-on fight in the Hearth Halls (${size.name})`, async ({ page }) => {
      await newGame(page, size.name);
      await setup(page, `
        g.adventure.state.flags.add('gate_open');
        await g.travel('halls', 'start');
        put(0.5, -20.5, Math.PI - 0.7);
        const adept = g.sandbox.foes.find((f) => f.kind === 'adept');
        adept.brain.aware = true;
        g.sandbox.setLock(adept);`);
      await quiet(page);
      // Mid-cast: the adept's staff glows, the warning sign shows.
      await stepUntil(page, "g.sandbox.foes.some((f) => f.kind === 'adept' && f.state === 'cast' && f.brain.windupProgress > 0.6)");
      await quiet(page);
      await page.screenshot({ path: `${OUT}/dungeon-${size.name}.png` });
    });

    test(`the Cinder Warden (${size.name})`, async ({ page }) => {
      await newGame(page, size.name);
      await setup(page, `
        for (const f of ['gate_open', 'hall_gate_open', 'vault_door_open']) g.adventure.state.flags.add(f);
        await g.travel('halls', 'ante');
        put(1.5, -81, Math.PI);
        g.sandbox.setLock(g.sandbox.boss);`);
      await quiet(page);
      // Its sweep winding up: the ring shows the reach, the sign is up.
      await stepUntil(page, "g.sandbox.boss && g.sandbox.boss.state === 'windup' && g.sandbox.boss.brain.windupProgress > 0.5");
      await quiet(page);
      await page.screenshot({ path: `${OUT}/boss-${size.name}.png` });
    });

    test(`the quest log (${size.name})`, async ({ page }) => {
      await newGame(page, size.name);
      await setup(page, `
        for (const f of ['ina_met', 'gate_open', 'wren_met', 'wren_asked', 'dorran_met', 'trial_won', 'blade_given']) g.adventure.state.flags.add(f);
        g.adventure.checkQuests(true);
        g.pause();
        g.menus.run('quests');`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/quests-${size.name}.png` });
    });

    test(`lab with the hitbox view (${size.name})`, async ({ page }) => {
      // No performance HUD here: software-rendered frame rates would mislead.
      await openGame(page, '?lab&show=boxes,states,buffer,damage');
      await page.evaluate(() => (/** @type {Game} */ (window).game.hud.banner.hidden = true));
      await setup(page, 'put(0.4, -2.0, Math.PI - 0.1);');
      // Freeze on the first active frame of the slash: the red hitbox is out.
      await page.evaluate(() => {
        const g = /** @type {Game} */ (window).game;
        g.loop.pause();
        g.show = { ...g.show, speed: 0.02 };
        g.sandbox.step({ move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: { attack: { down: true, pressed: true, released: false } } });
      });
      await stepUntil(page, "g.sandbox.player.state === 'attack' && g.sandbox.player.attackFrameNow === g.sandbox.player.attack.startup");
      await page.screenshot({ path: `${OUT}/lab-hitboxes-${size.name}.png` });
    });
  });
}
