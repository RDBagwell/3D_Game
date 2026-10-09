import { keyLabel, keysFor } from '../settings.js';

/**
 * The in-game HUD, as DOM over the canvas:
 *
 *   - a health bar (top left): a bar with the number written on it, so it
 *     reads without relying on colour, and a pale "damage ghost" that drains
 *     after a hit so you can see how much you lost;
 *   - the lock-on reticle: four corner brackets around the target, with its
 *     name and health;
 *   - control hints (bottom) for the device you last touched: keyboard keys,
 *     or the right face-button names for an Xbox, PlayStation or Switch pad;
 *   - captions (bottom centre) for important sound cues;
 *   - a banner for messages ("Respawning", "The arena");
 *   - the interact prompt ("E  Talk · Elder Ina") when something is in reach;
 *   - the quick slot (tonics left, and the button that drinks one) and shells;
 *   - toasts for quest progress ("Quest updated: The Cold Hearth").
 */

/** Face-button names by pad style, for the standard mapping's button numbers. */
const PAD_NAMES = {
  xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 11: 'R3' },
  playstation: { 0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Share', 9: 'Options', 11: 'R3' },
  nintendo: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '−', 9: '+', 11: 'RS' },
  generic: { 0: 'Bottom', 1: 'Right', 2: 'Left', 3: 'Top', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Select', 9: 'Start', 11: 'R3' },
};

const HINT_ACTIONS = [
  ['attack', 'Attack'],
  ['roll', 'Roll'],
  ['shield', 'Shield'],
  ['lockOn', 'Lock on'],
  ['useItem', 'Tonic'],
  ['pause', 'Pause'],
];

