import { FEEL_SETTINGS, FEEL_PRESETS, SHOW_SETTINGS, SPEEDS } from '../data/feel.js';

/**
 * The lab's live values: validation, presets, saving and sharing.
 *
 * Values are a flat object `{ accelTime: 0.1, cancelWindows: true, ... }`.
 * Anything read from storage or a URL goes through `sanitizeFeel`, which
 * keeps valid values (numbers clamped to their range and snapped to the step)
 * and defaults the rest, so a bad link can't break the game.
 *
 * Sharing: `feelToQuery(values)` writes only what differs from Polished, e.g.
 * `?lab&feel=hitstopScale:0,cancelWindows:0`, and `feelFromQuery` reads it
 * back. Booleans are 1/0. The same goes for the "show" options.
 */

/** @typedef {Record<string, number | boolean>} FeelValues */
/** @typedef {Record<string, any>} ShowValues  flags by SHOW_SETTINGS id (booleans), plus `speed` (a number from SPEEDS) */

const BY_ID = new Map(FEEL_SETTINGS.map((d) => [d.id, d]));

/** @returns {FeelValues} */
export function defaultFeel() {
  return Object.fromEntries(FEEL_SETTINGS.map((d) => [d.id, d.default]));
}

/**
 * @param {any} raw
 * @returns {FeelValues}
 */
export function sanitizeFeel(raw) {
  const values = defaultFeel();
  if (!raw || typeof raw !== 'object') return values;
  for (const def of FEEL_SETTINGS) {
    const v = raw[def.id];
    if (def.type === 'bool') {
      if (typeof v === 'boolean') values[def.id] = v;
      else if (v === 1 || v === 0 || v === '1' || v === '0') values[def.id] = v === 1 || v === '1';
    } else {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n === 'number' && Number.isFinite(n)) values[def.id] = snap(n, def);
    }
  }
  return values;
}

/**
 * @param {number} n
 * @param {import('../data/feel.js').FeelDef} def
 */
function snap(n, def) {
  const min = def.min ?? -Infinity;
  const max = def.max ?? Infinity;
  const clamped = Math.min(max, Math.max(min, n));
  if (!def.step) return clamped;
  const stepped = Math.round((clamped - min) / def.step) * def.step + min;
  // Round away floating-point dust (0.30000000000000004).
  return Math.min(max, Number(stepped.toFixed(6)));
}

/**
 * @param {keyof typeof FEEL_PRESETS} name
 * @returns {FeelValues}
 */
export function presetValues(name) {
  const preset = FEEL_PRESETS[name];
  return sanitizeFeel({ ...defaultFeel(), ...(preset?.values ?? {}) });
}

/**
 * Which preset these values match exactly, or null ("Custom").
 * @param {FeelValues} values
 * @returns {string | null}
 */
export function matchingPreset(values) {
  for (const name of Object.keys(FEEL_PRESETS)) {
    const preset = presetValues(/** @type {keyof typeof FEEL_PRESETS} */ (name));
    if (FEEL_SETTINGS.every((d) => preset[d.id] === values[d.id])) return name;
  }
  return null;
}

/**
 * @param {FeelValues} values
 * @returns {string}  e.g. "hitstopScale:0,cancelWindows:0" ('' when all default)
 */
export function encodeFeel(values) {
  const parts = [];
  for (const def of FEEL_SETTINGS) {
    const v = values[def.id];
    if (v === def.default) continue;
    parts.push(`${def.id}:${typeof v === 'boolean' ? (v ? 1 : 0) : v}`);
  }
  return parts.join(',');
}

/**
 * @param {string} text
 * @returns {FeelValues}
 */
export function decodeFeel(text) {
  /** @type {Record<string, string>} */
  const raw = {};
  for (const part of (text ?? '').split(',')) {
    const [id, value] = part.split(':');
    if (id && value !== undefined && BY_ID.has(id)) raw[id] = value;
  }
  return sanitizeFeel(raw);
}

/** @returns {ShowValues} */
export function defaultShow() {
  return { ...Object.fromEntries(SHOW_SETTINGS.map((s) => [s.id, s.id === 'damage'])), speed: 1 };
}

/**
 * @param {any} raw
 * @returns {ShowValues}
 */
export function sanitizeShow(raw) {
  const show = defaultShow();
  if (!raw || typeof raw !== 'object') return show;
  for (const s of SHOW_SETTINGS) if (typeof raw[s.id] === 'boolean') show[s.id] = raw[s.id];
  if (SPEEDS.includes(raw.speed)) show.speed = raw.speed;
  return show;
}

/**
 * The query string for sharing the current lab setup.
 * @param {FeelValues} feel
 * @param {ShowValues} show
 */
export function labQuery(feel, show) {
  const params = ['lab'];
  const preset = matchingPreset(feel);
  if (preset && preset !== 'polished') params.push(`preset=${preset}`);
  else if (!preset) params.push(`feel=${encodeFeel(feel)}`);
  const on = Object.entries(show).filter(([k, v]) => k !== 'speed' && v === true).map(([k]) => k);
  const defaults = defaultShow();
  const differs = Object.entries(show).some(([k, v]) => defaults[k] !== v);
  if (differs) params.push(`show=${on.join(',')}`);
  if (show.speed && show.speed !== 1) params.push(`speed=${show.speed}`);
  return `?${params.join('&')}`;
}

/**
 * Read the lab setup from a URL query, if it has one.
 * @param {string} search  location.search
 * @returns {{ open: boolean, feel: FeelValues | null, show: ShowValues | null }}
 */
export function readLabQuery(search) {
  const params = new URLSearchParams(search);
  const open = params.has('lab');
  /** @type {FeelValues | null} */
  let feel = null;
  const preset = params.get('preset');
  if (preset && Object.hasOwn(FEEL_PRESETS, preset)) feel = presetValues(/** @type {any} */ (preset));
  if (params.has('feel')) feel = decodeFeel(params.get('feel') ?? '');
  /** @type {ShowValues | null} */
  let show = null;
  if (params.has('show') || params.has('speed')) {
    const on = new Set((params.get('show') ?? '').split(',').filter(Boolean));
    const base = params.has('show') ? Object.fromEntries(SHOW_SETTINGS.map((s) => [s.id, on.has(s.id)])) : defaultShow();
    show = sanitizeShow({ ...base, speed: Number(params.get('speed') ?? 1) });
  }
  return { open, feel, show };
}
