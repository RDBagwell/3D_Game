/**
 * Shops. A shop is opened from dialogue with the effect { "shop": "<id>" },
 * so any NPC can be a shopkeeper (the same as Island RPG).
 *
 *   name     shown at the top of the shop screen
 *   items    item ids for sale (consumables, from items.js), in order
 *   prices   optional price overrides: { tonic: 10 } (otherwise the item's own)
 */
export const SHOPS = {
  bram: {
    name: 'Bram\'s Forge',
    items: ['tonic'],
    prices: {},
  },
};
