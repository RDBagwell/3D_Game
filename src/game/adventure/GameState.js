import { START } from '../data/areas/index.js';

/**
 * Everything about a playthrough that is saved: story flags, the bag, shells
 * (the currency), where you are and your last checkpoint, how far each quest
 * has got (for its "Quest updated" notices), and the play time.
 *
 * There are no levels or experience: you grow stronger by finding things
 * (README, "Why no XP"). Upgrades are key items whose presence is the upgrade.
 */
export class GameState {
  constructor() {
    /** @type {Set<string>} */
    this.flags = new Set();
    /** Item id -> how many. @type {Map<string, number>} */
    this.items = new Map();
    this.shells = 0;
    /** Where you are. */
    this.area = START.area;
    this.spawn = START.spawn;
    /** Where you come back after falling (a hearthstone, or the dock). */
    this.checkpoint = { area: START.area, spawn: START.spawn };
    /** Quest id -> index of the stage last announced (-1: not started). @type {Record<string, number>} */
    this.questStages = {};
    this.playTime = 0;
  }

  /** @param {string} id */
  itemCount(id) {
    return this.items.get(id) ?? 0;
  }

  /**
   * @param {string} id
   * @param {number} [count=1]
   * @param {number} [stack=99]  most you can carry
   * @returns {number} how many were added
   */
  addItem(id, count = 1, stack = 99) {
    const have = this.itemCount(id);
    const added = Math.max(0, Math.min(count, stack - have));
    if (added > 0) this.items.set(id, have + added);
    return added;
  }

  /**
   * @param {string} id
   * @param {number} [count=1]
   * @returns {boolean} false if there weren't enough
   */
  removeItem(id, count = 1) {
    const have = this.itemCount(id);
    if (have < count) return false;
    if (have === count) this.items.delete(id);
    else this.items.set(id, have - count);
    return true;
  }
}
