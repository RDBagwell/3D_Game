/**
 * The village's characters. An NPC is placed in an area with `npc_<id>` (in
 * Blender, or `npcs` in the area's data) and defined here: its name, model
 * and the dialogue it opens (src/game/data/dialogues/<id>.json).
 *
 *   name      shown above the dialogue box and in the "Talk" prompt
 *   model     a character model (MODELS in assets.js)
 *   dialogue  the dialogue file to play when you talk to them
 *   hide      the model's accessories to leave off (KayKit characters carry every weapon)
 *
 * Adding an NPC: a line here, a dialogue file, and a placement. No code.
 * The validator (npm test) checks the model, the dialogue and every placement.
 */
export const NPCS = {
  ina: { name: 'Elder Ina', model: 'npc_mage', dialogue: 'ina', hide: ['Spellbook', 'Spellbook_open', '1H_Wand'] },
  bram: { name: 'Bram', model: 'npc_barbarian', dialogue: 'bram', hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe'] },
  wren: { name: 'Wren', model: 'npc_rogue_hooded', dialogue: 'wren', hide: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'] },
  dorran: { name: 'Dorran', model: 'npc_rogue', dialogue: 'dorran', hide: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'] },
};

/** How close you must be to talk, metres. */
export const TALK_RANGE = 2.4;
