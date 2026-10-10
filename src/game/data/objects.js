/**
 * Interactive objects. Each is placed in an area with `object_<id>` and
 * defined here. What they *do* is data too: most open a dialogue (which can
 * check items and flags and apply effects, the same as talking to someone),
 * and their look follows conditions on the game's flags.
 *
 *   type       'gate' | 'door' | 'chest' | 'switch' | 'pickup' | 'hearthstone' | 'hearth'
 *              | 'breakable' | 'sign' | 'tablet'
 *              (a breakable is smashed by a blow that `breaks`, data/attacks.js,
 *              or by your sword if it's `fragile`: its model swaps to openModel,
 *              or vanishes, and it stops blocking. A sign or a tablet is read:
 *              Interact plays its dialogue.)
 *   fragile    (breakables) your sword smashes it: a pot, a barrel
 *   drops      (breakables) { shells: n } spilled the first time it's smashed;
 *              it stays smashed for good (GameState.looted)
 *   name       for the prompt ("Open the chest")
 *   model      model drawn (MODELS key); for gates, openModel replaces it once open
 *   scale      model scale (openScale: the open model's, if different)
 *   solid      [w, h, d] collision box while closed (gates, doors, chests)
 *   openIf     condition: the object is open (gate up, chest open, switch lit)
 *   showIf     condition: the object is there at all (default: always)
 *   prompt     the verb shown when you can interact ("Open", "Examine")
 *   dialogue   played when you interact (while closed, for gates, doors and chests)
 *   hitEffects effects run when the sword strikes it (switches), unless already open
 *   checkpoint (hearthstones) the spawn_player_<name> you return to after falling
 *
 * Conditions and effects use the dialogue language (docs/CONTENT.md).
 */

/** @typedef {{ type: string, name: string, model?: string, openModel?: string, scale?: number, openScale?: number, fragile?: boolean, drops?: { shells: number }, solid?: [number, number, number], openIf?: Record<string, any>, showIf?: Record<string, any>, prompt?: string, dialogue?: string, hitEffects?: Record<string, any>[], checkpoint?: string }} ObjectDef */

/** One of the four pillars in the Warden's arena. */
const ARENA_PILLAR = { type: 'breakable', name: 'a pillar', model: 'dun_pillar', openModel: 'dun_rubble', scale: 0.85, openScale: 0.3, solid: /** @type {[number, number, number]} */ ([1.8, 3.4, 1.4]) };

/** A barrel in the Hearth Halls / a crate in the village: smash it for a few shells. */
const HALLS_BARREL = { type: 'breakable', name: 'a barrel', model: 'dun_barrel', scale: 0.55, solid: /** @type {[number, number, number]} */ ([0.9, 1.1, 0.9]), fragile: true, drops: { shells: 3 } };
const VILLAGE_CRATE = { type: 'breakable', name: 'a crate', model: 'crate_big', scale: 5, solid: /** @type {[number, number, number]} */ ([1, 1, 1]), fragile: true, drops: { shells: 2 } };
/** A lore tablet in the Hearth Halls. */
const tablet = (/** @type {string} */ dialogue) => ({ type: 'tablet', name: 'a carved tablet', prompt: 'Read', dialogue, solid: /** @type {[number, number, number]} */ ([0.9, 1.4, 0.35]) });

/** @type {Record<string, ObjectDef>} */
export const OBJECTS = {
  sign_dock: { type: 'sign', name: 'the signpost', prompt: 'Read', dialogue: 'sign_dock', solid: [0.3, 2, 0.3] },
  tablet_steps: tablet('tablet_steps'),
  tablet_switch: tablet('tablet_switch'),
  tablet_vault: tablet('tablet_vault'),
  tablet_ante: tablet('tablet_ante'),
  barrel_steps: HALLS_BARREL,
  barrel_switch_a: HALLS_BARREL,
  barrel_switch_b: HALLS_BARREL,
  barrel_vault: HALLS_BARREL,
  crate_square: VILLAGE_CRATE,
  crate_tavern: VILLAGE_CRATE,
  switch_chest: {
    type: 'chest',
    name: 'the old chest',
    model: 'dun_chest',
    scale: 0.75,
    solid: [1.3, 1, 1.1],
    openIf: { flag: 'switch_chest_opened' },
    prompt: 'Open',
    dialogue: 'switch_chest',
  },
  ante_chest: {
    type: 'chest',
    name: 'the old chest',
    model: 'dun_chest',
    scale: 0.75,
    solid: [1.3, 1, 1.1],
    openIf: { flag: 'ante_chest_opened' },
    prompt: 'Open',
    dialogue: 'ante_chest',
  },
  hearthstone_ring: { type: 'hearthstone', name: 'the hearthstone', checkpoint: 'ring' },
  arena_pillar_nw: ARENA_PILLAR,
  arena_pillar_ne: ARENA_PILLAR,
  arena_pillar_sw: ARENA_PILLAR,
  arena_pillar_se: ARENA_PILLAR,
  hearth_gate: {
    type: 'gate',
    name: 'the Hearth gate',
    model: 'dun_wall_gated',
    openModel: 'dun_wall_doorway',
    scale: 1.25,
    solid: [5, 5, 1.2],
    openIf: { flag: 'gate_open' },
    prompt: 'Examine',
    dialogue: 'hearth_gate',
  },
  hall_gate: {
    type: 'gate',
    name: 'the portcullis',
    model: 'dun_wall_gated',
    openModel: 'dun_wall_doorway',
    scale: 0.75,
    solid: [3, 3.4, 0.9],
    openIf: { flag: 'hall_gate_open' },
    prompt: 'Examine',
    dialogue: 'hall_gate',
  },
  hall_switch: {
    type: 'switch',
    name: 'the crystal',
    // Struck with the sword (Interact swings at it too).
    prompt: 'Strike',
    openIf: { flag: 'hall_gate_open' },
    hitEffects: [{ setFlag: 'hall_gate_open' }],
  },
  vault_chest: {
    type: 'chest',
    name: 'the chest',
    model: 'dun_chest_gold',
    scale: 0.75,
    solid: [1.3, 1, 1.1],
    openIf: { flag: 'vault_chest_opened' },
    prompt: 'Open',
    dialogue: 'vault_chest',
  },
  vault_door: {
    type: 'door',
    name: 'the locked door',
    model: 'dun_wall_doorway',
    scale: 0.75,
    solid: [3, 3.4, 0.9],
    openIf: { flag: 'vault_door_open' },
    prompt: 'Unlock',
    dialogue: 'vault_door',
  },
  satchel: {
    type: 'pickup',
    name: 'Wren\'s satchel',
    model: 'sack',
    scale: 6,
    showIf: { all: [{ flag: 'wren_asked' }, { lacksItem: 'satchel' }, { notFlag: 'satchel_returned' }] },
    prompt: 'Pick up',
    dialogue: 'satchel',
  },
  hearthstone_steps: { type: 'hearthstone', name: 'the hearthstone', checkpoint: 'entrance' },
  hearthstone_ante: { type: 'hearthstone', name: 'the hearthstone', checkpoint: 'ante' },
  hearth: {
    type: 'hearth',
    name: 'the Hearth',
    solid: [3, 1.2, 3],
    openIf: { flag: 'hearth_lit' },
    prompt: 'Examine',
    dialogue: 'hearth',
  },
};

/** How close you must be to use an object, metres. */
export const USE_RANGE = 2.2;
/** Walking this close to a hearthstone makes it your checkpoint. */
export const HEARTHSTONE_RANGE = 3.5;
