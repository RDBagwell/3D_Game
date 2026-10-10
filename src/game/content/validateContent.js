import { validateDialogue, validateShops, validateQuests, checkCondition, checkEffects, checkText, unknownKeys } from '../dialogue/validateDialogue.js';
import { DialogueRunner } from '../dialogue/DialogueRunner.js';
import { GameState } from '../adventure/GameState.js';
import { conditionContext, evaluateCondition } from '../adventure/conditions.js';
import { applyEffects } from '../adventure/effects.js';

/**
 * Checks all of the game's content together, the way Island RPG's
 * tools/validate-dialogues.mjs does, plus a reachability check:
 *
 *   - every dialogue (broken links, dead ends, unknown flags, items, shops,
 *     encounters, areas and spawns, typos in keys: validateDialogue.js)
 *   - quests, shops, items, events, encounters, NPCs and objects
 *   - every area: each NPC, object, enemy and trigger placed in it exists in
 *     data, every exit leads to an area and spawn that exist, every model
 *     is in the asset manifest
 *   - reachability: from a new game, by talking to everyone (every choice),
 *     opening, striking and beating everything that can be reached, every
 *     quest can be completed and every flag that is checked can be set
 *
 * Run by tests/content.test.js (so by `npm test`). It returns a list of
 * problems in plain words; empty means all is well.
 */

/**
 * @typedef {object} Content
 * @property {Record<string, any>} dialogues
 * @property {Record<string, any>} flags
 * @property {Record<string, any>} items
 * @property {Record<string, any>} quests
 * @property {Record<string, any>} shops
 * @property {Record<string, any>} encounters
 * @property {Record<string, any>} events
 * @property {Record<string, any>} npcs
 * @property {Record<string, any>} objects
 * @property {Record<string, import('../world/buildArea.js').AreaDef>} areas
 * @property {Record<string, any>} enemies   ENEMIES from actors.js
 * @property {Record<string, any>} models    MODELS from assets.js
 * @property {{ area: string, spawn: string }} start
 * @property {Record<string, number>} startItems
 */

const OBJECT_TYPES = ['gate', 'door', 'chest', 'switch', 'pickup', 'hearthstone', 'hearth', 'breakable', 'sign', 'tablet'];
const ITEM_TYPES = ['consumable', 'upgrade', 'key'];

/**
 * @param {Content} c
 * @returns {string[]}
 */
