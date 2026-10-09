/**
 * Items. There are no stats to compare: everything you carry either does
 * one clear thing or opens the way forward.
 *
 *   name, description
 *   type     'consumable'  used from the quick slot (Use item); `heal` HP
 *            'upgrade'     always on while you carry it: `maxHp` more health,
 *                          `damage` multiplies your sword's damage
 *            'key'         for doors, quests and dialogue conditions
 *   stack    most you can carry
 *   price    in shells, for shops (consumables only)
 *
 * Items are given and taken by effects ({ "giveItem": "tonic" }) and checked
 * by conditions ({ "hasItem": "hearth_key" }); the validator rejects any
 * item id that isn't here.
 */

/** @typedef {{ name: string, description: string, type: 'consumable' | 'upgrade' | 'key', stack: number, price?: number, heal?: number, maxHp?: number, damage?: number }} ItemDef */

/** @type {Record<string, ItemDef>} */
export const ITEMS = {
  tonic: {
    name: 'Ember Tonic',
    description: 'A warm, peppery drink. Restores 45 health. Drinking takes a moment: find an opening.',
    type: 'consumable',
    stack: 5,
    price: 12,
    heal: 45,
  },
  vigor_charm: {
    name: 'Vigor Charm',
    description: 'Wren\'s thanks: a smooth stone that hums faintly. +30 maximum health.',
    type: 'upgrade',
    stack: 1,
    maxHp: 30,
  },
  tempered_blade: {
    name: 'Tempered Blade',
    description: 'Dorran\'s old sword, re-edged by Bram. Your attacks deal 40% more damage.',
    type: 'upgrade',
    stack: 1,
    damage: 1.4,
  },
  lamp_crate: {
    name: 'Crate of Lamp-stones',
    description: 'The delivery you rowed over. Every stone in it is cold.',
    type: 'key',
    stack: 1,
  },
  lamp_crate_lit: {
    name: 'Crate of Lamp-stones',
    description: 'The delivery you rowed over. Since the Hearth woke, every stone in it glows warm.',
    type: 'key',
    stack: 1,
  },
  satchel: {
    name: 'Wren\'s Satchel',
    description: 'Battered leather, full of notes about wisps. Wren will want it back.',
    type: 'key',
    stack: 1,
  },
  hearth_key: {
    name: 'Hearth Key',
    description: 'An iron key with a flame-shaped bit. It opens the door out of the Key Vault.',
    type: 'key',
    stack: 1,
  },
  hearth_ember: {
    name: 'Hearth Ember',
    description: 'The last spark of the Hearth, kept in the Warden\'s chest. It is warm to hold.',
    type: 'key',
    stack: 1,
  },
};

/** Shells you start with. */
export const START_SHELLS = 24;
/** Items you start with. */
export const START_ITEMS = { lamp_crate: 1, tonic: 1 };
