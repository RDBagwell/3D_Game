/**
 * Interactive objects. Each is placed in an area with `object_<id>` and
 * defined here. What they *do* is data too: most open a dialogue (which can
 * check items and flags and apply effects, the same as talking to someone),
 * and their look follows conditions on the game's flags.
 *
 *   type       'gate' | 'door' | 'chest' | 'switch' | 'pickup' | 'hearthstone' | 'hearth'
 *   name       for the prompt ("Open the chest")
 *   model      model drawn (MODELS key); for gates, openModel replaces it once open
 *   scale      model scale
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

/** @typedef {{ type: string, name: string, model?: string, openModel?: string, scale?: number, solid?: [number, number, number], openIf?: Record<string, any>, showIf?: Record<string, any>, prompt?: string, dialogue?: string, hitEffects?: Record<string, any>[], checkpoint?: string }} ObjectDef */

/** @type {Record<string, ObjectDef>} */
export const OBJECTS = {
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
