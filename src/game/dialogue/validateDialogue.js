import { CONDITION_KEYS } from '../adventure/conditions.js';
import { EFFECT_KEYS } from '../adventure/effects.js';
import { TEXT_PLACEHOLDERS } from './DialogueRunner.js';

/**
 * Ported from Island RPG (RDBagwell/rpg, src/game/dialogue/validateDialogue.js),
 * with this game's conditions and effects (shells, encounters, areas, the
 * ending) in place of the RPG's (gold, XP, battles, party, maps).
 *
 * Checks a dialogue file for mistakes a writer is likely to make:
 *
 *   - `start`, `next`, choice and branch targets that point at missing nodes
 *   - nodes that can never be reached from `start`
 *   - dead ends: a node with no `next`, no choices and no branch that
 *     doesn't say `"end": true` (or open a shop, travel, start a fight or the ending)
 *   - branch lists without a final fallback (no `if`), which could match nothing
 *   - unknown flags, item ids, encounters, shops, areas and spawns (catches typos)
 *   - unknown keys in nodes, choices, conditions and effects (typos again)
 *   - unknown {placeholders} in text
 *
 * Used by src/game/content/validateContent.js (run by `npm test`).
 */

const NODE_KEYS = ['speaker', 'text', 'next', 'choices', 'branch', 'effects', 'end'];
const CHOICE_KEYS = ['text', 'next', 'if', 'unavailable', 'showIf', 'effects', 'end'];
const BRANCH_KEYS = ['if', 'next'];

/**
 * @typedef {object} KnownIds
 * @property {Record<string, any>} flags
 * @property {Record<string, any>} items
 * @property {Record<string, any>} encounters
 * @property {Record<string, any>} [shops]
 * @property {Record<string, string[]>} [areas]  area id -> spawn names, for travel (skipped if missing)
 */

/**
 * @param {string} id  dialogue id (file name), for messages
 * @param {any} dialogue  parsed JSON
 * @param {KnownIds} known
 * @returns {string[]} errors (empty = valid)
 */
export function validateDialogue(id, dialogue, known) {
  /** @type {string[]} */
  const errors = [];
  const err = (/** @type {string} */ where, /** @type {string} */ message) => errors.push(`${id}: ${where}: ${message}`);

  if (!dialogue || typeof dialogue !== 'object' || Array.isArray(dialogue)) {
    return [`${id}: the file must contain one JSON object`];
  }
  for (const key of Object.keys(dialogue)) {
    if (!['speaker', 'start', 'nodes', '$comment'].includes(key)) err('top level', `unknown key "${key}"`);
  }
  const nodes = dialogue.nodes;
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) return [...errors, `${id}: "nodes" must be an object`];
  if (typeof dialogue.start !== 'string') err('top level', '"start" must name the first node');
  else if (!nodes[dialogue.start]) err('top level', `"start" points to missing node "${dialogue.start}"`);

  const target = (/** @type {string} */ where, /** @type {any} */ next) => {
    if (typeof next !== 'string') err(where, '"next" must be a node name');
    else if (!nodes[next]) err(where, `"next" points to missing node "${next}"`);
  };

  for (const [nodeId, node] of Object.entries(nodes)) {
    const where = `node "${nodeId}"`;
    if (!node || typeof node !== 'object') {
      err(where, 'must be an object');
      continue;
    }
    unknownKeys(node, NODE_KEYS, where, err);
    checkEffects(node.effects, where, known, err);
    checkText(node.text, where, err);
    checkText(node.speaker, where, err);
    for (const key of ['text', 'speaker']) {
      if (node[key] !== undefined && node[key] !== null && typeof node[key] !== 'string') err(where, `"${key}" must be text`);
    }

    const endsHere = node.end === true || endsConversation(node.effects) || hasEnd(node.effects);
    if (node.branch) {
      if (!Array.isArray(node.branch) || node.branch.length === 0) {
        err(where, '"branch" must be a list of { "if": ..., "next": ... }');
      } else {
        node.branch.forEach((b, i) => {
          const bw = `${where} branch ${i + 1}`;
          unknownKeys(b, BRANCH_KEYS, bw, err);
          target(bw, b.next);
          checkCondition(b.if, bw, known, err);
        });
        if (node.branch[node.branch.length - 1].if) {
          err(where, 'the last branch entry needs no "if" (a fallback), otherwise nothing may match');
        }
      }
      if (node.text || node.choices || node.next) err(where, 'a branch node can\'t also have text, choices or next');
      continue;
    }

    if (node.choices !== undefined) {
      if (!Array.isArray(node.choices) || node.choices.length === 0) {
        err(where, '"choices" must be a non-empty list');
      } else {
        node.choices.forEach((choice, i) => {
          const cw = `${where} choice ${i + 1}`;
          unknownKeys(choice, CHOICE_KEYS, cw, err);
          if (typeof choice.text !== 'string' || choice.text === '') err(cw, 'needs "text"');
          checkText(choice.text, cw, err);
          if (choice.next !== undefined) target(cw, choice.next);
          else if (!(choice.end === true || endsConversation(choice.effects) || hasEnd(choice.effects))) {
            err(cw, 'needs "next" or "end": true');
          }
          if (choice.unavailable !== undefined && !['hide', 'grey'].includes(choice.unavailable)) {
            err(cw, '"unavailable" must be "hide" or "grey"');
          }
          checkCondition(choice.if, cw, known, err);
          checkCondition(choice.showIf, cw, known, err);
          checkEffects(choice.effects, cw, known, err);
        });
        const alwaysAvailable = node.choices.some((c) => !c.if && !c.showIf);
        if (!alwaysAvailable) err(where, 'every choice has a condition; add one that is always available so the player can\'t get stuck');
      }
      if (node.next) err(where, 'has both "choices" and "next"; use one');
      continue;
    }

    if (typeof node.text !== 'string' || node.text === '') {
      if (!node.effects) err(where, 'needs "text" (or "branch" / "choices")');
    }
    if (node.next !== undefined) target(where, node.next);
    else if (!endsHere) err(where, 'is a dead end: add "next", "choices" or "end": true');
  }

  // Reachability from start.
  if (typeof dialogue.start === 'string' && nodes[dialogue.start]) {
    const seen = new Set([dialogue.start]);
    const queue = [dialogue.start];
    while (queue.length > 0) {
      const node = nodes[queue.shift()];
      if (!node || typeof node !== 'object') continue;
      const nexts = [node.next, ...(node.choices ?? []).map((c) => c?.next), ...(Array.isArray(node.branch) ? node.branch : []).map((b) => b?.next)];
      for (const next of nexts) {
        if (typeof next === 'string' && nodes[next] && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const nodeId of Object.keys(nodes)) {
      if (!seen.has(nodeId)) err(`node "${nodeId}"`, `can never be reached from "${dialogue.start}"`);
    }
  }
  return errors;
}

/**
 * @param {any} obj
 * @param {string[]} allowed
 * @param {string} where
 * @param {(where: string, message: string) => void} err
 */
export function unknownKeys(obj, allowed, where, err) {
  if (!obj || typeof obj !== 'object') {
    err(where, 'must be an object');
    return;
  }
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key) && key !== '$comment') err(where, `unknown key "${key}" (allowed: ${allowed.join(', ')})`);
  }
}

