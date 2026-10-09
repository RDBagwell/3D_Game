import { ITEMS } from '../data/items.js';

/**
 * Effects: changes to the game state, written as plain objects so they can
 * live in JSON. A list runs top to bottom. Ported from Island RPG
 * (RDBagwell/rpg, src/game/rpg/effects.js), with shells instead of gold, no
 * XP or party, and this game's own actions (encounters, the ending).
 *
 *   { "setFlag": "gate_open" }
 *   { "clearFlag": "trial_running" }
 *   { "giveItem": "tonic", "count": 2 }        count defaults to 1
 *   { "takeItem": "satchel" }
 *   { "giveShells": 20 }
 *   { "takeShells": 12 }
 *   { "heal": true }                           full health
 *   { "shop": "bram" }                         open a shop (data/shops.js) when the conversation closes
 *   { "travel": "halls", "spawn": "start" }    go to an area when the conversation closes
 *   { "encounter": "ring_trial" }              start a fight (data/encounters.js) when the conversation closes
 *   { "ending": true }                         play the ending when the conversation closes
 *   { "end": true }                            end the conversation here
 */

export const EFFECT_KEYS = ['setFlag', 'clearFlag', 'giveItem', 'takeItem', 'count', 'giveShells', 'takeShells', 'heal', 'shop', 'travel', 'spawn', 'encounter', 'ending', 'end'];

/**
 * @typedef {object} EffectResult
 * @property {string[]} notices  short messages for the player ("Received 2 Ember Tonics.")
 * @property {boolean} heal      restore the player's health
 * @property {string | null} shop       a shop to open once the conversation closes
 * @property {{ area: string, spawn: string } | null} travel  where to go once the conversation closes
 * @property {string | null} encounter  a fight to start once the conversation closes
 * @property {boolean} ending
 * @property {boolean} end
 */

/** @returns {EffectResult} */
export function emptyResult() {
  return { notices: [], heal: false, shop: null, travel: null, encounter: null, ending: false, end: false };
}

/**
 * @param {Record<string, any>[] | undefined} effects
 * @param {import('./GameState.js').GameState} state
 * @returns {EffectResult}
 */
export function applyEffects(effects, state) {
  const result = emptyResult();
  for (const effect of effects ?? []) {
    for (const [key, value] of Object.entries(effect)) {
      switch (key) {
        case 'setFlag':
          state.flags.add(value);
          break;
        case 'clearFlag':
          state.flags.delete(value);
          break;
        case 'giveItem': {
          const count = effect.count ?? 1;
          const item = ITEMS[value];
          const added = state.addItem(value, count, item.stack);
          if (added > 0) result.notices.push(`Received ${added > 1 ? `${added} ${item.name}s` : item.name}.`);
          if (added < count) result.notices.push(`You can't carry any more ${item.name}s.`);
          break;
        }
        case 'takeItem': {
          const count = effect.count ?? 1;
          if (state.removeItem(value, count)) {
            const name = ITEMS[value].name;
            result.notices.push(`Handed over ${count > 1 ? `${count} ${name}s` : name}.`);
          }
          break;
        }
        case 'count':
          break; // read by giveItem / takeItem
        case 'giveShells':
          state.shells += value;
          result.notices.push(`Received ${value} shells.`);
          break;
        case 'takeShells':
          state.shells = Math.max(0, state.shells - value);
          result.notices.push(`Paid ${value} shells.`);
          break;
        case 'heal':
          if (value) {
            result.heal = true;
            result.notices.push('You feel restored.');
          }
          break;
        case 'shop':
          result.shop = value;
          result.end = true;
          break;
        case 'travel':
          result.travel = { area: value, spawn: effect.spawn ?? 'start' };
          result.end = true;
          break;
        case 'spawn':
          break; // read by travel
        case 'encounter':
          result.encounter = value;
          result.end = true;
          break;
        case 'ending':
          if (value) {
            result.ending = true;
            result.end = true;
          }
          break;
        case 'end':
          if (value) result.end = true;
          break;
        default:
          throw new Error(`Unknown effect "${key}"`);
      }
    }
  }
  return result;
}