export function validateContent(c) {
  /** @type {string[]} */
  const errors = [];
  const spawns = Object.fromEntries(Object.entries(c.areas).map(([id, a]) => [id, Object.keys(a.spawns).length ? Object.keys(a.spawns) : ['start']]));
  const known = { flags: c.flags, items: c.items, encounters: c.encounters, shops: c.shops, areas: spawns };
  const err = (/** @type {string} */ file) => (/** @type {string} */ where, /** @type {string} */ message) => errors.push(`${file}: ${where}: ${message}`);

  for (const [id, dialogue] of Object.entries(c.dialogues)) errors.push(...validateDialogue(id, dialogue, known));
  errors.push(...validateShops(c.shops, c.items));
  errors.push(...validateQuests(c.quests, known));

  // Items.
  for (const [id, item] of Object.entries(c.items)) {
    const e = err('items.js');
    if (!ITEM_TYPES.includes(item.type)) e(`item "${id}"`, `type must be one of ${ITEM_TYPES.join(', ')}`);
    if (typeof item.name !== 'string' || !item.description) e(`item "${id}"`, 'needs a name and a description');
    if (item.type === 'consumable' && !(item.heal > 0)) e(`item "${id}"`, 'a consumable needs "heal"');
    if (item.type === 'upgrade' && !(item.maxHp > 0 || item.damage > 1 || (item.guard > 0 && item.guard < 1))) e(`item "${id}"`, 'an upgrade needs "maxHp", "damage" or "guard"');
  }
  for (const id of Object.keys(c.startItems)) if (!c.items[id]) err('items.js')('START_ITEMS', `unknown item "${id}"`);

  // NPCs.
  for (const [id, npc] of Object.entries(c.npcs)) {
    const e = err('npcs.js');
    if (!c.models[npc.model]) e(`npc "${id}"`, `unknown model "${npc.model}" (see MODELS in assets.js)`);
    if (!c.dialogues[npc.dialogue]) e(`npc "${id}"`, `unknown dialogue "${npc.dialogue}" (no data/dialogues/${npc.dialogue}.json)`);
    for (const [i, bark] of (npc.barks ?? []).entries()) {
      if (typeof bark.text !== 'string' || !bark.text) e(`npc "${id}" bark ${i}`, 'needs "text"');
      checkCondition(bark.if, `npc "${id}" bark ${i}`, known, e);
    }
  }

  // Objects.
  for (const [id, o] of Object.entries(c.objects)) {
    const e = err('objects.js');
    const where = `object "${id}"`;
    unknownKeys(o, ['type', 'name', 'model', 'openModel', 'scale', 'openScale', 'fragile', 'drops', 'solid', 'openIf', 'showIf', 'prompt', 'dialogue', 'hitEffects', 'checkpoint'], where, e);
    if (!OBJECT_TYPES.includes(o.type)) e(where, `type must be one of ${OBJECT_TYPES.join(', ')}`);
    for (const key of ['model', 'openModel']) if (o[key] && !c.models[o[key]]) e(where, `unknown ${key} "${o[key]}"`);
    if (o.dialogue && !c.dialogues[o.dialogue]) e(where, `unknown dialogue "${o.dialogue}"`);
    checkCondition(o.openIf, where, known, e);
    checkCondition(o.showIf, where, known, e);
    checkEffects(o.hitEffects, where, known, e);
    if (o.type === 'switch' && !o.hitEffects) e(where, 'a switch needs "hitEffects"');
    if (o.type === 'hearthstone' && !o.checkpoint) e(where, 'a hearthstone needs "checkpoint" (a spawn name)');
    if (['gate', 'door', 'chest'].includes(o.type) && !o.openIf) e(where, `a ${o.type} needs "openIf"`);
    if (['sign', 'tablet'].includes(o.type) && !o.dialogue) e(where, `a ${o.type} needs "dialogue" (what it says)`);
    if ((o.fragile || o.drops) && o.type !== 'breakable') e(where, '"fragile" and "drops" are for breakable objects');
    if (o.drops && !(Number.isInteger(o.drops.shells) && o.drops.shells > 0)) e(where, '"drops" must be { shells: <a whole number above 0> }');
  }

  // Encounters.
  for (const [id, enc] of Object.entries(c.encounters)) {
    const e = err('encounters.js');
    const where = `encounter "${id}"`;
    const area = c.areas[enc.area];
    if (!area) e(where, `unknown area "${enc.area}"`);
    for (const wave of enc.waves ?? []) {
      for (const foe of wave) {
        if (!c.enemies[foe.type]) e(where, `unknown enemy type "${foe.type}"`);
        if (area && !area.markers?.[foe.at]) e(where, `area "${enc.area}" has no marker "${foe.at}"`);
      }
    }
    if (!enc.waves?.length) e(where, 'needs at least one wave');
    checkEffects(enc.win, where, known, e);
  }

  // Events (triggers).
  for (const [id, ev] of Object.entries(c.events)) {
    const e = err('events.js');
    const where = `event "${id}"`;
    unknownKeys(ev, ['if', 'once', 'effects', 'banner', '$comment'], where, e);
    checkCondition(ev.if, where, known, e);
    checkEffects(ev.effects, where, known, e);
    if (ev.once !== undefined && !Object.hasOwn(c.flags, ev.once)) e(where, `unknown flag "${ev.once}" in "once"`);
    if (ev.banner !== undefined) checkText(ev.banner, where, e);
  }

  // Areas: what's placed in them must exist.
  for (const [areaId, area] of Object.entries(c.areas)) {
    const e = err(`areas/${areaId}.js`);
    if (area.id !== areaId) e('top level', `"id" is "${area.id}", but the area is listed as "${areaId}"`);
    const objectIds = new Set((area.objects ?? []).map((o) => o.id));
    const behind = (/** @type {string} */ where, /** @type {string | undefined} */ id) => {
      if (id === undefined) return;
      if (!objectIds.has(id)) e(where, `"behind" names "${id}", which isn't an object in this area`);
      else if (!['gate', 'door'].includes(c.objects[id]?.type)) e(where, `"behind" names "${id}", which isn't a gate or door`);
    };
    for (const n of area.npcs ?? []) {
      if (!c.npcs[n.id]) e(`npc "${n.id}"`, 'no such NPC in data/npcs.js');
      behind(`npc "${n.id}"`, n.behind);
    }
    for (const o of area.objects ?? []) {
      if (!c.objects[o.id]) e(`object "${o.id}"`, 'no such object in data/objects.js');
      behind(`object "${o.id}"`, o.behind);
      const cp = c.objects[o.id]?.checkpoint;
      if (cp && !spawns[areaId].includes(cp)) e(`object "${o.id}"`, `its checkpoint "${cp}" isn't a spawn in this area`);
    }
    for (const en of area.enemies ?? []) {
      const where = `enemy "${en.name}"`;
      if (en.type !== 'dummy' && !c.enemies[en.type]) e(where, `unknown enemy type "${en.type}" (see ENEMIES in actors.js)`);
      checkCondition(en.unless, where, known, e);
      checkEffects(en.defeat, where, known, e);
      behind(where, en.behind);
    }
    for (const x of area.exits ?? []) {
      const where = `exit to "${x.to}"`;
      if (!c.areas[x.to]) e(where, 'no such area');
      else if (!spawns[x.to].includes(x.spawn ?? 'start')) e(where, `area "${x.to}" has no spawn "${x.spawn ?? 'start'}"`);
      behind(where, x.behind);
    }
    for (const t of area.triggers ?? []) if (!c.events[t.id]) e(`trigger "${t.id}"`, 'has no event in data/events.js');
    for (const p of area.props ?? []) if (!c.models[p.model]) e(`prop "${p.model}"`, 'unknown model (see MODELS in assets.js)');
    if (!['day', 'halls'].includes(area.look)) e('top level', '"look" must be "day" or "halls"');
  }
  if (!c.areas[c.start.area] || !spawns[c.start.area]?.includes(c.start.spawn)) errors.push(`areas/index.js: START leads to a missing area or spawn`);

  if (errors.length === 0) errors.push(...checkReachability(c));
  return errors;
}

