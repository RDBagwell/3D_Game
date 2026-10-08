import './style.css';
import { Game } from './game/Game.js';

/**
 * Entry point: starts the game in #game. `window.game` is exposed for the
 * browser console and the Playwright smoke tests (tests/e2e/).
 */
const root = /** @type {HTMLElement} */ (document.getElementById('game'));
const game = new Game(root);
/** @type {any} */ (window).game = game;
game.start().catch((error) => {
  console.error(error);
  const label = root.querySelector('.loading-label');
  if (label) label.textContent = `Couldn't start the game: ${error.message}`;
});
