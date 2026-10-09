import { browserStorage, readJson, writeJson } from '../engine/index.js';
import { DEFAULT_BINDINGS, REBINDABLE, STORAGE } from './config.js';

/**
 * Player settings: camera, accessibility, volume, touch controls and keyboard
 * keys. Kept in the browser under "3d:settings", separate from the game-feel
 * lab's values. Anything missing or invalid falls back to the default (the
 * same approach as Island RPG's settings).
 */

/**
 * @typedef {object} Settings
 * @property {number} sensitivity  0.25..3
 * @property {boolean} invertX
 * @property {boolean} invertY
 * @property {boolean} reducedMotion  no shake or nudges, softer flashes
 * @property {boolean} captions  subtitles for important sound cues
 * @property {number} masterVolume  0..10
 * @property {number} musicVolume   0..10
 * @property {number} sfxVolume     0..10
 * @property {'auto' | 'on' | 'off'} touch
 * @property {boolean} hints  show control hints on the HUD
 * @property {'slow' | 'normal' | 'fast' | 'instant'} textSpeed  how fast dialogue types out
 * @property {'low' | 'medium' | 'high'} quality  graphics: shadows, resolution, draw distance, particles
 * @property {number} damageTaken  0.5, 0.75 or 1: how much of an enemy's damage you take (assist)
 * @property {boolean} autoLock  lock on to an enemy by itself when one comes for you (assist)
 * @property {boolean} slowEnemies  longer wind-ups, slower enemies (assist)
 * @property {'hold' | 'toggle'} shieldMode  hold the button to keep the shield up, or press to raise / lower it
 * @property {'toggle' | 'hold'} lockMode  press to lock on / off, or lock only while the button is held
 * @property {Record<string, string[]>} keys  action -> keyboard codes, only actions the player changed
 */

/**
 * A sensible starting quality for this device: phones and tablets start on
 * Low, small or old computers on Medium, the rest on High.
 * @returns {'low' | 'medium' | 'high'}
 */
export function defaultQuality() {
  if (typeof matchMedia === 'undefined') return 'high';
  if (matchMedia('(pointer: coarse)').matches) return 'low';
  const nav = /** @type {any} */ (globalThis.navigator ?? {});
  if ((nav.deviceMemory && nav.deviceMemory <= 4) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4)) return 'medium';
  return 'high';
}

/** @returns {Settings} */
export function defaultSettings() {
  const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    sensitivity: 1,
    invertX: false,
    invertY: false,
    reducedMotion: prefersReduced,
    captions: true,
    masterVolume: 8,
    musicVolume: 6,
    sfxVolume: 8,
    touch: 'auto',
    hints: true,
    textSpeed: 'normal',
    quality: defaultQuality(),
    damageTaken: 1,
    autoLock: false,
    slowEnemies: false,
    shieldMode: 'hold',
    lockMode: 'toggle',
    keys: {},
  };
}

/**
 * @param {any} raw
 * @returns {Settings}
 */
export function sanitizeSettings(raw) {
  const s = defaultSettings();
  if (!raw || typeof raw !== 'object') return s;
  if (typeof raw.sensitivity === 'number' && raw.sensitivity >= 0.25 && raw.sensitivity <= 3) s.sensitivity = Math.round(raw.sensitivity * 20) / 20;
  for (const key of /** @type {const} */ (['invertX', 'invertY', 'reducedMotion', 'captions', 'hints'])) {
    if (typeof raw[key] === 'boolean') s[key] = raw[key];
  }
  for (const key of /** @type {const} */ (['masterVolume', 'musicVolume', 'sfxVolume'])) {
    if (Number.isInteger(raw[key]) && raw[key] >= 0 && raw[key] <= 10) s[key] = raw[key];
  }
  if (['auto', 'on', 'off'].includes(raw.touch)) s.touch = raw.touch;
  if (['slow', 'normal', 'fast', 'instant'].includes(raw.textSpeed)) s.textSpeed = raw.textSpeed;
  if (['low', 'medium', 'high'].includes(raw.quality)) s.quality = raw.quality;
  if ([0.5, 0.75, 1].includes(raw.damageTaken)) s.damageTaken = raw.damageTaken;
  for (const key of /** @type {const} */ (['autoLock', 'slowEnemies'])) {
    if (typeof raw[key] === 'boolean') s[key] = raw[key];
  }
  if (['hold', 'toggle'].includes(raw.shieldMode)) s.shieldMode = raw.shieldMode;
  if (['hold', 'toggle'].includes(raw.lockMode)) s.lockMode = raw.lockMode;
  if (raw.keys && typeof raw.keys === 'object') {
    for (const { action } of REBINDABLE) {
      const codes = raw.keys[action];
      if (Array.isArray(codes) && codes.length > 0 && codes.every((c) => typeof c === 'string' && /^[A-Za-z0-9]+$/.test(c))) {
        s.keys[action] = [...new Set(codes)];
      }
    }
  }
  return s;
}

