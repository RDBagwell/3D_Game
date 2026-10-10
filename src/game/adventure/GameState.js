import { START } from '../data/areas/index.js';
import { START_ITEMS, START_SHELLS } from '../data/items.js';

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
    /** Where you stood when you chose Save and quit (else you resume at `spawn`). @type {{ x: number, y: number, z: number, yaw: number } | null} */
    this.position = null;
    /** Enemies beaten for good, as "area:name" (an area's `enemies` entry). @type {Set<string>} */
    this.defeated = new Set();
    /** Breakables already smashed for their shells, as "area:id" (they stay smashed). @type {Set<string>} */
    this.looted = new Set();
  }

  /** A fresh playthrough: the crate you're delivering, a tonic and a few shells. */
  static newGame() {
    const state = new GameState();
    for (const [id, count] of Object.entries(START_ITEMS)) state.addItem(id, count);
    state.shells = START_SHELLS;
    return state;
  }

  /** What a save slot holds (src/game/saves.js documents the format). */
  toSaveData() {
    return {
      area: this.area,
      spawn: this.spawn,
      checkpoint: { ...this.checkpoint },
      flags: [...this.flags].sort(),
      defeated: [...this.defeated].sort(),
      looted: [...this.looted].sort(),
      items: Object.fromEntries([...this.items].filter(([, n]) => n > 0)),
      shells: this.shells,
      questStages: { ...this.questStages },
      playTime: Math.round(this.playTime * 10) / 10,
      ...(this.position ? { position: { ...this.position } } : {}),
    };
  }

  /**
   * @param {ReturnType<GameState['toSaveData']>} data  already validated (saves.js)
   */
  static fromSaveData(data) {
    const state = new GameState();
    state.area = data.area;
    state.spawn = data.spawn;
    state.checkpoint = { ...data.checkpoint };
    state.flags = new Set(data.flags);
    state.defeated = new Set(data.defeated);
    state.looted = new Set(data.looted);
    state.items = new Map(Object.entries(data.items));
    state.shells = data.shells;
    state.questStages = { ...data.questStages };
    state.playTime = data.playTime;
    state.position = /** @type {any} */ (data).position ?? null;
    return state;
  }

  /**
   * @param {string} area
   * @param {string} name  the enemy's name in the area's `enemies`
   */
  isDefeated(area, name) {
    return this.defeated.has(`${area}:${name}`);
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