/**
 * @param {any} condition
 * @param {string} where
 * @param {KnownIds} known
 * @param {(where: string, message: string) => void} err
 */
export function checkCondition(condition, where, known, err) {
  if (condition === undefined) return;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    err(where, 'a condition must be an object like { "flag": "..." }');
    return;
  }
  for (const [key, value] of Object.entries(condition)) {
    if (!CONDITION_KEYS.includes(key)) {
      err(where, `unknown condition "${key}" (allowed: ${CONDITION_KEYS.join(', ')})`);
      continue;
    }
    if (key === 'flag' || key === 'notFlag') checkFlag(value, where, known, err);
    if (key === 'hasItem' || key === 'lacksItem') checkItem(value, where, known, err);
    if (['shells', 'shellsBelow', 'count'].includes(key) && !Number.isInteger(value)) {
      err(where, `"${key}" must be a whole number`);
    }
    if (key === 'any' || key === 'all') {
      if (!Array.isArray(value)) err(where, `"${key}" must be a list of conditions`);
      else value.forEach((c) => checkCondition(c, where, known, err));
    }
    if (key === 'not') checkCondition(value, where, known, err);
  }
}

/**
 * @param {any} effects
 * @param {string} where
 * @param {KnownIds} known
 * @param {(where: string, message: string) => void} err
 */
export function checkEffects(effects, where, known, err) {
  if (effects === undefined) return;
  if (!Array.isArray(effects)) {
    err(where, '"effects" must be a list');
    return;
  }
  for (const effect of effects) {
    if (!effect || typeof effect !== 'object') {
      err(where, 'each effect must be an object like { "setFlag": "..." }');
      continue;
    }
    for (const [key, value] of Object.entries(effect)) {
      if (!EFFECT_KEYS.includes(key)) {
        err(where, `unknown effect "${key}" (allowed: ${EFFECT_KEYS.join(', ')})`);
        continue;
      }
      if (key === 'setFlag' || key === 'clearFlag') checkFlag(value, where, known, err);
      if (key === 'giveItem' || key === 'takeItem') checkItem(value, where, known, err);
      if (key === 'encounter' && !Object.hasOwn(known.encounters, value)) err(where, `unknown encounter "${value}" (see data/encounters.js)`);
      if (key === 'shop' && !Object.hasOwn(known.shops ?? {}, value)) err(where, `unknown shop "${value}" (see data/shops.js)`);
      if (key === 'travel') checkTravel(value, effect.spawn, where, known, err);
      if (key === 'spawn' && effect.travel === undefined) err(where, '"spawn" goes with "travel"');
      if (['giveShells', 'takeShells', 'count'].includes(key) && !(Number.isInteger(value) && value > 0)) {
        err(where, `"${key}" must be a positive whole number`);
      }
    }
  }
}

