import { test, expect } from '@playwright/test';
import { collectErrors, openGame } from './helpers.js';

/** @typedef {any} Game */

test.describe('smoke', () => {
  test('loads to the title screen without console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await expect(page.locator('.menu-title')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    expect(await page.evaluate(() => /** @type {Game} */ (window).game.mode)).toBe('title');
    expect(errors).toEqual([]);
  });

  test('the player moves, and an attack lands on the dummy', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'Play' }).click();
    const start = await page.evaluate(() => ({ .../** @type {Game} */ (window).game.sandbox.player.position }));

    // Walk forward (towards the dummy at z = -4) with the real keyboard.
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => /** @type {Game} */ (window).game.sandbox.player.position.z < -2.4, null, { timeout: 60_000 });
    await page.keyboard.up('KeyW');
    const moved = await page.evaluate(() => /** @type {Game} */ (window).game.sandbox.player.position);
    expect(start.z - moved.z).toBeGreaterThan(3);

    // Swing until the dummy has taken damage.
    await expect(async () => {
      await page.keyboard.press('KeyJ');
      const damage = await page.evaluate(() => /** @type {Game} */ (window).game.sandbox.dummies[0].totalDamage);
      expect(damage).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000, intervals: [400] });
    await expect(page.locator('.floater').first()).toBeAttached(); // a damage number appeared
    expect(errors).toEqual([]);
  });

  test('the lab opens, and a toggle takes effect in the fight', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByRole('button', { name: 'Play' }).click();
    await page.keyboard.press('Tab');
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
    await page.getByRole('button', { name: 'Play' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-pause')).toBeVisible();
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
});
