/**
 * A small seeded random number generator (mulberry32).
 *
 * Use it for every random choice that affects the simulation (enemy AI,
 * damage variance), never `Math.random()`: the same seed and the same inputs
 * then give the same fight, which is what makes the frame-rate test and AI
 * tests possible. Purely visual randomness (particle spread) may use its own
 * Rng so it doesn't disturb the simulation's sequence.
 */
export class Rng {
  /** @param {number | string} [seed=1] */
  constructor(seed = 1) {
    this.state = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  }

  /** A float in [0, 1). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * @param {number} min
   * @param {number} max
   */
  range(min, max) {
    return min + (max - min) * this.next();
  }

  /** @param {number} probability  0..1 */
  chance(probability) {
    return this.next() < probability;
  }

  /**
   * @template T
   * @param {T[]} list
   * @returns {T}
   */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
}

/** @param {string} text */
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
