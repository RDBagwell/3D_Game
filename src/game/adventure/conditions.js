/**
 * Conditions: questions about the game state, written as plain objects so
 * they can live in JSON (dialogues) and in data files (quests, objects,
 * events). Ported from Island RPG (RDBagwell/rpg, src/game/rpg/conditions.js);
 * this game has shells instead of gold and no levels or party.
 *
 *   { "flag": "gate_open" }               the flag is set
 *   { "notFlag": "gate_open" }            the flag is not set
 *   { "hasItem": "tonic" }                holds at least one
 *   { "hasItem": "tonic", "count": 3 }    holds at least 3
 *   { "lacksItem": "hearth_key" }         holds none
 *   { "shells": 20 }                      has at least 20 shells
 *   { "shellsBelow": 20 }                 has fewer than 20 shells
 *
 * Several keys in one object must ALL be true:
 *   { "flag": "ina_met", "hasItem": "satchel" }
 *
 * For "either/or" and "not", nest:
 *   { "any": [ { "flag": "a" }, { "flag": "b" } ] }
 *   { "all": [ ... ] }
 *   { "not": { "hasItem": "tonic" } }
 */

export const CONDITION_KEYS = ['flag', 'notFlag', 'hasItem', 'lacksItem', 'count', 'shells', 'shellsBelow', 'any', 'all', 'not'];

/**
 * @typedef {object} ConditionContext
 * @property {(flag: string) => boolean} hasFlag
 * @property {(itemId: string) => number} itemCount
 * @property {() => number} shells
 */

/**
 * @param {import('./GameState.js').GameState} state
 * @returns {ConditionContext}
 */
export function conditionContext(state) {
  return {
    hasFlag: (flag) => state.flags.has(flag),
    itemCount: (id) => state.itemCount(id),
    shells: () => state.shells,
  };
}

/**
 * @param {Record<string, any> | undefined | null} condition  missing = always true
 * @param {ConditionContext} ctx
 * @returns {boolean}
 */
export function evaluateCondition(condition, ctx) {
  if (!condition) return true;
  for (const [key, value] of Object.entries(condition)) {
    let ok;
    switch (key) {
      case 'flag':
        ok = ctx.hasFlag(value);
        break;
      case 'notFlag':
        ok = !ctx.hasFlag(value);
        break;
      case 'hasItem':
        ok = ctx.itemCount(value) >= (condition.count ?? 1);
        break;
      case 'lacksItem':
        ok = ctx.itemCount(value) === 0;
        break;
      case 'count':
        ok = true; // used together with hasItem
        break;
      case 'shells':
        ok = ctx.shells() >= value;
        break;
      case 'shellsBelow':
        ok = ctx.shells() < value;
        break;
      case 'any':
        ok = value.some((/** @type {any} */ c) => evaluateCondition(c, ctx));
        break;
      case 'all':
        ok = value.every((/** @type {any} */ c) => evaluateCondition(c, ctx));
        break;
      case 'not':
        ok = !evaluateCondition(value, ctx);
        break;
      default:
        throw new Error(`Unknown condition "${key}"`);
    }
    if (!ok) return false;
  }
  return true;
}
