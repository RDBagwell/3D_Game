/**
 * Shared helpers for the smoke tests. `window.game` is the running Game
 * (src/main.js exposes it). Tests wait on game state, not on time: in
 * software-rendered headless Chromium the game runs at a few frames a second.
 */

/**
 * Fail the test on any console error or uncaught exception.
 * @param {import('@playwright/test').Page} page
 */
export function collectErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/**
 * Open the game and wait until it has loaded.
 * @param {import('@playwright/test').Page} page
 * @param {string} [query]
 */
export async function openGame(page, query = '') {
  await page.goto(`./${query}`);
  await page.waitForFunction(() => /** @type {any} */ (window).game?.mode && /** @type {any} */ (window).game.mode !== 'loading', null, { timeout: 90_000 });
}

/**
 * @template T
 * @param {import('@playwright/test').Page} page
 * @param {() => T} fn
 * @returns {Promise<T>}
 */
export function game(page, fn) {
  return page.evaluate(fn);
}
