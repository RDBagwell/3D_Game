import { button } from '../../engine/index.js';
import { REBINDABLE, DEFAULT_BINDINGS } from '../config.js';
import { settings, updateSettings, keysFor, keyLabel, rebindKey } from '../settings.js';

/**
 * The title screen, pause menu, settings and controls, as DOM over the game.
 *
 * Menus are a stack of screens (Title → Settings → back to Title). They work
 * with the mouse, the keyboard (Tab / arrows / Enter, Esc to go back) and a
 * gamepad (d-pad or stick to move, A / ✕ to choose, B / ○ to go back): the
 * game passes each InputFrame to `handlePad` while a menu is open.
 *
 * While a menu is open the game's keyboard input is switched off, so keys
 * do their normal job in the page (Space presses a button, Tab moves focus).
 */

/**
 * @typedef {object} MenuActions
 * @property {() => void} play
 * @property {() => void} resume
 * @property {() => void} openLab
 * @property {() => void} quit
 * @property {(s: import('../settings.js').Settings) => void} applySettings
 * @property {(name: string) => void} sound
 */

export class Menus {
  /**
   * @param {HTMLElement} container
   * @param {MenuActions} actions
   */
  constructor(container, actions) {
    this.actions = actions;
    this.root = document.createElement('div');
    this.root.className = 'menus';
    this.root.hidden = true;
    container.append(this.root);
    /** @type {HTMLElement[]} */
    this.stack = [];
    /** Set while waiting for a key to rebind. @type {{ action: string, row: HTMLElement } | null} */
    this.rebinding = null;
    this.padRepeat = 0;
    this.onKey = this.onKey.bind(this);
    window.addEventListener('keydown', this.onKey, true);
  }

  get isOpen() {
    return this.stack.length > 0;
  }

  /** Which screen is on top ('title', 'pause'...), or null. */
  get current() {
    return this.stack[this.stack.length - 1]?.dataset.screen ?? null;
  }

  showTitle() {
    this.closeAll();
    this.push(this.screen('title', `
      <h1 class="logo">Ember<span>wake</span></h1>
      <p class="tagline">A short adventure on Cinder Isle, with a built-in game-feel lab</p>
      <nav>
        <button data-do="play" class="primary">Play</button>
        <button data-do="lab">Game-feel lab</button>
        <button data-do="controls">Controls</button>
        <button data-do="settings">Settings</button>
      </nav>
      <p class="credits">Characters and props: KayKit by Kay Lousberg (CC0). Code, sounds and level: made for this project.</p>`));
  }

  showPause() {
    this.closeAll();
    this.push(this.screen('pause', `
      <h2>Paused</h2>
      <nav>
        <button data-do="resume" class="primary">Resume</button>
        <button data-do="lab">Game-feel lab</button>
        <button data-do="controls">Controls</button>
        <button data-do="settings">Settings</button>
        <button data-do="quit">Quit to title</button>
      </nav>`));
  }

  closeAll() {
    for (const s of this.stack) s.remove();
    this.stack = [];
    this.root.hidden = true;
    this.rebinding = null;
  }

  back() {
    const top = this.stack.pop();
    top?.remove();
    const below = this.stack[this.stack.length - 1];
    if (below) {
      below.hidden = false;
      this.focusFirst(below);
    } else {
      this.root.hidden = true;
    }
    if (top?.dataset.screen === 'pause') this.actions.resume();
  }

  /** @param {HTMLElement} screen */
  push(screen) {
    for (const s of this.stack) s.hidden = true;
    this.stack.push(screen);
    this.root.append(screen);
    this.root.hidden = false;
    this.focusFirst(screen);
  }

