import { test, expect } from '@playwright/test';
import { collectErrors, openGame } from './helpers.js';

/** @typedef {any} Game */

test.describe('smoke', () => {
  test('loads to the title screen without console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await expect(page.locator('.menu-title')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
    expect(await page.evaluate(() => /** @type {Game} */ (window).game.mode)).toBe('title');
    expect(errors).toEqual([]);
  });

  test('a new game starts on the dock, and the player walks with the keyboard', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play' && /** @type {Game} */ (window).game.adventure?.state.area === 'village');
    const start = await page.evaluate(() => ({ .../** @type {Game} */ (window).game.sandbox.player.position }));
    // Walk up the dock (north, -z) with the real keyboard.
    await page.keyboard.down('KeyW');
    await page.waitForFunction((z) => /** @type {Game} */ (window).game.sandbox.player.position.z < z - 3, start.z, { timeout: 60_000 });
    await page.keyboard.up('KeyW');
    expect(errors).toEqual([]);
  });

  test('an attack lands on the training dummy', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'Game-feel lab' }).click();
    await page.waitForFunction(() => /** @type {Game} */ (window).game.sandbox?.area.id === 'training' && /** @type {Game} */ (window).game.mode === 'play');
    await page.keyboard.press('Tab'); // close the lab
    await page.evaluate(() => {
      const g = /** @type {Game} */ (window).game;
      g.sandbox.player.body.teleport({ x: 0, y: 0, z: -2.9 });
      g.sandbox.player.facing = Math.PI;
    });
    // Swing until the dummy has taken damage.
    await expect(async () => {
      await page.keyboard.press('KeyJ');
      const damage = await page.evaluate(() => /** @type {Game} */ (window).game.sandbox.dummies[0].totalDamage);
      expect(damage).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000, intervals: [400] });
    await expect(page.locator('.floater').first()).toBeAttached(); // a damage number appeared
    expect(errors).toEqual([]);
  });

  test('talking to Elder Ina: the prompt, the dialogue box, a choice', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play');
    await page.evaluate(() => {
      const g = /** @type {Game} */ (window).game;
      const ina = g.sandbox.npcs.find((/** @type {any} */ n) => n.id === 'ina');
      g.sandbox.player.body.teleport({ x: ina.position.x, y: 0.1, z: ina.position.z + 1.5 });
      g.sandbox.player.facing = Math.PI;
    });
    await expect(page.locator('.prompt')).toContainText('Elder Ina');
    await page.keyboard.press('KeyE');
    await expect(page.locator('.dialogue')).toBeVisible();
    await expect(page.locator('.dialogue-speaker')).toHaveText('Elder Ina');
    // Continue until the choices show, then pick "Can I help?" and "I'll go."
    for (const choice of ['Can I help?', "I'll go."]) {
      await expect(async () => {
        if (!(await page.locator('.dialogue-choices li', { hasText: choice }).isVisible())) await page.keyboard.press('Enter');
        await expect(page.locator('.dialogue-choices li', { hasText: choice })).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 30_000 });
      await page.locator('.dialogue-choices li', { hasText: choice }).click();
    }
    await expect(async () => {
      await page.keyboard.press('Enter');
      expect(await page.evaluate(() => /** @type {Game} */ (window).game.mode)).toBe('play');
    }).toPass({ timeout: 30_000 });
    expect(await page.evaluate(() => /** @type {Game} */ (window).game.adventure.state.flags.has('gate_open'))).toBe(true);
    await expect(page.locator('.toast').first()).toBeAttached(); // "Quest updated"
    expect(errors).toEqual([]);
  });

  test('saves survive a reload: Continue picks up the game', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play');
    await page.evaluate(() => {
      const g = /** @type {Game} */ (window).game;
      g.adventure.state.flags.add('ina_met');
      g.adventure.state.shells = 77;
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save and quit' }).click();
    await expect(page.locator('.menu-title')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => /** @type {Game} */ (window).game?.mode === 'title', null, { timeout: 90_000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play');
    const state = await page.evaluate(() => {
      const s = /** @type {Game} */ (window).game.adventure.state;
      return { shells: s.shells, met: s.flags.has('ina_met'), area: s.area };
    });
    expect(state).toEqual({ shells: 77, met: true, area: 'village' });
    expect(errors).toEqual([]);
  });

  test('travelling between areas does not leak GPU memory', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play');
    const counts = await page.evaluate(async () => {
      const g = /** @type {Game} */ (window).game;
      g.adventure.state.flags.add('gate_open');
      const out = [];
      for (let i = 0; i < 4; i++) {
        await g.travel('halls', 'start');
        await g.travel('village', 'gate');
        await new Promise((r) => setTimeout(r, 500));
        out.push(g.view.renderer.info.memory.textures);
      }
      return out;
    });
    // No growth from trip to trip. (The leak this guards against added about
    // 150 textures per round trip; a few vary with when neighbouring areas
    // are precompiled in idle time.)
    expect(Math.max(...counts.slice(1)) - Math.min(...counts.slice(1)), JSON.stringify(counts)).toBeLessThan(30);
    expect(counts[3] - counts[1], JSON.stringify(counts)).toBeLessThan(30);
    expect(errors).toEqual([]);
  });

  test('the lab opens, and a toggle takes effect in the fight', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'Game-feel lab' }).click();
    const lab = page.locator('.lab');
    await expect(lab).toBeVisible();

    // Record the hit-stop of every hit from here on.
    await page.evaluate(() => {
      const g = /** @type {Game} */ (window).game;
      g.__hitstops = [];
      g.sandbox.events.on('hit', () => g.__hitstops.push(g.sandbox.hitstop));
    });
    // Polished: hits freeze the fight.
    await page.evaluate(() => {
      const g = /** @type {Game} */ (window).game;
      g.sandbox.player.body.teleport({ x: 0, y: 0, z: -2.9 });
      g.sandbox.player.facing = Math.PI;
    });
    await expect(async () => {
      await page.keyboard.press('KeyJ');
      expect((await page.evaluate(() => /** @type {Game} */ (window).game.__hitstops)).length).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000, intervals: [400] });
    expect((await page.evaluate(() => /** @type {Game} */ (window).game.__hitstops))[0]).toBeGreaterThan(0);

    // Switch to Raw in the lab: the next hits have no hit-stop.
    await lab.getByRole('button', { name: 'Raw' }).click();
    await expect(page.locator('.preset-badge')).toHaveText('Feel: Raw');
    await page.evaluate(() => {
      const g = /** @type {Game} */ (window).game;
      g.__hitstops = [];
      g.sandbox.player.body.teleport({ x: 0, y: 0, z: -2.9 });
      g.sandbox.player.facing = Math.PI;
    });
    await expect(async () => {
      await page.keyboard.press('KeyJ');
      expect((await page.evaluate(() => /** @type {Game} */ (window).game.__hitstops)).length).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000, intervals: [400] });
    expect(await page.evaluate(() => /** @type {Game} */ (window).game.__hitstops)).toEqual(expect.arrayContaining([0]));
    expect(await page.evaluate(() => Math.max(.../** @type {Game} */ (window).game.__hitstops))).toBe(0);

    // A "show" toggle: the hitbox view switches on and is saved.
    await lab.getByText('Hitboxes and hurtboxes').click();
    expect(await page.evaluate(() => /** @type {Game} */ (window).game.show.boxes)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('3d:show') ?? '{}').boxes)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('?lab opens the game with the lab, and a shared preset applies', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, '?lab&preset=floaty');
    await expect(page.locator('.lab')).toBeVisible();
    expect(await page.evaluate(() => /** @type {Game} */ (window).game.mode)).toBe('play');
    await expect(page.locator('.preset-badge')).toHaveText('Feel: Floaty');
    expect(errors).toEqual([]);
  });

  test('pause menu, settings and controls open and close', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play');
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-pause')).toBeVisible();
    await page.getByRole('button', { name: 'Quests' }).click();
    await expect(page.locator('.quest-log')).toContainText('The Cold Hearth');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Controls' }).click();
    await expect(page.locator('.controls-table')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('checkbox', { name: /^Reduced motion/ }).check();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('3d:settings') ?? '{}').reducedMotion)).toBe(true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Resume' }).click();
    expect(await page.evaluate(() => /** @type {Game} */ (window).game.mode)).toBe('play');
    expect(errors).toEqual([]);
  });

  for (const hasTouch of [false, true]) {
    test(`the mouse attacks and captures the camera${hasTouch ? ' on a touchscreen laptop' : ''}`, async ({ browser }) => {
      // A laptop with a touchscreen reports touch support; the mouse must still work.
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch });
      const page = await context.newPage();
      const errors = collectErrors(page);
      await openGame(page);
      await page.getByRole('button', { name: 'New game' }).click();
      await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play');
      await page.mouse.move(640, 360);
      await page.mouse.down();
      // Wait on game state: software rendering runs at a few frames a second.
      await page.waitForFunction(() => /** @type {Game} */ (window).game.sandbox.player.swingId > 0, null, { timeout: 30_000 });
      await page.mouse.up();
      expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
      expect(await page.evaluate(() => /** @type {Game} */ (window).game.touch.visible)).toBe(false);
      // Moving the captured mouse turns the camera. The move is dispatched with
      // a real movementX: headless Chromium's synthetic moves under pointer
      // lock sometimes report no movement at all, which a real mouse never does.
      const yaw = await page.evaluate(() => /** @type {Game} */ (window).game.sandbox.camera.yaw);
      await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 120, movementY: 0 })));
      await page.waitForFunction((y) => /** @type {Game} */ (window).game.sandbox.camera.yaw !== y, yaw, { timeout: 30_000 });
      expect(errors).toEqual([]);
      await context.close();
    });
  }

  test('a finger brings the touch controls up, and the stick moves the hero', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await openGame(page);
    await page.getByRole('button', { name: 'New game' }).tap(); // a finger, not the mouse
    await page.waitForFunction(() => /** @type {Game} */ (window).game.mode === 'play');
    await expect(page.locator('.touch-controls')).toBeVisible();
    const start = await page.evaluate(() => /** @type {Game} */ (window).game.sandbox.player.position.z);
    // Drag on the lower left of the game (the stick) with a touch pointer.
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', 120, 300);
    await touch('touchMove', 120, 240);
    await page.waitForFunction((z) => /** @type {Game} */ (window).game.sandbox.player.position.z < z - 0.5, start, { timeout: 30_000 });
    await touch('touchEnd', 0, 0);
    await context.close();
  });
});
