import { DEG } from '../../engine/index.js';
import { totalFrames } from '../data/attacks.js';

/**
 * Hitboxes, hurtboxes and blocking: plain geometry, no physics engine.
 *
 *   hurtbox  what can be hurt: a vertical capsule around each character
 *            (feet position, radius, height)
 *   hitbox   what hurts: a sphere that sweeps through an arc in front of the
 *            attacker, and exists only during the attack's active frames
 *
 * Why simple shapes instead of Rapier sensors? The checks run once per fixed
 * update in a known order, need no extra bodies kept in sync with
 * animations, and are trivially testable and deterministic. Rapier is used
 * for what it's best at: moving characters through the level.
 *
 * The hitbox follows the frame data, not the animation: the animation is
 * stretched to fit the frame data (Animator `duration`), so they agree, and
 * if they ever didn't, the frame data is the truth.
 */

/**
 * @typedef {'startup' | 'active' | 'recovery' | 'done'} Phase
 */

/**
 * @param {import('../data/attacks.js').Attack} attack
 * @param {number} frame  frames since the attack started (0-based)
 * @returns {Phase}
 */
export function attackPhase(attack, frame) {
  if (frame < attack.startup) return 'startup';
  if (frame < attack.startup + attack.active) return 'active';
  if (frame < totalFrames(attack)) return 'recovery';
  return 'done';
}

/**
 * The hitbox at a frame: two spheres along the blade (mid-blade and tip), so
 * an enemy standing right up against you is hit as well as one at arm's
 * length. Empty outside the active frames.
 * @param {import('../data/attacks.js').Attack} attack
 * @param {number} frame
 * @param {{ x: number, y: number, z: number }} origin
 * @param {number} facing
 * @returns {{ x: number, y: number, z: number, r: number }[]}
 */
export function hitSpheresAt(attack, frame, origin, facing) {
  const tip = hitboxAt(attack, frame, origin, facing);
  if (!tip) return [];
  const k = 0.5;
  const mid = { x: origin.x + (tip.x - origin.x) * k, y: tip.y, z: origin.z + (tip.z - origin.z) * k, r: tip.r * 0.9 };
  return [mid, tip];
}

/**
 * The hitbox's tip sphere at a frame, or null outside the active frames.
 * @param {import('../data/attacks.js').Attack} attack
 * @param {number} frame
 * @param {{ x: number, y: number, z: number }} origin  attacker's feet
 * @param {number} facing  attacker's yaw (front = +Z rotated by yaw)
 * @returns {{ x: number, y: number, z: number, r: number } | null}
 */
export function hitboxAt(attack, frame, origin, facing) {
  if (attackPhase(attack, frame) !== 'active') return null;
  const box = attack.hitbox;
  const t = attack.active > 1 ? (frame - attack.startup) / (attack.active - 1) : 0.5;
  const angle = facing - (box.arcFrom + (box.arcTo - box.arcFrom) * t) * DEG;
  return {
    x: origin.x + Math.sin(angle) * box.reach,
    y: origin.y + box.height,
    z: origin.z + Math.cos(angle) * box.reach,
    r: box.radius,
  };
}

/**
 * Does a sphere touch a vertical capsule standing on `base`?
 * @param {{ x: number, y: number, z: number }} base  feet
 * @param {number} radius
 * @param {number} height
 * @param {{ x: number, y: number, z: number, r: number }} sphere
 */
export function sphereHitsCapsule(base, radius, height, sphere) {
  const lowY = base.y + radius;
  const highY = base.y + Math.max(radius, height - radius);
  const y = Math.min(highY, Math.max(lowY, sphere.y));
  const dx = sphere.x - base.x;
  const dy = sphere.y - y;
  const dz = sphere.z - base.z;
  const reach = radius + sphere.r;
  return dx * dx + dy * dy + dz * dz <= reach * reach;
}

/**
 * Is `from` within `halfAngleDeg` of straight ahead of a character at
 * `position` facing `facing`? Used for blocking: shields only work in front.
 * @param {{ x: number, z: number }} position
 * @param {number} facing
 * @param {{ x: number, z: number }} from
 * @param {number} halfAngleDeg
 */
export function isInFront(position, facing, from, halfAngleDeg) {
  const dx = from.x - position.x;
  const dz = from.z - position.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  const dot = (dx * Math.sin(facing) + dz * Math.cos(facing)) / len;
  return dot >= Math.cos(halfAngleDeg * DEG);
}

/**
 * @typedef {object} Combatant
 * @property {string} id
 * @property {'player' | 'enemy'} team
 * @property {{ x: number, y: number, z: number }} position
 * @property {number} facing
 * @property {number} radius
 * @property {number} height
 * @property {boolean} alive
 * @property {() => boolean} isInvulnerable
 * @property {(from: { x: number, z: number }) => boolean} blocks  true if a hit from there is blocked
 */

/**
 * @typedef {object} HitResult
 * @property {Combatant} target
 * @property {'hit' | 'blocked' | 'invulnerable'} result
 * @property {{ x: number, y: number, z: number }} point  where the hitbox met the target
 */

/**
 * Check one attacker's swing this frame against everyone else.
 * @param {Combatant} attacker
 * @param {import('../data/attacks.js').Attack} attack
 * @param {number} frame
 * @param {Combatant[]} targets
 * @param {Set<string>} alreadyHit  ids this swing has touched (updated here)
 * @returns {HitResult[]}
 */
export function resolveSwing(attacker, attack, frame, targets, alreadyHit) {
  const spheres = hitSpheresAt(attack, frame, attacker.position, attacker.facing);
  if (spheres.length === 0) return [];
  /** @type {HitResult[]} */
  const results = [];
  for (const target of targets) {
    if (target === attacker || target.team === attacker.team || !target.alive || alreadyHit.has(target.id)) continue;
    const box = spheres.find((sphere) => sphereHitsCapsule(target.position, target.radius, target.height, sphere));
    if (!box) continue;
    alreadyHit.add(target.id);
    // The contact point: on the target's surface, towards the hitbox.
    const dx = box.x - target.position.x;
    const dz = box.z - target.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const point = {
      x: target.position.x + (dx / len) * target.radius,
      y: Math.min(target.position.y + target.height - 0.2, Math.max(target.position.y + 0.3, box.y)),
      z: target.position.z + (dz / len) * target.radius,
    };
    let result = /** @type {HitResult['result']} */ ('hit');
    if (target.isInvulnerable()) result = 'invulnerable';
    else if (target.blocks(attacker.position)) result = 'blocked';
    results.push({ target, result, point });
  }
  return results;
}