  /**
   * @param {string} name
   * @param {string} html
   */
  screen(name, html) {
    const el = document.createElement('section');
    el.className = `menu-screen menu-${name}`;
    el.dataset.screen = name;
    el.innerHTML = html;
    el.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target).closest('[data-do]');
      if (!target) return;
      this.actions.sound('ui_confirm');
      this.run(/** @type {HTMLElement} */ (target).dataset.do ?? '');
    });
    return el;
  }

  /** @param {string} what */
  run(what) {
    switch (what) {
      case 'play':
        this.closeAll();
        this.actions.play();
        break;
      case 'resume':
        this.closeAll();
        this.actions.resume();
        break;
      case 'lab':
        this.closeAll();
        this.actions.openLab();
        break;
      case 'quit':
        this.actions.quit();
        break;
      case 'controls':
        this.push(this.controlsScreen());
        break;
      case 'settings':
        this.push(this.settingsScreen());
        break;
      case 'back':
        this.back();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- settings

  settingsScreen() {
    const s = settings.values;
    const el = this.screen('settings', `
      <h2>Settings</h2>
      <div class="form">
        <label class="row">Camera sensitivity <output></output><input type="range" name="sensitivity" min="0.25" max="3" step="0.05"></label>
        <label class="row check"><input type="checkbox" name="invertX"> Invert camera left / right</label>
        <label class="row check"><input type="checkbox" name="invertY"> Invert camera up / down</label>
        <label class="row check"><input type="checkbox" name="reducedMotion"> Reduced motion <small>(no camera shake or nudges, softer flashes)</small></label>
        <label class="row check"><input type="checkbox" name="captions"> Captions for sound cues</label>
        <label class="row check"><input type="checkbox" name="hints"> Show control hints</label>
        <label class="row">Master volume <output></output><input type="range" name="masterVolume" min="0" max="10" step="1"></label>
        <label class="row">Music volume <output></output><input type="range" name="musicVolume" min="0" max="10" step="1"></label>
        <label class="row">Effects volume <output></output><input type="range" name="sfxVolume" min="0" max="10" step="1"></label>
        <label class="row">On-screen touch controls
          <select name="touch"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></label>
      </div>
      <nav><button data-do="back">Back</button></nav>`);
    for (const input of el.querySelectorAll('input, select')) {
      const field = /** @type {HTMLInputElement} */ (input);
      const name = /** @type {keyof import('../settings.js').Settings} */ (field.name);
      const output = field.parentElement?.querySelector('output');
      const show = () => {
        if (output) output.textContent = name === 'sensitivity' ? `${Number(field.value).toFixed(2)}×` : field.value;
      };
      if (field.type === 'checkbox') field.checked = Boolean(s[name]);
      else field.value = String(s[name]);
      show();
      field.addEventListener('input', () => {
        const value = field.type === 'checkbox' ? field.checked : field.tagName === 'SELECT' ? field.value : Number(field.value);
        show();
        this.actions.applySettings(updateSettings({ [name]: value }));
      });
    }
    return el;
  }

  // ---------------------------------------------------------------- controls

  controlsScreen() {
    const el = this.screen('controls', `
      <h2>Controls</h2>
      <p class="note">Keyboard keys can be changed: choose <b>Change</b>, then press the new key (Esc cancels).
      Gamepads use the standard layout (Xbox, PlayStation, Switch Pro and most others). On a touch screen, the left
      thumb moves (the stick appears where you touch), dragging on the right turns the camera, and the buttons do the rest.</p>
      <table class="controls-table"><thead><tr><th>Action</th><th>Keyboard</th><th>Gamepad</th><th></th></tr></thead><tbody></tbody></table>
      <p class="status" aria-live="polite"></p>
      <nav><button data-do="reset-keys">Reset keys</button><button data-do="back">Back</button></nav>`);
    const tbody = /** @type {HTMLElement} */ (el.querySelector('tbody'));
    const status = /** @type {HTMLElement} */ (el.querySelector('.status'));
    const fill = () => {
      tbody.replaceChildren(
        ...REBINDABLE.map(({ action, label }) => {
          const row = document.createElement('tr');
          const keys = keysFor(settings.values.keys, action).map(keyLabel).join(' / ');
          const mouse = (DEFAULT_BINDINGS[action] ?? []).filter((b) => b.startsWith('mouse:')).map((b) => ['Left click', 'Middle click', 'Right click'][Number(b.slice(6))]);
          const pad = (DEFAULT_BINDINGS[action] ?? []).filter((b) => b.startsWith('btn:')).map((b) => PAD_LABELS[Number(b.slice(4))]).join(' / ');
          const stick = action.startsWith('move_') ? 'Left stick' : action.startsWith('look_') ? 'Right stick' : '';
          row.innerHTML = `<td>${label}</td><td>${[keys, ...mouse].filter(Boolean).join(' / ')}</td><td>${[stick, pad].filter(Boolean).join(' / ')}</td><td><button data-rebind="${action}">Change</button></td>`;
          return row;
        }),
      );
    };
    fill();
    el.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const action = t.dataset.rebind;
      if (action) {
        this.rebinding = { action, row: /** @type {HTMLElement} */ (t.closest('tr')) };
        t.textContent = 'Press a key…';
        status.textContent = '';
      }
      if (t.dataset.do === 'reset-keys') {
        this.actions.applySettings(updateSettings({ keys: {} }));
        status.textContent = 'Keys reset to the defaults.';
        fill();
      }
    });
    el.addEventListener('rebound', (/** @type {any} */ e) => {
      status.textContent = e.detail;
      fill();
    });
    return el;
  }

  /** @param {KeyboardEvent} e */
  onKey(e) {
    if (!this.isOpen) return;
    if (this.rebinding) {
      e.preventDefault();
      e.stopPropagation();
      const { action } = this.rebinding;
      const screen = this.stack[this.stack.length - 1];
      this.rebinding = null;
      if (e.code === 'Escape') {
        screen.dispatchEvent(new CustomEvent('rebound', { detail: 'Cancelled.' }));
        return;
      }
      const result = rebindKey(settings.values.keys, action, e.code);
      if (result.ok) this.actions.applySettings(updateSettings({ keys: result.keys }));
      screen.dispatchEvent(new CustomEvent('rebound', { detail: result.message }));
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.current !== 'title') this.back();
    } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      const active = /** @type {HTMLElement | null} */ (document.activeElement);
      if (active?.tagName === 'SELECT') return;
      e.preventDefault();
      this.moveFocus(e.code === 'ArrowDown' ? 1 : -1);
    }
  }

  /**
   * Gamepad navigation, called once per update while a menu is open.
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   * @param {boolean} fromPad  only act on gamepad input (the keyboard drives the page itself)
   */
  handlePad(frame, fromPad) {
    if (!fromPad || !this.isOpen || this.rebinding) return;
    const y = frame.move.y;
    const x = frame.move.x;
    if (this.padRepeat > 0) this.padRepeat--;
    if (Math.abs(y) > 0.5 && this.padRepeat === 0) {
      this.moveFocus(y < 0 ? 1 : -1);
      this.padRepeat = 12;
    } else if (Math.abs(y) <= 0.5 && Math.abs(x) <= 0.5) {
      this.padRepeat = 0;
    }
    const active = /** @type {HTMLInputElement | null} */ (document.activeElement);
    if (active?.type === 'range' && Math.abs(x) > 0.5 && this.padRepeat === 0) {
      const step = Number(active.step) || 1;
      active.value = String(Number(active.value) + (x > 0 ? step : -step));
      active.dispatchEvent(new Event('input'));
      this.padRepeat = 8;
    }
    if (button(frame, 'interact').pressed) active?.click();
    if (button(frame, 'roll').pressed && this.current !== 'title') this.back();
    if (button(frame, 'pause').pressed && this.current === 'pause') this.back();
  }

  /** @param {number} dir */
  moveFocus(dir) {
    const screen = this.stack[this.stack.length - 1];
    if (!screen) return;
    const items = /** @type {HTMLElement[]} */ ([...screen.querySelectorAll('button, input, select')]);
    if (items.length === 0) return;
    const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const next = items[(i + dir + items.length) % items.length];
    next.focus();
    this.actions.sound('ui_move');
  }

  /** @param {HTMLElement} screen */
  focusFirst(screen) {
    const first = /** @type {HTMLElement | null} */ (screen.querySelector('button.primary, button, input'));
    first?.focus({ preventScroll: true });
  }
}

/** Standard-mapping button names (Xbox / PlayStation) for the controls table. */
const PAD_LABELS = {
  0: 'A / ✕', 1: 'B / ○', 2: 'X / □', 3: 'Y / △', 4: 'LB / L1', 5: 'RB / R1', 6: 'LT / L2', 7: 'RT / R2',
  8: 'View / Share', 9: 'Menu / Options', 10: 'L3', 11: 'R3', 12: 'D-pad ↑', 13: 'D-pad ↓', 14: 'D-pad ←', 15: 'D-pad →',
};