// ---------------------------------------------------------------------------- reachability

/**
 * Explore every state a player can reach from a new game, assuming they win
 * every fight, and check that each quest can be completed and each flag that
 * something checks can be set.
 *
 * A state is the flags and items held (shells are tracked but don't make a
 * state new). From each state the player can: talk to any NPC or use any
 * object they can reach (trying every path through its dialogue), strike a
 * switch, beat an enemy that has defeat effects, win an encounter started
 * from dialogue. "Reach" follows exits between areas and the `behind` gates
 * in the area data.
 * @param {Content} c
 * @returns {string[]}
 */
export function checkReachability(c) {
  const start = new GameState();
  for (const [id, n] of Object.entries(c.startItems)) start.addItem(id, n);
  /** @type {Map<string, GameState>} */
  const seen = new Map([[stateKey(start), start]]);
  const queue = [start];
  let explored = 0;
  while (queue.length > 0 && explored < 4000) {
    const state = /** @type {GameState} */ (queue.shift());
    explored++;
    for (const next of successors(state, c)) {
      const key = stateKey(next);
      if (!seen.has(key)) {
        seen.set(key, next);
        queue.push(next);
      }
    }
  }
  /** @type {string[]} */
  const errors = [];
  if (queue.length > 0) errors.push(`reachability: gave up after exploring ${explored} states (is something looping?)`);
  const states = [...seen.values()];
  for (const [id, quest] of Object.entries(c.quests)) {
    if (!states.some((s) => evaluateCondition(quest.done, conditionContext(s)))) {
      errors.push(`reachability: quest "${id}" (${quest.name}) can't be completed from a new game`);
    }
    quest.stages.forEach((/** @type {any} */ stage, /** @type {number} */ i) => {
      if (!states.some((s) => evaluateCondition(stage.when, conditionContext(s)))) errors.push(`reachability: quest "${id}" stage ${i + 1} can never show`);
    });
  }
  const everSet = new Set(states.flatMap((s) => [...s.flags]));
  for (const flag of Object.keys(c.flags)) {
    if (!everSet.has(flag) && !eventFlags(c).has(flag)) errors.push(`reachability: flag "${flag}" is never set by anything the player can reach`);
  }
  return errors;
}

