import { Vector3 } from 'three';

/**
 * Camera shake and nudges, applied only when drawing (they never move the
 * simulated camera, so they can't affect aiming or collision).
 *
 * Shake uses "trauma": hits add trauma (0..1), it drains over time, and the
 * shake amount is trauma², so small hits barely shake and big ones do. The
 * offset is smooth noise, not random jumps, which reads as impact rather
 * than as a glitch. Amplitudes are capped (`maxOffset`, `maxRoll`) whatever
 * the scale, and `reducedMotion` turns shake and nudges off entirely.
 *
 * A nudge ("kick") pushes the view a few centimetres in the direction of a
 * hit and springs back, which tells you which way the blow went.
 */
export class CameraShake {
  constructor() {
    this.trauma = 0;
    /** 0..2 from the lab's Shake slider. */
    this.scale = 1;
    this.reducedMotion = false;
    /** Hard caps, whatever the scale. */
    this.maxOffset = 0.22;
    this.maxRoll = 0.035;
    this.time = 0;
    this.kick = new Vector3();
  }

  /** @param {number} amount  0..1 */
  addTrauma(amount) {
    if (this.reducedMotion || this.scale <= 0) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * @param {{ x: number, y: number, z: number }} direction  roughly normalised
   * @param {number} strength  metres
   */
  nudge(direction, strength) {
    if (this.reducedMotion) return;
    this.kick.set(direction.x, direction.y, direction.z).multiplyScalar(Math.min(strength, 0.3));
  }

  /**
   * Advance and return this frame's offset and roll.
   * @param {number} dt  real seconds since the last frame
   * @returns {{ offset: Vector3, roll: number }}
   */
  sample(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.kick.multiplyScalar(Math.exp(-dt / 0.07));
    const amount = Math.min(1, this.trauma * this.trauma * this.scale);
    const t = this.time * 28;
    const offset = new Vector3(
      noise(t, 1) * this.maxOffset * amount,
      noise(t, 2) * this.maxOffset * amount,
      noise(t, 3) * this.maxOffset * amount * 0.5,
    );
    if (this.reducedMotion) offset.set(0, 0, 0);
    else offset.add(this.kick);
    return { offset, roll: this.reducedMotion ? 0 : noise(t, 4) * this.maxRoll * amount };
  }
}

/**
 * Smooth noise in -1..1 from a few sines (cheap, deterministic).
 * @param {number} t
 * @param {number} seed
 */
function noise(t, seed) {
  return (Math.sin(t * 1.0 + seed * 1.7) * 0.5 + Math.sin(t * 2.3 + seed * 3.1) * 0.3 + Math.sin(t * 4.1 + seed * 5.3) * 0.2);
}
