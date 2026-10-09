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
 * @property {() => QuestEntry[]} [quests]  the quest log (null outside the adventure)
 * @property {() => InventoryView | null} [inventory]
 * @property {(shopId: string, itemId: string) => { message: string, view: ShopView }} [buy]  buy one
 * @property {() => void} [closeShop]
 * @property {() => import('../saves.js').SlotSummary[]} [slots]
 * @property {(slot: string) => void} [newGame]
 * @property {(slot: string) => void} [loadGame]
 * @property {() => void} [continueGame]
 * @property {() => void} [saveAndQuit]
 * @property {() => import('../content/credits.js').Credit[]} [credits]
 * @property {() => void} [keepPlaying]
 * @property {() => { device: string, padStyle: string }} [device]  what the player is using now
 */

/** @typedef {{ name: string, text: string, done: boolean, main: boolean }} QuestEntry */
/** @typedef {{ name: string, rows: { id: string, name: string, description: string, price: number, have: number, max: number }[], shells: number }} ShopView */
/** @typedef {{ shells: number, items: { id: string, name: string, description: string, type: string, count: number }[] }} InventoryView */

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
    const slots = this.actions.slots?.() ?? [];
    const any = slots.some((x) => x.status === 'ok');
    this.push(this.screen('title', `
      <h1 class="logo">Ember<span>wake</span></h1>
      <p class="tagline">A short adventure on Cinder Isle, with a built-in game-feel lab</p>
      <nav>
        ${any ? '<button data-do="continue" class="primary">Continue</button>' : ''}
        <button data-do="new" class="${any ? '' : 'primary'}">New game</button>
        ${any ? '<button data-do="load">Load game</button>' : ''}
        <button data-do="lab">Game-feel lab</button>
        <button data-do="controls">Controls</button>
        <button data-do="settings">Settings</button>
        <button data-do="credits">Credits</button>
      </nav>
      <p class="credits">Characters, village and dungeon: KayKit by Kay Lousberg (CC0). Code, sounds, levels and story: made for this project.</p>`));
  }

  /**
   * The save slots, to start a new game in or to load.
   * @param {'new' | 'load'} mode
   */
  slotsScreen(mode) {
    const slots = this.actions.slots?.() ?? [];
    const el = this.screen('slots', `
      <h2>${mode === 'new' ? 'New game: choose a slot' : 'Load game'}</h2>
      <ul class="slot-list"></ul>
      <nav><button data-do="back">Back</button></nav>`);
    const list = /** @type {HTMLElement} */ (el.querySelector('.slot-list'));
    for (const slot of slots) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = `slot ${slot.status}`;
      const title = document.createElement('b');
      title.textContent = slot.label;
      const info = document.createElement('span');
      if (slot.status === 'ok') {
        const when = slot.savedAt ? new Date(slot.savedAt).toLocaleString() : '';
        info.textContent = `${slot.place} · ${slot.progress} · ${formatTime(slot.playTime ?? 0)}${when ? ` · ${when}` : ''}`;
      } else if (slot.status === 'empty') {
        info.textContent = 'Empty';
      } else {
        info.textContent = `Damaged save: ${slot.problem ?? 'it could not be read'}. ${mode === 'new' ? 'Starting here replaces it (a copy is kept).' : "It can't be loaded; start a new game in this slot."}`;
      }
      b.append(title, info);
      b.disabled = mode === 'load' && slot.status !== 'ok';
      b.addEventListener('click', () => {
        if (mode === 'load') return this.actions.loadGame?.(slot.slot);
        if (slot.status === 'ok') this.push(this.confirmScreen(`Start a new game in ${slot.label}? The save there will be replaced.`, () => this.actions.newGame?.(slot.slot)));
        else this.actions.newGame?.(slot.slot);
      });
      li.append(b);
      list.append(li);
    }
    return el;
  }

  /**
   * @param {string} question
   * @param {() => void} yes
   */
  confirmScreen(question, yes) {
    const el = this.screen('confirm', `
      <h2>Are you sure?</h2>
      <p class="note"></p>
      <nav><button data-do="back" class="primary">No</button><button data-yes>Yes</button></nav>`);
    /** @type {HTMLElement} */ (el.querySelector('.note')).textContent = question;
    /** @type {HTMLElement} */ (el.querySelector('[data-yes]')).addEventListener('click', yes);
    return el;
  }

  /**
   * The credits, from ASSETS.md. After the ending, with Keep playing.
   * @param {boolean} [ending]
   */
  creditsScreen(ending = false) {
    const credits = this.actions.credits?.() ?? [];
    const el = this.screen('credits', `
      <h2>${ending ? 'Thank you for playing Emberwake' : 'Credits'}</h2>
      <ul class="credit-list"></ul>
      <nav>${ending ? '<button data-do="keep-playing" class="primary">Keep playing</button><button data-do="quit">Title screen</button>' : '<button data-do="back" class="primary">Back</button>'}</nav>`);
    const list = /** @type {HTMLElement} */ (el.querySelector('.credit-list'));
    for (const c of credits) {
      const li = document.createElement('li');
      const w = document.createElement('b');
      w.textContent = c.work;
      const by = document.createElement('span');
      by.textContent = `${c.by}${c.licence ? ` · ${c.licence}` : ''}`;
      li.append(w, by);
      for (const link of c.links) {
        const a = document.createElement('a');
        a.href = link.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = link.text;
        li.append(a);
      }
      list.append(li);
    }
    return el;
  }

  /** The end of the story: the credits over the lit Hearth. */
  showEnding() {
    this.closeAll();
    this.push(this.creditsScreen(true));
  }

  showPause() {
    this.closeAll();
    const adventure = Boolean(this.actions.inventory?.());
    this.push(this.screen('pause', `
      <h2>Paused</h2>
      <nav>
        <button data-do="resume" class="primary">Resume</button>
        ${adventure ? '<button data-do="quests">Quests</button><button data-do="inventory">Inventory</button>' : ''}
        <button data-do="settings">Settings</button>
        <button data-do="lab">Game-feel lab</button>
        <button data-do="controls">Controls</button>
        ${adventure ? '<button data-do="save-quit">Save and quit</button>' : '<button data-do="quit">Quit to title</button>'}
      </nav>`));
  }

  /** The quest log: the main quest first, then side quests; finished ones greyed. */
  questsScreen() {
    const quests = this.actions.quests?.() ?? [];
    const el = this.screen('quests', `
      <h2>Quests</h2>
      <ul class="quest-log"></ul>
      <nav><button data-do="back" class="primary">Back</button></nav>`);
    const list = /** @type {HTMLElement} */ (el.querySelector('.quest-log'));
    if (quests.length === 0) list.innerHTML = '<li class="empty">Nothing yet. Talk to people in the village.</li>';
    for (const q of quests) {
      const li = document.createElement('li');
      li.className = `${q.done ? 'done' : ''} ${q.main ? 'main' : ''}`;
      const h = document.createElement('h3');
      h.textContent = `${q.main ? 'Main quest: ' : ''}${q.name}${q.done ? ' (complete)' : ''}`;
      const p = document.createElement('p');
      p.textContent = q.text;
      li.append(h, p);
      list.append(li);
    }
    return el;
  }

  /** What you carry: shells, the quick slot, upgrades and key items. */
  inventoryScreen() {
    const inv = this.actions.inventory?.() ?? { shells: 0, items: [] };
    const el = this.screen('inventory', `
      <h2>Inventory</h2>
      <p class="purse-line">Shells: <b></b></p>
      <ul class="item-list"></ul>
      <nav><button data-do="back" class="primary">Back</button></nav>`);
    /** @type {HTMLElement} */ (el.querySelector('.purse-line b')).textContent = String(inv.shells);
    const list = /** @type {HTMLElement} */ (el.querySelector('.item-list'));
    const kinds = { consumable: 'Quick slot', upgrade: 'Upgrade (always on)', key: 'Key item' };
    for (const item of inv.items) {
      const li = document.createElement('li');
      const h = document.createElement('h3');
      h.textContent = item.count > 1 ? `${item.name} ×${item.count}` : item.name;
      const tag = document.createElement('small');
      tag.textContent = kinds[/** @type {keyof typeof kinds} */ (item.type)] ?? '';
      const p = document.createElement('p');
      p.textContent = item.description;
      li.append(h, tag, p);
      list.append(li);
    }
    if (inv.items.length === 0) list.innerHTML = '<li class="empty">Empty pockets.</li>';
    return el;
  }

  /**
   * A shop, opened from dialogue. Buying is one press per item.
   * @param {string} shopId
   * @param {ShopView} view
   */
  showShop(shopId, view) {
    this.closeAll();
    const el = this.screen('shop', `
      <h2></h2>
      <p class="purse-line">Shells: <b></b></p>
      <ul class="shop-list"></ul>
      <p class="status" aria-live="polite"></p>
      <nav><button data-do="close-shop" class="primary">Done</button></nav>`);
    /** @type {HTMLElement} */ (el.querySelector('h2')).textContent = view.name;
    const fill = (/** @type {typeof view} */ v) => {
      /** @type {HTMLElement} */ (el.querySelector('.purse-line b')).textContent = String(v.shells);
      const list = /** @type {HTMLElement} */ (el.querySelector('.shop-list'));
      list.replaceChildren(
        ...v.rows.map((r) => {
          const li = document.createElement('li');
          const b = document.createElement('button');
          b.dataset.buy = r.id;
          b.textContent = `Buy ${r.name}: ${r.price} shells`;
          b.disabled = v.shells < r.price || r.have >= r.max;
          const p = document.createElement('p');
          p.textContent = `${r.description} You have ${r.have} (most ${r.max}).`;
          li.append(b, p);
          return li;
        }),
      );
    };
    fill(view);
    el.addEventListener('click', (e) => {
      const id = /** @type {HTMLElement} */ (e.target).dataset?.buy;
      if (!id || !this.actions.buy) return;
      const result = this.actions.buy(shopId, id);
      /** @type {HTMLElement} */ (el.querySelector('.status')).textContent = result.message;
      fill(result.view);
      /** @type {HTMLElement | null} */ (el.querySelector(`[data-buy="${id}"]:not(:disabled)`) ?? el.querySelector('[data-do="close-shop"]'))?.focus();
    });
    this.push(el);
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
    if (top?.dataset.screen === 'shop') this.actions.closeShop?.();
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
      case 'quests':
        this.push(this.questsScreen());
        break;
      case 'inventory':
        this.push(this.inventoryScreen());
        break;
      case 'close-shop':
        this.closeAll();
        this.actions.closeShop?.();
        break;
      case 'continue':
        this.actions.continueGame?.();
        break;
      case 'new': {
        // No saves at all: straight into slot 1.
        const slots = this.actions.slots?.() ?? [];
        if (slots.every((x) => x.status === 'empty')) this.actions.newGame?.(slots[0]?.slot ?? 'slot1');
        else this.push(this.slotsScreen('new'));
        break;
      }
      case 'load':
        this.push(this.slotsScreen('load'));
        break;
      case 'credits':
        this.push(this.creditsScreen());
        break;
      case 'save-quit':
        this.actions.saveAndQuit?.();
        break;
      case 'keep-playing':
        this.closeAll();
        this.actions.keepPlaying?.();
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
        <fieldset><legend>Audio</legend>
          <label class="row">Master volume <output></output><input type="range" name="masterVolume" min="0" max="10" step="1"></label>
          <label class="row">Music volume <output></output><input type="range" name="musicVolume" min="0" max="10" step="1"></label>
          <label class="row">Effects volume <output></output><input type="range" name="sfxVolume" min="0" max="10" step="1"></label>
        </fieldset>
        <fieldset><legend>Camera</legend>
          <label class="row">Camera sensitivity <output></output><input type="range" name="sensitivity" min="0.25" max="3" step="0.05"></label>
          <label class="row check"><input type="checkbox" name="invertX"> Invert camera left / right</label>
          <label class="row check"><input type="checkbox" name="invertY"> Invert camera up / down</label>
        </fieldset>
        <fieldset><legend>Controls</legend>
          <label class="row">Shield
            <select name="shieldMode"><option value="hold">Hold the button</option><option value="toggle">Press to raise / lower</option></select></label>
          <label class="row">Lock-on
            <select name="lockMode"><option value="toggle">Press to lock / let go</option><option value="hold">Locked while held</option></select></label>
          <label class="row">On-screen touch controls
            <select name="touch"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></label>
        </fieldset>
        <fieldset><legend>Accessibility and difficulty</legend>
          <label class="row">Damage you take
            <select name="damageTaken"><option value="1">Full (as designed)</option><option value="0.75">Three quarters</option><option value="0.5">Half</option></select></label>
          <label class="row check"><input type="checkbox" name="slowEnemies"> Slower enemies <small>(longer wind-ups, slower feet)</small></label>
          <label class="row check"><input type="checkbox" name="autoLock"> Auto lock-on <small>(locks on to an enemy that comes for you)</small></label>
          <label class="row">Dialogue text speed
            <select name="textSpeed"><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option></select></label>
          <label class="row check"><input type="checkbox" name="reducedMotion"> Reduced motion <small>(no camera shake or nudges, softer flashes)</small></label>
          <label class="row check"><input type="checkbox" name="captions"> Captions for sound cues</label>
          <label class="row check"><input type="checkbox" name="hints"> Show control hints</label>
        </fieldset>
        <fieldset><legend>Graphics</legend>
          <label class="row">Quality
            <select name="quality"><option value="low">Low (no shadows, shorter view)</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        </fieldset>
      </div>
      <nav><button data-do="back">Back</button></nav>`);
    for (const input of el.querySelectorAll('input, select')) {
      const field = /** @type {HTMLInputElement} */ (input);
      const name = /** @type {keyof import('../settings.js').Settings} */ (field.name);
      const output = field.parentElement?.querySelector('output');
      const numeric = field.type === 'range' || name === 'damageTaken';
      const show = () => {
        if (output) output.textContent = name === 'sensitivity' ? `${Number(field.value).toFixed(2)}×` : field.value;
      };
      if (field.type === 'checkbox') field.checked = Boolean(s[name]);
      else field.value = String(s[name]);
      show();
      field.addEventListener('input', () => {
        const value = field.type === 'checkbox' ? field.checked : numeric ? Number(field.value) : field.value;
        show();
        this.actions.applySettings(updateSettings({ [name]: value }));
      });
    }
    return el;
  }

  // ---------------------------------------------------------------- controls

  controlsScreen() {
    const { device, padStyle } = this.actions.device?.() ?? { device: 'keyboard', padStyle: 'xbox' };
    const intro = {
      keyboard: 'You\'re on keyboard and mouse: click the game to steer the camera with the mouse. Keys can be changed: choose <b>Change</b>, then press the new key (Esc cancels).',
      gamepad: `You're on a gamepad (${padStyle === 'playstation' ? 'PlayStation' : padStyle === 'nintendo' ? 'Switch' : 'Xbox'} layout). Any pad with the standard layout works: Xbox, PlayStation, Switch Pro and most others.`,
      touch: 'You\'re on a touch screen: the left thumb moves (the stick appears where you touch), dragging on the right turns the camera, and the buttons on the right do the rest.',
    }[/** @type {'keyboard' | 'gamepad' | 'touch'} */ (device)] ?? '';
    const el = this.screen('controls', `
      <h2>Controls</h2>
      <p class="note">${intro}</p>
      ${device === 'touch' ? `<ul class="touch-legend">
        <li><b>Left thumb</b> move</li><li><b>Drag on the right</b> camera</li><li><b>Attack</b> attack (tap again to combo)</li>
        <li><b>Roll</b> roll</li><li><b>Shield</b> hold to block</li><li><b>Lock</b> lock on</li><li><b>Use</b> talk, open, use</li>
        <li><b>Tonic</b> drink a tonic</li><li><b>II</b> pause</li><li><b>Lab</b> the game-feel lab</li></ul>` : ''}
      <table class="controls-table device-${device}"><thead><tr><th>Action</th><th>Keyboard</th><th>Gamepad</th><th></th></tr></thead><tbody></tbody></table>
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
    // Drop-downs: left / right steps through the options.
    if (active?.tagName === 'SELECT' && Math.abs(x) > 0.5 && this.padRepeat === 0) {
      const select = /** @type {HTMLSelectElement} */ (/** @type {unknown} */ (active));
      const i = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + (x > 0 ? 1 : -1)));
      if (i !== select.selectedIndex) {
        select.selectedIndex = i;
        select.dispatchEvent(new Event('input'));
        this.actions.sound('ui_move');
      }
      this.padRepeat = 12;
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

/**
 * "1:05:09" or "5:09".
 * @param {number} seconds
 */
function formatTime(seconds) {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Standard-mapping button names (Xbox / PlayStation) for the controls table. */
const PAD_LABELS = {
  0: 'A / ✕', 1: 'B / ○', 2: 'X / □', 3: 'Y / △', 4: 'LB / L1', 5: 'RB / R1', 6: 'LT / L2', 7: 'RT / R2',
  8: 'View / Share', 9: 'Menu / Options', 10: 'L3', 11: 'R3', 12: 'D-pad ↑', 13: 'D-pad ↓', 14: 'D-pad ←', 15: 'D-pad →',
};
