import { DEG } from '../../engine/index.js';

/**
 * Lock-on target selection, as pure functions.
 *
 * Choosing: the best target is the one most "in front of the camera" that
 * isn't too far: a score of how far off the camera's centre line it is, plus
 * a smaller penalty for distance. Something dead ahead at 8 m beats
 * something at the edge of the screen at 3 m, because that's what the player
 * is looking at.
 *
 * Switching: flicking the stick (or mouse, or arrow key) left or right while
 * locked moves to the nearest target on that side, measured by angle around
 * the player as seen from the camera.
 *
 * Breaking: the lock lets go when the target dies or gets too far away.
 */

/** @typedef {{ id: string, position: { x: number, y: number, z: number }, alive: boolean }} Lockable */

export const LOCK = {
  /** Farthest a new lock can reach. */
  maxDistance: 14,
  /** Widest angle from the camera's forward direction, either side. */
  maxAngleDeg: 75,
  /** An existing lock breaks beyond this. */
  breakDistance: 18,
  /** How much a metre of distance counts against a target, compared with a radian of angle. */
  distanceWeight: 0.06,
};

/**
 * @param {Lockable[]} candidates
 * @param {{ x: number, z: number }} from  the player's position
 * @param {{ x: number, z: number }} cameraForward  normalised, on the ground plane
 * @param {Partial<typeof LOCK>} [limits]
 * @returns {Lockable | null}
 */
export function selectTarget(candidates, from, cameraForward, limits = {}) {
  const { maxDistance, maxAngleDeg, distanceWeight } = { ...LOCK, ...limits };
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (!c.alive) continue;
    const dx = c.position.x - from.x;
    const dz = c.position.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDistance) continue;
    const angle = dist < 0.01 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * cameraForward.x + dz * cameraForward.z) / dist)));
    if (angle > maxAngleDeg * DEG) continue;
    const score = angle + dist * distanceWeight;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * The next target to the left (-1) or right (+1) of the current one.
 * @param {Lockable} current
 * @param {Lockable[]} candidates
 * @param {{ x: number, z: number }} from  the player's position
 * @param {{ x: number, z: number }} cameraRight  normalised, on the ground plane
 * @param {-1 | 1} direction
 * @param {Partial<typeof LOCK>} [limits]
 * @returns {Lockable}  the current target if there's nothing on that side
 */
export function switchTarget(current, candidates, from, cameraRight, direction, limits = {}) {
  const { maxDistance } = { ...LOCK, ...limits };
  const side = (/** @type {Lockable} */ c) => {
    const dx = c.position.x - from.x;
    const dz = c.position.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    return (dx * cameraRight.x + dz * cameraRight.z) / len; // -1 (left) .. 1 (right)
  };
  const here = side(current);
  let best = current;
  let bestGap = Infinity;
  for (const c of candidates) {
    if (c === current || !c.alive) continue;
    if (Math.hypot(c.position.x - from.x, c.position.z - from.z) > maxDistance) continue;
    const gap = (side(c) - here) * direction;
    if (gap > 0.02 && gap < bestGap) {
      bestGap = gap;
      best = c;
    }
  }
  return best;
}

/**
 * @param {Lockable} target
 * @param {{ x: number, z: number }} from
 * @param {Partial<typeof LOCK>} [limits]
 */
export function shouldBreakLock(target, from, limits = {}) {
  const { breakDistance } = { ...LOCK, ...limits };
  return !target.alive || Math.hypot(target.position.x - from.x, target.position.z - from.z) > breakDistance;
}
