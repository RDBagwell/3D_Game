/**
 * The village's characters. An NPC is placed in an area with `npc_<id>` (in
 * Blender, or `npcs` in the area's data) and defined here: its name, model
 * and the dialogue it opens (src/game/data/dialogues/<id>.json).
 *
 *   name      shown above the dialogue box and in the "Talk" prompt
 *   model     a character model (MODELS in assets.js)
 *   dialogue  the dialogue file to play when you talk to them
 *   hide      the model's accessories to leave off (KayKit characters carry every weapon)
 *   barks     what they say as you walk past (a line over their head, and a
 *             caption): the first whose `if` holds, or one with no `if`
 *
 * Adding an NPC: a line here, a dialogue file, and a placement. No code.
 * The validator (npm test) checks the model, the dialogue and every placement.
 */
/** @typedef {{ name: string, model: string, dialogue: string, hide: string[], barks?: { if?: Record<string, any>, text: string }[] }} NpcDef */

/** @type {Record<string, NpcDef>} */
export const NPCS = {
  ina: {
    name: 'Elder Ina',
    model: 'npc_mage',
    dialogue: 'ina',
    hide: ['Spellbook', 'Spellbook_open', '1H_Wand'],
    barks: [
      { if: { flag: 'hearth_lit' }, text: 'Feel that? Warm, all the way up the hill.' },
      { if: { notFlag: 'gate_open' }, text: 'You there, with the crate. A word, please.' },
      { text: 'Mind the ash down there. It remembers.' },
    ],
  },
  bram: {
    name: 'Bram',
    model: 'npc_barbarian',
    dialogue: 'bram',
    hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe'],
    barks: [
      { if: { flag: 'hearth_lit' }, text: 'Forge has never burned this bright.' },
      { if: { lacksItem: 'ember_plate', shells: 70 }, text: 'Plate\'s ready, if your purse is.' },
      { text: 'Tonics on the bench. Iron, for the right price.' },
    ],
  },
  wren: {
    name: 'Wren',
    model: 'npc_rogue_hooded',
    dialogue: 'wren',
    hide: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'],
    barks: [
      { if: { hasItem: 'satchel' }, text: 'Is that... my satchel?' },
      { if: { flag: 'hearth_lit' }, text: 'Look at them all! The wisps are back.' },
      { if: { flag: 'wren_asked', notFlag: 'satchel_returned' }, text: 'Behind the houses, by the rocks. I\'m sure of it.' },
      { text: 'The wisps are so faint today.' },
    ],
  },
  dorran: {
    name: 'Dorran',
    model: 'npc_rogue',
    dialogue: 'dorran',
    hide: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
    barks: [
      { if: { flag: 'blade_given' }, text: 'Keep that edge clean.' },
      { text: 'Soft hands. Prove me wrong in the ring.' },
    ],
  },
};

/** How close you pass for an NPC to speak up, metres, and how long before they say it again, seconds. */
export const BARK = { range: 5, again: 25 };

/** How close you must be to talk, metres. */
export const TALK_RANGE = 2.4;
