/**
 * Small maths helpers that the engine and the game share. All are pure.
 *
 * Smoothing note: `damp(a, b, smoothTime, dt)` is the frame-rate independent
 * way to "move a fraction of the way towards b each frame". Using
 * `a += (b - a) * 0.1` per frame looks fine at 60 Hz but moves twice as fast
 * at 120 Hz; `damp` gives the same curve at any step size.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Fraction to move towards a target this step, for an exponential approach
 * that reaches ~63% of the way in `smoothTime` seconds. 0 smoothTime = snap.
 * @param {number} smoothTime  seconds
 * @param {number} dt  seconds
 */
export function dampFactor(smoothTime, dt) {
  if (smoothTime <= 0) return 1;
  return 1 - Math.exp(-dt / smoothTime);
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} smoothTime
 * @param {number} dt
 */
export function damp(a, b, smoothTime, dt) {
  return lerp(a, b, dampFactor(smoothTime, dt));
}

/**
 * Move `value` towards `target` by at most `maxDelta`.
 * @param {number} value
 * @param {number} target
 * @param {number} maxDelta
 */
export function approach(value, target, maxDelta) {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

/**
 * Shortest signed difference b - a between two angles, in (-PI, PI].
 * @param {number} a
 * @param {number} b
 */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Rotate angle `a` towards `b` by at most `maxDelta` radians.
 * @param {number} a
 * @param {number} b
 * @param {number} maxDelta
 */
export function approachAngle(a, b, maxDelta) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function lerpAngle(a, b, t) {
  return a + angleDelta(a, b) * t;
}

/**
 * Yaw (rotation about +Y) that makes an object whose front is +Z face (x, z).
 * @param {number} x
 * @param {number} z
 */
export function yawFromDirection(x, z) {
  return Math.atan2(x, z);
}
