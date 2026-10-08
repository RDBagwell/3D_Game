import { FEEL_SETTINGS, FEEL_GROUPS, FEEL_PRESETS, SHOW_SETTINGS, SPEEDS } from '../data/feel.js';
import { presetValues, matchingPreset, sanitizeFeel, labQuery } from '../feel/feelSettings.js';
import { TRANSITIONS } from '../player/Player.js';
import { totalFrames } from '../data/attacks.js';
import { attackPhase } from '../combat/hitboxes.js';

/**
 * The game-feel lab: a panel beside the game where every technique can be
 * switched or tuned while you play, with a "What this does" line under each
 * control, presets, slow motion, a share link, and views of the invisible
 * (the hero's state machine and the input buffer are drawn here; colliders,
 * hitboxes and the camera probe are drawn in the 3D view by WorldView).
 *
 * The panel only edits values. The game reads them every update, so a change
 * applies on the very next frame and can't break a fight in progress: there
 * is no "apply" step to get wrong.
 */

/**
 * @typedef {object} LabHooks
 * @property {() => import('../feel/feelSettings.js').FeelValues} getFeel
 * @property {(v: import('../feel/feelSettings.js').FeelValues) => void} setFeel
 * @property {() => import('../feel/feelSettings.js').ShowValues} getShow
 * @property {(v: import('../feel/feelSettings.js').ShowValues) => void} setShow
 * @property {() => void} onClose
 */

