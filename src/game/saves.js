import { SaveSystem, validateShape } from '../engine/index.js';
import { GameState } from './adventure/GameState.js';
import { AREAS } from './data/areas/index.js';

/**
 * Save slots and the save format (Island RPG's approach: a versioned record
 * per slot, with migrations; see src/engine/save/SaveSystem.js).
 *
 * One record per slot holds everything about a playthrough
 * (GameState.toSaveData): flags, items, shells, where you are and your
 * checkpoint, how far each quest has got, and play time. Bump SAVE_VERSION
 * and add a migration whenever that shape changes, so old saves keep
 * working:
 *
 *   v1  area, spawn, checkpoint, flags, items, shells, questStages, playTime,
 *       position (optional: where you stood when you chose Save and quit)
 *   v2  + settings: the player's settings when they saved. Loading a slot
 *       restores the ones that belong to a playthrough (PLAYTHROUGH_SETTINGS:
 *       difficulty, assists, text speed, hold or toggle); volumes, graphics
 *       and keys stay as this browser has them. v1 saves get null (keep the
 *       current settings).
 *
 * Saving happens by itself at hearthstones and whenever you change area, and
 * from the pause menu (Save and quit). A damaged save is reported in its
 * slot and kept aside (SaveSystem copies it to "<key>:<slot>:corrupt"); it
 * never stops the game from starting.
 */

export const SAVE_VERSION = 2;

/** The three save slots. */
export const SAVE_SLOTS = ['slot1', 'slot2', 'slot3'];

/**
 * Upgrade functions: MIGRATIONS[n] turns a version-n save into version n+1.
 * @type {Record<number, (data: any) => any>}
 */
export const MIGRATIONS = {
  // v1 → v2: saves started carrying settings. Older ones have none to restore.
  1: (data) => ({ ...data, settings: null }),
};

/** Settings that belong to a playthrough, restored when its slot is loaded. */
export const PLAYTHROUGH_SETTINGS = /** @type {const} */ (['damageTaken', 'slowEnemies', 'autoLock', 'textSpeed', 'shieldMode', 'lockMode']);

/**
 * @param {any} data
 * @returns {string[]}
 */
export function validateSaveData(data) {
  const problems = validateShape(data, {
    area: 'string',
    spawn: 'string',
    checkpoint: { area: 'string', spawn: 'string' },
    flags: ['string'],
    items: 'object',
    shells: 'integer',
    questStages: 'object',
    playTime: 'number',
    position: 'object?',
    settings: 'any?',
  });
  if (data && !('settings' in data)) problems.push('data.settings is missing');
  if (data?.settings !== undefined && data.settings !== null && (typeof data.settings !== 'object' || Array.isArray(data.settings))) problems.push('data.settings should be an object or null');
  if (data?.position) problems.push(...validateShape(data.position, { x: 'number', y: 'number', z: 'number', yaw: 'number' }, 'data.position'));
  if (problems.length > 0) return problems;
  if (!Object.hasOwn(AREAS, data.area)) problems.push(`data.area "${data.area}" is not an area in this version of the game`);
  if (!Object.hasOwn(AREAS, data.checkpoint.area)) problems.push(`data.checkpoint.area "${data.checkpoint.area}" is not an area`);
  for (const [id, n] of Object.entries(data.items)) if (!Number.isInteger(n) || n < 0) problems.push(`data.items.${id} should be a whole number`);
  return problems;
}

/**
 * @param {import('../engine/core/storage.js').SimpleStorage | null} [storage]  default: localStorage (or memory if blocked)
 */
export function createSaves(storage) {
  return new SaveSystem({ key: 'emberwake', version: SAVE_VERSION, migrations: MIGRATIONS, validate: validateSaveData, storage });
}

/**
 * @typedef {object} SlotSummary
 * @property {string} slot
 * @property {string} label       "Slot 1"
 * @property {'ok' | 'empty' | 'unreadable'} status
 * @property {string} [problem]   why an unreadable slot can't be loaded
 * @property {string} [place]     the area's name
 * @property {number} [playTime]  seconds
 * @property {string} [savedAt]   ISO timestamp
 * @property {string} [progress]  "2 of 3 quests done" or similar
 */

/**
 * What's in each slot, for the title screen. Never throws.
 * @param {SaveSystem} saves
 * @returns {SlotSummary[]}
 */
export function slotSummaries(saves) {
  return SAVE_SLOTS.map((slot, i) => {
    const label = `Slot ${i + 1}`;
    const result = saves.load(slot);
    if (result.status === 'empty') return { slot, label, status: 'empty' };
    if (result.status !== 'ok') return { slot, label, status: 'unreadable', problem: result.warning };
    const data = result.data;
    const done = data.flags.includes('hearth_lit');
    return {
      slot,
      label,
      status: 'ok',
      place: AREAS[/** @type {keyof typeof AREAS} */ (data.area)]?.name ?? data.area,
      playTime: data.playTime,
      savedAt: result.savedAt,
      progress: done ? 'The Hearth is lit' : data.flags.includes('gate_open') ? 'The Hearth Halls' : 'Just arrived',
    };
  });
}

/**
 * The slot saved most recently, or null.
 * @param {SaveSystem} saves
 */
export function mostRecentSlot(saves) {
  let best = null;
  let bestTime = -Infinity;
  for (const s of slotSummaries(saves)) {
    if (s.status !== 'ok') continue;
    const t = s.savedAt ? Date.parse(s.savedAt) : 0;
    if (t > bestTime) {
      best = s.slot;
      bestTime = t;
    }
  }
  return best;
}

/**
 * Load a slot into a GameState, or explain why not.
 * @param {SaveSystem} saves
 * @param {string} slot
 * @returns {{ state: GameState | null, settings?: Record<string, any> | null, warning?: string, migratedFrom?: number }}
 */
export function loadGame(saves, slot) {
  const result = saves.load(slot);
  if (result.status !== 'ok') return { state: null, warning: result.warning ?? 'That slot is empty.' };
  const saved = result.data.settings;
  const settings = saved ? Object.fromEntries(PLAYTHROUGH_SETTINGS.filter((k) => k in saved).map((k) => [k, saved[k]])) : null;
  return { state: GameState.fromSaveData(result.data), settings, migratedFrom: result.migratedFrom };
}

/**
 * "1:05:09" or "5:09" for a play time in seconds.
 * @param {number} seconds
 */
export function formatPlayTime(seconds) {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