/**
 * @param {any} flag
 * @param {string} where
 * @param {KnownIds} known
 * @param {(where: string, message: string) => void} err
 */
function checkFlag(flag, where, known, err) {
  if (!Object.hasOwn(known.flags, flag)) err(where, `unknown flag "${flag}" (add it to data/flags.js)`);
}

/**
 * @param {any} area
 * @param {any} spawn
 * @param {string} where
 * @param {KnownIds} known
 * @param {(where: string, message: string) => void} err
 */
function checkTravel(area, spawn, where, known, err) {
  if (typeof area !== 'string' || area === '') {
    err(where, '"travel" must be an area id');
    return;
  }
  if (spawn !== undefined && typeof spawn !== 'string') err(where, '"spawn" must be a spawn name');
  if (!known.areas) return;
  if (!known.areas[area]) {
    err(where, `unknown area "${area}" (see data/areas/)`);
    return;
  }
  const spawnName = spawn ?? 'start';
  if (!known.areas[area].includes(spawnName)) err(where, `area "${area}" has no spawn called "${spawnName}"`);
}

/**
 * @param {any} item
 * @param {string} where
 * @param {KnownIds} known
 * @param {(where: string, message: string) => void} err
 */
function checkItem(item, where, known, err) {
  if (!Object.hasOwn(known.items, item)) err(where, `unknown item "${item}" (see data/items.js)`);
}

/**
 * @param {any} text
 * @param {string} where
 * @param {(where: string, message: string) => void} err
 */
export function checkText(text, where, err) {
  if (typeof text !== 'string') return;
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    if (!TEXT_PLACEHOLDERS.includes(match[1])) {
      err(where, `unknown placeholder {${match[1]}} (allowed: ${TEXT_PLACEHOLDERS.map((p) => `{${p}}`).join(', ')})`);
    }
  }
}

/** Shops, travel, encounters and the ending end the conversation. @param {any} effects */
function endsConversation(effects) {
  return Array.isArray(effects) && effects.some((e) => e && (e.encounter || e.shop || e.travel || e.ending));
}

/** @param {any} effects */
function hasEnd(effects) {
  return Array.isArray(effects) && effects.some((e) => e && e.end === true);
}

/**
 * Check data/shops.js: every item exists, has a price, and isn't a key item.
 * @param {Record<string, any>} shops
 * @param {Record<string, any>} items
 * @returns {string[]}
 */
export function validateShops(shops, items) {
  /** @type {string[]} */
  const errors = [];
  for (const [id, shop] of Object.entries(shops)) {
    if (typeof shop.name !== 'string' || shop.name === '') errors.push(`shops.js: shop "${id}" needs a "name"`);
    for (const itemId of shop.items ?? []) {
      if (!items[itemId]) errors.push(`shops.js: shop "${id}" sells unknown item "${itemId}"`);
      else if (items[itemId].type === 'key') errors.push(`shops.js: shop "${id}" sells key item "${itemId}"`);
      else if (!Number.isInteger(shop.prices?.[itemId] ?? items[itemId].price)) errors.push(`shops.js: shop "${id}" sells "${itemId}", which has no price`);
    }
    for (const itemId of Object.keys(shop.prices ?? {})) {
      if (!(shop.items ?? []).includes(itemId)) errors.push(`shops.js: shop "${id}" has a price for "${itemId}" but doesn't sell it`);
    }
  }
  return errors;
}

/**
 * Check data/quests.js: every stage has text and a valid condition, and
 * `done` is a valid condition.
 * @param {Record<string, any>} quests
 * @param {KnownIds} known
 * @returns {string[]}
 */
export function validateQuests(quests, known) {
  /** @type {string[]} */
  const errors = [];
  const err = (/** @type {string} */ w, /** @type {string} */ m) => errors.push(`quests.js: ${w}: ${m}`);
  for (const [id, quest] of Object.entries(quests)) {
    const where = `quest "${id}"`;
    unknownKeys(quest, ['name', 'main', 'stages', 'done', 'doneText', '$comment'], where, err);
    if (typeof quest.name !== 'string' || quest.name === '') err(where, 'needs a "name"');
    if (!Array.isArray(quest.stages) || quest.stages.length === 0) {
      err(where, '"stages" must be a non-empty list of { "when": ..., "text": ... }');
    } else {
      quest.stages.forEach((stage, i) => {
        const sw = `${where} stage ${i + 1}`;
        unknownKeys(stage, ['when', 'text', '$comment'], sw, err);
        if (typeof stage.text !== 'string' || stage.text === '') err(sw, 'needs "text"');
        if (stage.when === undefined) err(sw, 'needs "when" (the condition that shows this stage)');
        checkCondition(stage.when, sw, known, err);
        checkText(stage.text, sw, err);
      });
    }
    if (quest.done === undefined) err(where, 'needs "done" (the condition that completes it)');
    checkCondition(quest.done, where, known, err);
    if (typeof quest.doneText !== 'string' || quest.doneText === '') err(where, 'needs "doneText"');
  }
  return errors;
}