export class LabPanel {
  /**
   * @param {HTMLElement} container
   * @param {LabHooks} hooks
   */
  constructor(container, hooks) {
    this.hooks = hooks;
    this.root = document.createElement('aside');
    this.root.className = 'lab';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Game-feel lab');
    this.root.innerHTML = `
      <header>
        <h2>Game-feel lab</h2>
        <button class="lab-close" aria-label="Close the lab">✕</button>
      </header>
      <p class="lab-intro">Hit the training dummy, then switch a technique off and hit it again. Changes apply instantly.</p>
      <section class="lab-presets"><h3>Presets</h3><div class="preset-buttons"></div><p class="preset-what"></p></section>
      <section class="lab-tools">
        <div class="speed">Simulation speed <span class="speed-buttons"></span></div>
        <div class="share"><button class="share-btn">Copy share link</button><span class="share-status" aria-live="polite"></span></div>
      </section>
      <section class="lab-show"><h3>Show the invisible</h3><div class="show-list"></div></section>
      <section class="lab-states" hidden><h3>Hero state machine</h3><div class="state-now"></div><div class="state-grid"></div><ol class="state-history"></ol></section>
      <section class="lab-buffer" hidden><h3>Input buffer (last 2 s)</h3><canvas width="320" height="84"></canvas>
        <p class="legend"><b class="dot pressed"></b> pressed <b class="dot used"></b> used <b class="dot lost"></b> lost (too early, or not allowed) <b class="bar"></b> hit-stop</p></section>
      <div class="lab-groups"></div>`;
    container.append(this.root);

    /** @type {Map<string, { input: HTMLInputElement, output: HTMLElement | null }>} */
    this.controls = new Map();
    this.presetButtons = /** @type {HTMLElement} */ (this.root.querySelector('.preset-buttons'));
    this.presetWhat = /** @type {HTMLElement} */ (this.root.querySelector('.preset-what'));
    this.buildPresets();
    this.buildSpeed();
    this.buildShow();
    this.buildGroups();

    this.stateNow = /** @type {HTMLElement} */ (this.root.querySelector('.state-now'));
    this.stateGrid = /** @type {HTMLElement} */ (this.root.querySelector('.state-grid'));
    this.stateHistory = /** @type {HTMLElement} */ (this.root.querySelector('.state-history'));
    this.canvas = /** @type {HTMLCanvasElement} */ (this.root.querySelector('.lab-buffer canvas'));
    /** Ticks that were frozen in hit-stop (for the timeline). @type {Set<number>} */
    this.frozenTicks = new Set();

    /** @type {HTMLElement} */ (this.root.querySelector('.lab-close')).addEventListener('click', () => this.close());
    /** @type {HTMLElement} */ (this.root.querySelector('.share-btn')).addEventListener('click', () => this.share());
    this.refresh();
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open() {
    this.root.hidden = false;
    document.body.classList.add('lab-open');
    this.refresh();
  }

  close() {
    this.root.hidden = true;
    document.body.classList.remove('lab-open');
    this.hooks.onClose();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  buildPresets() {
    for (const [name, preset] of Object.entries(FEEL_PRESETS)) {
      const b = document.createElement('button');
      b.textContent = preset.label;
      b.dataset.preset = name;
      b.title = preset.what;
      b.addEventListener('click', () => {
        this.hooks.setFeel(presetValues(/** @type {keyof typeof FEEL_PRESETS} */ (name)));
        this.refresh();
        b.blur();
      });
      this.presetButtons.append(b);
    }
  }

  buildSpeed() {
    const box = /** @type {HTMLElement} */ (this.root.querySelector('.speed-buttons'));
    for (const speed of SPEEDS) {
      const b = document.createElement('button');
      b.textContent = speed === 1 ? '1×' : speed === 0.5 ? '½×' : '¼×';
      b.dataset.speed = String(speed);
      b.setAttribute('aria-label', `Speed ${speed}`);
      b.addEventListener('click', () => {
        this.hooks.setShow({ ...this.hooks.getShow(), speed });
        this.refresh();
        b.blur();
      });
      box.append(b);
    }
  }

  buildShow() {
    const list = /** @type {HTMLElement} */ (this.root.querySelector('.show-list'));
    for (const s of SHOW_SETTINGS) {
      const label = document.createElement('label');
      label.className = 'toggle';
      label.innerHTML = `<input type="checkbox" data-show="${s.id}"><span class="name">${s.label}</span><span class="what">${s.what}</span>`;
      const input = /** @type {HTMLInputElement} */ (label.querySelector('input'));
      input.addEventListener('change', () => {
        this.hooks.setShow({ ...this.hooks.getShow(), [s.id]: input.checked });
        this.refresh();
        input.blur();
      });
      list.append(label);
    }
  }

  buildGroups() {
    const groups = /** @type {HTMLElement} */ (this.root.querySelector('.lab-groups'));
    for (const group of FEEL_GROUPS) {
      const section = document.createElement('section');
      section.innerHTML = `<h3>${group}</h3>`;
      for (const def of FEEL_SETTINGS.filter((d) => d.group === group)) {
        const row = document.createElement('label');
        row.className = def.type === 'bool' ? 'toggle' : 'slider';
        if (def.type === 'bool') {
          row.innerHTML = `<input type="checkbox" data-feel="${def.id}"><span class="name">${def.label}</span><span class="what">${def.what}</span>`;
        } else {
          row.innerHTML = `<span class="name">${def.label} <output></output></span>
            <input type="range" data-feel="${def.id}" min="${def.min}" max="${def.max}" step="${def.step}">
            <span class="what">${def.what}</span>`;
        }
        const input = /** @type {HTMLInputElement} */ (row.querySelector('input'));
        const output = row.querySelector('output');
        input.addEventListener('input', () => {
          const value = def.type === 'bool' ? input.checked : Number(input.value);
          this.hooks.setFeel(sanitizeFeel({ ...this.hooks.getFeel(), [def.id]: value }));
          this.refresh();
        });
        // Give the keyboard back to the game once the mouse lets go of a control.
        input.addEventListener('change', () => input.blur());
        this.controls.set(def.id, { input, output });
        section.append(row);
      }
      groups.append(section);
    }
  }

  /** Show the current values. */
  refresh() {
    const feel = this.hooks.getFeel();
    const show = this.hooks.getShow();
    for (const def of FEEL_SETTINGS) {
      const c = this.controls.get(def.id);
      if (!c) continue;
      if (def.type === 'bool') c.input.checked = Boolean(feel[def.id]);
      else {
        c.input.value = String(feel[def.id]);
        if (c.output) c.output.textContent = formatValue(def, Number(feel[def.id]));
      }
    }
    const preset = matchingPreset(feel);
    for (const b of this.presetButtons.querySelectorAll('button')) b.classList.toggle('active', b.dataset.preset === preset);
    this.presetWhat.textContent = preset ? FEEL_PRESETS[/** @type {keyof typeof FEEL_PRESETS} */ (preset)].what : 'Custom: your own mix.';
    for (const input of this.root.querySelectorAll('[data-show]')) {
      const el = /** @type {HTMLInputElement} */ (input);
      el.checked = Boolean(show[el.dataset.show ?? '']);
    }
    for (const b of this.root.querySelectorAll('[data-speed]')) b.classList.toggle('active', Number(/** @type {HTMLElement} */ (b).dataset.speed) === show.speed);
    /** @type {HTMLElement} */ (this.root.querySelector('.lab-states')).hidden = !show.states;
    /** @type {HTMLElement} */ (this.root.querySelector('.lab-buffer')).hidden = !show.buffer;
  }

  async share() {
    const url = `${location.origin}${location.pathname}${labQuery(this.hooks.getFeel(), this.hooks.getShow())}`;
    const status = /** @type {HTMLElement} */ (this.root.querySelector('.share-status'));
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Copied.';
    } catch {
      status.textContent = 'The link is in the address bar.';
    }
    setTimeout(() => (status.textContent = ''), 2500);
  }

  /**
   * Per frame, while open: the state machine and the input buffer.
   * @param {import('../sim/Sandbox.js').Sandbox} sandbox
   */
  update(sandbox) {
    if (sandbox.hitstop > 0) this.frozenTicks.add(sandbox.tick);
    if (!this.isOpen) return;
    const show = this.hooks.getShow();
    if (show.states) this.drawStates(sandbox.player);
    if (show.buffer) this.drawBuffer(sandbox);
  }

  /** @param {import('../player/Player.js').Player} player */
  drawStates(player) {
    const fsm = player.fsm;
    let detail = `<b>${fsm.current}</b> · frame ${fsm.frames}`;
    if (fsm.is('attack') && player.attack) {
      const f = Math.max(0, player.attackFrameNow);
      detail = `<b>attack: ${player.attack.name}</b> · frame ${f + 1} / ${totalFrames(player.attack)} · <i>${attackPhase(player.attack, f)}</i>`;
    }
    if (player.isInvulnerable()) detail += ' · <span class="inv">invulnerable</span>';
    if (this.stateNow.innerHTML !== detail) this.stateNow.innerHTML = detail;
    const allowed = new Set(TRANSITIONS[fsm.current]);
    const key = `${fsm.current}`;
    if (this.stateGrid.dataset.key !== key) {
      this.stateGrid.dataset.key = key;
      this.stateGrid.replaceChildren(
        ...Object.keys(TRANSITIONS).map((s) => {
          const el = document.createElement('span');
          el.className = `state ${s === fsm.current ? 'current' : allowed.has(/** @type {any} */ (s)) ? 'allowed' : 'blocked'}`;
          el.textContent = s;
          el.title = s === fsm.current ? 'current state' : allowed.has(/** @type {any} */ (s)) ? 'can change to this' : 'not allowed from here';
          return el;
        }),
      );
    }
    const items = fsm.history.slice(-6).reverse().map((h) => `${h.from ?? 'start'} → ${h.to}`);
    const html = items.map((t) => `<li>${t}</li>`).join('');
    if (this.stateHistory.innerHTML !== html) this.stateHistory.innerHTML = html;
  }

  /** @param {import('../sim/Sandbox.js').Sandbox} sandbox */
  drawBuffer(sandbox) {
    const c = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));
    const W = this.canvas.width;
    const H = this.canvas.height;
    const span = 120;
    const now = sandbox.tick;
    const x = (/** @type {number} */ tick) => W - 8 - ((now - tick) / span) * (W - 70);
    const rows = { attack: 24, roll: 58 };
    c.clearRect(0, 0, W, H);
    c.font = '11px system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (const tick of this.frozenTicks) {
      if (tick < now - span) this.frozenTicks.delete(tick);
      else c.fillRect(x(tick) - 1, 4, 3, H - 8);
    }
    // The buffer window right now: presses inside it would still count.
    const feel = this.hooks.getFeel();
    for (const [action, y] of Object.entries(rows)) {
      const win = Number(action === 'attack' ? feel.comboBuffer : feel.rollBuffer);
      c.fillStyle = 'rgba(120,200,255,0.18)';
      c.fillRect(x(now - win) - 3, y - 10, x(now) - x(now - win) + 6, 20);
      c.fillStyle = '#cfd3ea';
      c.fillText(action, 4, y + 4);
      c.strokeStyle = 'rgba(255,255,255,0.15)';
      c.beginPath();
      c.moveTo(56, y);
      c.lineTo(W - 4, y);
      c.stroke();
    }
    for (const p of sandbox.buffer.presses) {
      const y = rows[/** @type {keyof typeof rows} */ (p.action)];
      if (y === undefined || p.tick < now - span) continue;
      const px = x(p.tick);
      if (p.usedAt !== null) {
        c.strokeStyle = '#7dffa8';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(px, y);
        c.lineTo(x(p.usedAt), y);
        c.stroke();
        c.fillStyle = '#7dffa8';
        dot(c, x(p.usedAt), y, 5);
      }
      const lost = p.usedAt === null && (p.expired || p.tick < now - Math.max(Number(feel.comboBuffer), Number(feel.rollBuffer)) - 1);
      c.fillStyle = lost ? '#ff7a7a' : '#ffd23f';
      dot(c, px, y, 4);
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} c
 * @param {number} x
 * @param {number} y
 * @param {number} r
 */
function dot(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/**
 * @param {import('../data/feel.js').FeelDef} def
 * @param {number} v
 */
function formatValue(def, v) {
  if (def.id === 'turnSpeed' && v >= 3600) return 'instant';
  if (def.unit === 'frames') return `${v} ${v === 1 ? 'frame' : 'frames'}${v ? ` (${Math.round((v / 60) * 1000)} ms)` : ''}`;
  if (def.unit === 's') return v === 0 ? 'off (instant)' : `${v.toFixed(2)} s`;
  if (def.unit === '×') return v === 0 ? 'off' : `${v.toFixed(1)}×`;
  if (def.unit) return `${v} ${def.unit}`;
  return v === 0 ? 'off' : v.toFixed(2);
}