export class Hud {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="health" role="meter" aria-label="Health" aria-valuemin="0">
        <div class="health-label">Vigor</div>
        <div class="health-bar"><div class="health-ghost"></div><div class="health-fill"></div><div class="health-text"></div></div>
      </div>
      <div class="purse" hidden><span class="purse-label">Shells</span> <b class="purse-count">0</b></div>
      <div class="preset-badge" title="Game-feel preset"></div>
      <div class="quickslot" hidden><kbd class="quickslot-key"></kbd><span class="quickslot-name">Tonic</span><b class="quickslot-count"></b></div>
      <div class="prompt" hidden><kbd class="prompt-key"></kbd> <span class="prompt-label"></span></div>
      <div class="toasts" aria-live="polite"></div>
      <div class="saved" hidden>Saved</div>
      <div class="boss" hidden role="meter" aria-label="Boss health"><div class="boss-name"></div><div class="boss-bar"><div class="boss-fill"></div><i class="boss-mark"></i></div></div>
      <div class="reticle" hidden><i></i><i></i><i></i><i></i><div class="reticle-name"></div><div class="reticle-hp"><div></div></div></div>
      <div class="banner" hidden></div>
      <div class="captions" aria-live="polite"></div>
      <div class="hints"></div>`;
    container.append(this.root);
    this.fill = /** @type {HTMLElement} */ (this.root.querySelector('.health-fill'));
    this.ghost = /** @type {HTMLElement} */ (this.root.querySelector('.health-ghost'));
    this.text = /** @type {HTMLElement} */ (this.root.querySelector('.health-text'));
    this.meter = /** @type {HTMLElement} */ (this.root.querySelector('.health'));
    this.badge = /** @type {HTMLElement} */ (this.root.querySelector('.preset-badge'));
    this.reticle = /** @type {HTMLElement} */ (this.root.querySelector('.reticle'));
    this.reticleName = /** @type {HTMLElement} */ (this.root.querySelector('.reticle-name'));
    this.reticleHp = /** @type {HTMLElement} */ (this.root.querySelector('.reticle-hp div'));
    this.banner = /** @type {HTMLElement} */ (this.root.querySelector('.banner'));
    this.captions = /** @type {HTMLElement} */ (this.root.querySelector('.captions'));
    this.hints = /** @type {HTMLElement} */ (this.root.querySelector('.hints'));
    this.purse = /** @type {HTMLElement} */ (this.root.querySelector('.purse'));
    this.purseCount = /** @type {HTMLElement} */ (this.root.querySelector('.purse-count'));
    this.quick = /** @type {HTMLElement} */ (this.root.querySelector('.quickslot'));
    this.quickKey = /** @type {HTMLElement} */ (this.root.querySelector('.quickslot-key'));
    this.quickCount = /** @type {HTMLElement} */ (this.root.querySelector('.quickslot-count'));
    this.prompt = /** @type {HTMLElement} */ (this.root.querySelector('.prompt'));
    this.promptKey = /** @type {HTMLElement} */ (this.root.querySelector('.prompt-key'));
    this.promptLabel = /** @type {HTMLElement} */ (this.root.querySelector('.prompt-label'));
    this.toasts = /** @type {HTMLElement} */ (this.root.querySelector('.toasts'));
    this.saved = /** @type {HTMLElement} */ (this.root.querySelector('.saved'));
    this.savedTimer = 0;
    this.boss = /** @type {HTMLElement} */ (this.root.querySelector('.boss'));
    this.bossName = /** @type {HTMLElement} */ (this.root.querySelector('.boss-name'));
    this.bossFill = /** @type {HTMLElement} */ (this.root.querySelector('.boss-fill'));
    this.ghostValue = 1;
    this.hintKey = '';
    this.bannerTimer = 0;
    this.promptText = '';
  }

  /**
   * The adventure's corner of the HUD: shells and the quick slot (hidden in the lab).
   * @param {{ shells: number, tonics: number } | null} info
   * @param {string} glyph  the button that drinks a tonic on the current device
   */
  updateInventory(info, glyph) {
    this.purse.hidden = !info;
    this.quick.hidden = !info;
    if (!info) return;
    this.purseCount.textContent = String(info.shells);
    this.quickCount.textContent = `×${info.tonics}`;
    this.quick.classList.toggle('empty', info.tonics === 0);
    this.quickKey.textContent = glyph;
    this.quickKey.hidden = !glyph;
  }

  /**
   * The boss's health across the top, once it has woken; a notch marks where
   * its second phase begins.
   * @param {{ def: { name: string, phaseTwoAt?: number }, hp: number, maxHp: number, brain: { phase?: number } } | null} boss
   */
  updateBoss(boss) {
    this.boss.hidden = !boss;
    if (!boss) return;
    this.bossName.textContent = boss.brain.phase === 2 ? `${boss.def.name}: enraged` : boss.def.name;
    this.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    this.boss.style.setProperty('--mark', `${(boss.def.phaseTwoAt ?? 0.5) * 100}%`);
    this.boss.setAttribute('aria-valuenow', String(Math.ceil(boss.hp)));
    this.boss.setAttribute('aria-valuemax', String(boss.maxHp));
  }

  /**
   * "E  Talk · Elder Ina": what Interact would do now, or nothing.
   * @param {string | null} label
   * @param {string} glyph
   */
  updatePrompt(label, glyph) {
    const text = label ? `${glyph}|${label}` : '';
    if (text === this.promptText) return;
    this.promptText = text;
    this.prompt.hidden = !label;
    if (!label) return;
    this.promptKey.textContent = glyph;
    this.promptKey.hidden = !glyph;
    this.promptLabel.textContent = label;
  }

  /**
   * A toast in the corner: quest progress.
   * @param {string} title
   * @param {string} text
   * @param {string} [kind]
   */
  toast(title, text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    const t = document.createElement('b');
    t.textContent = title;
    const p = document.createElement('span');
    p.textContent = text;
    el.append(t, p);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('leaving'), 5200);
    setTimeout(() => el.remove(), 5800);
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    this.root.hidden = !visible;
  }

  /**
   * @param {number} dt
   * @param {{ hp: number, maxHp: number }} player
   */
  updateHealth(dt, player) {
    const v = Math.max(0, player.hp / player.maxHp);
    this.fill.style.width = `${v * 100}%`;
    this.fill.classList.toggle('low', v <= 0.3);
    // The ghost waits, then drains towards the real value.
    if (v > this.ghostValue) this.ghostValue = v;
    else this.ghostValue = Math.max(v, this.ghostValue - dt * 0.35);
    this.ghost.style.width = `${this.ghostValue * 100}%`;
    this.text.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.meter.setAttribute('aria-valuenow', String(Math.ceil(player.hp)));
    this.meter.setAttribute('aria-valuemax', String(player.maxHp));
  }

  /**
   * @param {{ x: number, y: number } | null} screen
   * @param {{ def?: { name: string }, hp: number, maxHp: number, kind?: string } | null} target
   */
  updateReticle(screen, target) {
    if (!screen || !target) {
      this.reticle.hidden = true;
      return;
    }
    this.reticle.hidden = false;
    this.reticle.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
    this.reticleName.textContent = target.def?.name ?? '';
    const showHp = target.kind !== 'dummy';
    /** @type {HTMLElement} */ (this.reticleHp.parentElement).hidden = !showHp;
    if (showHp) this.reticleHp.style.width = `${(target.hp / target.maxHp) * 100}%`;
  }

  /** @param {string | null} name  null hides it */
  setPreset(name) {
    this.badge.hidden = !name;
    this.badge.textContent = name ? `Feel: ${name}` : '';
  }

  /**
   * @param {string} text
   * @param {number} [seconds=2.5]
   */
  showBanner(text, seconds = 2.5) {
    this.banner.textContent = text;
    this.banner.hidden = false;
    this.bannerTimer = seconds;
  }

  /** @param {string} text */
  caption(text) {
    // Several grunts noticing you at once is one caption, not three.
    const last = /** @type {HTMLElement | null} */ (this.captions.lastElementChild);
    if (last?.textContent === text && performance.now() - Number(last.dataset.at) < 1500) return;
    const line = document.createElement('div');
    line.dataset.at = String(performance.now());
    line.className = 'caption';
    line.textContent = text;
    this.captions.append(line);
    while (this.captions.children.length > 3) this.captions.firstElementChild?.remove();
    setTimeout(() => line.remove(), 2200);
  }

  /** A small "Saved" in the corner after an autosave. */
  flashSaved() {
    this.saved.hidden = false;
    this.savedTimer = 1.6;
  }

  /** @param {number} dt */
  tick(dt) {
    if (this.savedTimer > 0) {
      this.savedTimer -= dt;
      if (this.savedTimer <= 0) this.saved.hidden = true;
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.hidden = true;
    }
  }

  /**
   * Control hints for the current device.
   * @param {object} o
   * @param {'keyboard' | 'gamepad' | 'touch'} o.device
   * @param {string} o.padStyle
   * @param {Record<string, string[]>} o.keys  custom keys from settings
   * @param {Record<string, string[]>} o.bindings
   * @param {boolean} o.enabled
   */
  updateHints({ device, padStyle, keys, bindings, enabled }) {
    const key = `${device}:${padStyle}:${JSON.stringify(keys)}:${enabled}`;
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hints.hidden = !enabled || device === 'touch';
    if (this.hints.hidden) return;
    const parts = [];
    if (device === 'gamepad') parts.push(hint('Left stick', 'Move'), hint('Right stick', 'Camera'));
    else parts.push(hint('WASD', 'Move'), hint('Mouse / arrows', 'Camera'));
    for (const [action, label] of HINT_ACTIONS) {
      let glyph = glyphFor(action, { device, padStyle, keys, bindings });
      if (device !== 'gamepad' && action === 'attack') glyph += ' / Click';
      if (device !== 'gamepad' && action === 'shield') glyph += ' / Right-click';
      if (glyph) parts.push(hint(glyph, label));
    }
    this.hints.replaceChildren(...parts);
  }
}

/**
 * What to press for an action on the current device: a key ("E"), a pad
 * button ("A", "✕"), or "" on touch (the on-screen button says it).
 * @param {string} action
 * @param {{ device: string, padStyle: string, keys: Record<string, string[]>, bindings: Record<string, string[]> }} o
 */
export function glyphFor(action, { device, padStyle, keys, bindings }) {
  if (device === 'touch') return '';
  if (device === 'gamepad') {
    const names = PAD_NAMES[/** @type {keyof typeof PAD_NAMES} */ (padStyle)] ?? PAD_NAMES.generic;
    const btn = (bindings[action] ?? []).find((b) => b.startsWith('btn:'));
    return btn ? (/** @type {Record<number, string>} */ (names))[Number(btn.slice(4))] ?? btn : '';
  }
  const k = keysFor(keys, action)[0];
  return k ? keyLabel(k) : '';
}

/**
 * @param {string} glyph
 * @param {string} label
 */
function hint(glyph, label) {
  const el = document.createElement('span');
  el.className = 'hint';
  const k = document.createElement('kbd');
  k.textContent = glyph;
  el.append(k, ` ${label}`);
  return el;
}