/** Flags set by trigger events (walking somewhere): reachable whenever their area is. @param {Content} c */
function eventFlags(c) {
  return new Set(Object.values(c.events).map((e) => e.once).filter(Boolean));
}

/** @param {GameState} s */
function stateKey(s) {
  return `${[...s.flags].sort().join(',')}|${[...s.items].filter(([, n]) => n > 0).map(([id, n]) => `${id}:${n}`).sort().join(',')}`;
}

/** @param {GameState} s */
function clone(s) {
  const t = new GameState();
  t.flags = new Set(s.flags);
  t.items = new Map(s.items);
  t.shells = s.shells;
  return t;
}

/**
 * Everything the player can reach in this state: areas, then the NPCs,
 * objects and enemies in them that aren't behind a closed gate.
 * @param {GameState} state
 * @param {Content} c
 */
function reachable(state, c) {
  const ctx = conditionContext(state);
  const isOpen = (/** @type {string} */ id) => evaluateCondition(c.objects[id]?.openIf, ctx);
  const ok = (/** @type {{ behind?: string }} */ p) => !p.behind || isOpen(p.behind);
  const areas = new Set([c.start.area]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of [...areas]) {
      for (const x of c.areas[id].exits ?? []) {
        if (ok(x) && !areas.has(x.to)) {
          areas.add(x.to);
          changed = true;
        }
      }
    }
  }
  const placed = [...areas].map((id) => c.areas[id]);
  return {
    npcs: placed.flatMap((a) => (a.npcs ?? []).filter(ok)),
    objects: placed.flatMap((a) => (a.objects ?? []).filter(ok)),
    enemies: placed.flatMap((a) => (a.enemies ?? []).filter(ok)),
  };
}

/**
 * @param {GameState} state
 * @param {Content} c
 * @returns {GameState[]}
 */
function successors(state, c) {
  const ctx = conditionContext(state);
  const r = reachable(state, c);
  /** @type {GameState[]} */
  const out = [];
  /** @type {string[]} */
  const dialogues = r.npcs.map((n) => c.npcs[n.id].dialogue);
  for (const p of r.objects) {
    const o = c.objects[p.id];
    if (o.showIf && !evaluateCondition(o.showIf, ctx)) continue;
    const open = o.openIf ? evaluateCondition(o.openIf, ctx) : false;
    if (o.dialogue && !(open && o.type !== 'hearth')) dialogues.push(o.dialogue);
    if (o.type === 'switch' && !open && o.hitEffects) {
      const next = clone(state);
      applyEffects(o.hitEffects, next);
      out.push(next);
    }
  }
  for (const id of new Set(dialogues)) out.push(...dialogueOutcomes(id, state, c));
  for (const en of r.enemies) {
    if (!en.defeat || (en.unless && evaluateCondition(en.unless, ctx))) continue;
    const next = clone(state);
    applyEffects(en.defeat, next);
    out.push(next);
  }
  return out;
}

/**
 * Every way a conversation can end: each path of choices, with what it
 * changed (and the effects of any encounter it started, as if won).
 * @param {string} id
 * @param {GameState} state
 * @param {Content} c
 */
function dialogueOutcomes(id, state, c) {
  /** @type {GameState[]} */
  const out = [];
  /** @type {number[][]} */
  const paths = [[]];
  let runs = 0;
  while (paths.length > 0 && runs < 500) {
    const path = /** @type {number[]} */ (paths.pop());
    runs++;
    const s = clone(state);
    const runner = new DialogueRunner(c.dialogues[id], s, id).start();
    let step = 0;
    for (let guard = 0; runner.current && guard < 200; guard++) {
      const page = runner.current;
      if (!page.choices) {
        runner.advance();
        continue;
      }
      const enabled = page.choices.filter((ch) => ch.enabled);
      if (step < path.length) {
        runner.choose(path[step++]);
        continue;
      }
      // A new fork: explore every other choice later, take the first now.
      if (path.length < 12) for (const ch of enabled.slice(1)) paths.push([...path, ch.index]);
      path.push(enabled[0].index);
      step++;
      runner.choose(enabled[0].index);
    }
    if (runner.encounter) applyEffects(c.encounters[runner.encounter].win, s);
    out.push(s);
  }
  return out;
}