export const settings = {
  /** @type {Settings} */
  values: defaultSettings(),
  /** @type {import('../engine/core/storage.js').SimpleStorage | null} */
  storage: null,
};

/** @param {import('../engine/core/storage.js').SimpleStorage | null} [storage] */
export function loadSettings(storage = browserStorage()) {
  settings.storage = storage;
  settings.values = sanitizeSettings(readJson(storage, STORAGE.settings));
  return settings.values;
}

/** @param {Partial<Settings>} changes */
export function updateSettings(changes) {
  settings.values = sanitizeSettings({ ...settings.values, ...changes });
  writeJson(settings.storage, STORAGE.settings, settings.values);
  return settings.values;
}

/**
 * The full bindings: defaults with the player's keyboard keys swapped in
 * (mouse and gamepad bindings stay).
 * @param {Record<string, string[]>} keys
 */
export function bindingsFor(keys) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [action, list] of Object.entries(DEFAULT_BINDINGS)) {
    const custom = keys[action];
    out[action] = custom ? [...custom.map((c) => `key:${c}`), ...list.filter((b) => !b.startsWith('key:'))] : [...list];
  }
  return out;
}

/**
 * @param {Record<string, string[]>} keys
 * @param {string} action
 * @returns {string[]}
 */
export function keysFor(keys, action) {
  return keys[action] ?? (DEFAULT_BINDINGS[action] ?? []).filter((b) => b.startsWith('key:')).map((b) => b.slice(4));
}

/** Keys that can't be rebound: Escape (cancels "press a key") and the debug keys. */
export function reservedKeys() {
  return new Set(['Escape', ...keysFor({}, 'debug')]);
}

/**
 * Give `action` a new main key. Another action using that key loses it; if
 * that leaves it keyless it takes the replaced key (a swap).
 * @param {Record<string, string[]>} keys
 * @param {string} action
 * @param {string} code
 * @returns {{ keys: Record<string, string[]>, ok: boolean, message: string }}
 */
export function rebindKey(keys, action, code) {
  const label = REBINDABLE.find((r) => r.action === action)?.label ?? action;
  if (reservedKeys().has(code)) return { keys, ok: false, message: `${keyLabel(code)} is reserved. Pick another key.` };
  const current = keysFor(keys, action);
  if (current[0] === code) return { keys, ok: true, message: `${label} is already ${keyLabel(code)}.` };
  /** @type {Record<string, string[]>} */
  const next = { ...keys };
  const replaced = current[0];
  next[action] = [code, ...current.slice(1).filter((c) => c !== code)];
  let message = `${label}: ${keyLabel(code)}.`;
  for (const other of REBINDABLE) {
    if (other.action === action) continue;
    const theirs = keysFor(next, other.action);
    if (!theirs.includes(code)) continue;
    const remaining = theirs.filter((c) => c !== code);
    if (remaining.length > 0) {
      next[other.action] = remaining;
      message += ` (${keyLabel(code)} no longer does ${other.label}.)`;
    } else {
      next[other.action] = replaced ? [replaced] : remaining;
      message += ` Swapped with ${other.label}, now ${keyLabel(replaced)}.`;
    }
  }
  return { keys: next, ok: true, message };
}

/**
 * A short name for a key code: 'KeyW' -> 'W', 'ArrowUp' -> '↑'.
 * @param {string} code
 */
export function keyLabel(code) {
  /** @type {Record<string, string>} */
  const names = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Space: 'Space', Enter: 'Enter',
    Tab: 'Tab', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
    AltLeft: 'L Alt', AltRight: 'R Alt', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/',
    Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backspace: 'Backspace',
  };
  if (names[code]) return names[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return code;
}
