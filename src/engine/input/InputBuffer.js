/**
 * Remembers recent button presses so an action pressed slightly too early
 * still happens when it becomes possible.
 *
 * Without a buffer, pressing attack two frames before the current swing can
 * chain is simply lost, and the player feels the game ignored them. With a
 * buffer of N frames, a press stays "pending" for N updates:
 *
 *   tick:      10  11  12  13  14  15  16
 *   attack:     ●                           pressed at 10
 *   can chain:                  ✓           window opens at 14
 *   buffer 6:  [ 10 ... 16 ]   → consumed at 14, the combo continues
 *   buffer 0:  only presses at tick 14 or later count → the press at 10 is lost
 *
 * Each press is used at most once (`consume`). The recent history is kept for
 * the input-buffer timeline in the game-feel lab.
 */

/**
 * @typedef {object} BufferedPress
 * @property {string} action
 * @property {number} tick       when it was pressed
 * @property {number | null} usedAt  tick it was consumed, or null
 * @property {boolean} expired   true once it's too old to be used
 */

export class InputBuffer {
  /** @param {number} [historyTicks=120]  how long presses are kept for the timeline */
  constructor(historyTicks = 120) {
    /** @type {BufferedPress[]} */
    this.presses = [];
    this.historyTicks = historyTicks;
    this.tick = 0;
  }

  /**
   * Record this update's presses. Call once per update, before consuming.
   * @param {number} tick
   * @param {string[]} actions  actions pressed this update
   */
  update(tick, actions) {
    this.tick = tick;
    for (const action of actions) this.presses.push({ action, tick, usedAt: null, expired: false });
    while (this.presses.length > 0 && this.presses[0].tick < tick - this.historyTicks) this.presses.shift();
  }

  /**
   * Use the oldest unused press of `action` made within the last `window`
   * ticks (0 = this tick only), and no earlier than `notBefore`.
   * @param {string} action
   * @param {number} window  ticks
   * @param {number} [notBefore=-Infinity]  ignore presses older than this tick
   * @returns {boolean}
   */
  consume(action, window, notBefore = -Infinity) {
    for (const press of this.presses) {
      if (press.action !== action || press.usedAt !== null) continue;
      if (press.tick < this.tick - window || press.tick < notBefore) {
        press.expired = true;
        continue;
      }
      press.usedAt = this.tick;
      return true;
    }
    return false;
  }

  /**
   * Is there an unused press within the window, without using it?
   * @param {string} action
   * @param {number} window
   * @param {number} [notBefore=-Infinity]
   */
  peek(action, window, notBefore = -Infinity) {
    return this.presses.some((p) => p.action === action && p.usedAt === null && p.tick >= this.tick - window && p.tick >= notBefore);
  }

  clear() {
    this.presses = [];
  }
}
