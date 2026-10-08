import { Vector3 } from 'three';
import { clamp, damp, dampFactor, angleDelta, approachAngle, lerp } from '../core/math.js';

/**
 * A third-person orbit camera with smoothing, look-ahead, collision and
 * lock-on framing.
 *
 * It runs in the fixed update like the rest of the simulation (so it behaves
 * the same at every frame rate), keeps its previous state, and the renderer
 * draws it interpolated between the two.
 *
 *   pivot      the point the camera orbits and looks at: the player's chest,
 *              eased towards it ("follow smoothing"), pushed ahead in the
 *              direction of travel ("look-ahead"), and, while locked on,
 *              moved part of the way towards the target ("framing")
 *   yaw/pitch  orbit angles. Yaw 0 puts the camera on +Z looking towards -Z.
 *   distance   from the pivot. Collision then pulls the camera in along the
 *              line from the player's head to that spot (a sphere is swept
 *              outwards from the head), so it never ends up inside a wall
 *
 * Every feature has a switch in `settings`, for the game-feel lab.
 */

/**
 * @typedef {object} CameraSettings
 * @property {number} smoothing   seconds to (mostly) catch up with the player; 0 = rigidly attached
 * @property {number} lookAhead   metres the view leads the player at full speed
 * @property {boolean} collision  pull in in front of walls
 * @property {boolean} lockFraming  while locked on, turn to keep player and target in view
 */

/**
 * @typedef {object} CameraInput
 * @property {{ x: number, y: number, z: number }} target  the player's feet
 * @property {{ x: number, z: number }} lead  direction of travel, scaled 0..1 by speed
 * @property {{ x: number, y: number }} look  radians to turn this update
 * @property {{ x: number, y: number, z: number } | null} lockTarget  feet of the locked-on enemy
 * @property {number | null} recenter  if set, swing behind a character facing this yaw
 */

export class FollowCamera {
  /**
   * @param {object} [options]
   * @param {number} [options.distance=5.4]
   * @param {number} [options.pivotHeight=1.25]
   * @param {number} [options.probeRadius=0.28]
   * @param {(origin: Vector3, dir: Vector3, max: number, radius: number) => number | null} [options.probe]
   *        sphere cast against the level; returns the free distance or null
   */
  constructor({ distance = 5.4, pivotHeight = 1.25, probeRadius = 0.28, probe } = {}) {
    this.baseDistance = distance;
    this.pivotHeight = pivotHeight;
    this.probeRadius = probeRadius;
    this.probe = probe ?? (() => null);
    /** @type {CameraSettings} */
    this.settings = { smoothing: 0.12, lookAhead: 1.2, collision: true, lockFraming: true };

    this.yaw = 0;
    this.pitch = -0.32;
    this.minPitch = -1.15;
    this.maxPitch = 0.45;
    this.distance = distance;
    /** 0..1: how far along the head-to-camera line the camera may sit (collision). */
    this.pull = 1;
    this.pivot = new Vector3();
    this.position = new Vector3();
    this.prevPivot = new Vector3();
    this.prevPosition = new Vector3();
    /** Recentring in progress: the yaw being swung to. @type {number | null} */
    this.recenterYaw = null;
    /** Last collision probe, for the lab's camera view. */
    this.probeInfo = { from: new Vector3(), to: new Vector3(), hit: false, wanted: distance, allowed: distance };
    this.initialised = false;
  }

  /**
   * Jump straight to the right place (no smoothing), e.g. on spawn.
   * @param {{ x: number, y: number, z: number }} target
   * @param {number} behindYaw  the character's facing; the camera goes behind it
   */
  reset(target, behindYaw) {
    this.yaw = behindYaw + Math.PI;
    this.pivot.set(target.x, target.y + this.pivotHeight, target.z);
    this.distance = this.baseDistance;
    this.pull = 1;
    this.place();
    this.snapshot();
    this.initialised = true;
  }

  /** Keep the current state as "previous" for interpolation. Call at the start of each update. */
  snapshot() {
    this.prevPivot.copy(this.pivot);
    this.prevPosition.copy(this.position);
  }

  /**
   * @param {number} dt
   * @param {CameraInput} input
   */
  update(dt, input) {
    const s = this.settings;
    if (!this.initialised) this.reset(input.target, 0);

    // 1. Orbit angles: player input, lock-on framing or a recentre swing.
    const lookMoved = Math.abs(input.look.x) > 1e-4 || Math.abs(input.look.y) > 1e-4;
    if (input.recenter !== null) this.recenterYaw = input.recenter + Math.PI;
    if (lookMoved && !input.lockTarget) this.recenterYaw = null;

    if (input.lockTarget && s.lockFraming) {
      // Put the camera on the far side of the player from the target.
      const dx = input.target.x - input.lockTarget.x;
      const dz = input.target.z - input.lockTarget.z;
      if (dx * dx + dz * dz > 0.01) {
        const wanted = Math.atan2(dx, dz);
        this.yaw += angleDelta(this.yaw, wanted) * dampFactor(Math.max(0.08, s.smoothing), dt);
      }
      this.pitch = damp(this.pitch, -0.32, 0.2, dt);
      this.recenterYaw = null;
    } else {
      this.yaw -= input.look.x;
      this.pitch = clamp(this.pitch + input.look.y, this.minPitch, this.maxPitch);
      if (this.recenterYaw !== null) {
        this.yaw = approachAngle(this.yaw, this.recenterYaw, 9 * dt);
        if (Math.abs(angleDelta(this.yaw, this.recenterYaw)) < 1e-3) this.recenterYaw = null;
      }
    }

    // 2. Pivot: follow the player, lead their movement, frame the lock-on target.
    const goal = new Vector3(
      input.target.x + input.lead.x * s.lookAhead,
      input.target.y + this.pivotHeight,
      input.target.z + input.lead.z * s.lookAhead,
    );
    let wantedDistance = this.baseDistance;
    if (input.lockTarget && s.lockFraming) {
      const t = new Vector3(input.lockTarget.x, input.lockTarget.y + this.pivotHeight * 0.8, input.lockTarget.z);
      const gap = Math.hypot(t.x - input.target.x, t.z - input.target.z);
      goal.lerp(t, 0.35);
      wantedDistance += clamp(gap * 0.25, 0, 2.2);
    }
    const f = dampFactor(s.smoothing, dt);
    this.pivot.lerp(goal, f);
    // Never let smoothing leave the player off screen: clamp the lag.
    const lag = this.pivot.distanceTo(goal);
    if (lag > 2.5) this.pivot.lerp(goal, 1 - 2.5 / lag);

    // 3. Distance and collision. The sweep starts at the player's head, not
    // at the pivot: look-ahead and framing can put the pivot inside a prop,
    // and a probe that starts inside something always reports a hit.
    this.distance = lerp(this.distance, wantedDistance, dampFactor(0.3, dt));
    const dir = this.direction(new Vector3());
    const desired = new Vector3().copy(this.pivot).addScaledVector(dir, this.distance);
    const head = new Vector3(input.target.x, input.target.y + this.pivotHeight, input.target.z);
    const ray = new Vector3().subVectors(desired, head);
    const length = ray.length();
    let allowed = 1;
    let hit = false;
    if (s.collision && length > 1e-3) {
      ray.divideScalar(length);
      const free = this.probe(head, ray, length, this.probeRadius);
      if (free !== null && free < length) {
        allowed = Math.max(0, free - 0.05) / length;
        hit = true;
      }
    }
    // Pull in at once (never show the inside of a wall); ease back out.
    this.pull = allowed < this.pull ? allowed : lerp(this.pull, allowed, dampFactor(0.25, dt));
    this.position.copy(head).lerp(desired, this.pull);
    this.probeInfo.from.copy(head);
    this.probeInfo.to.copy(desired);
    this.probeInfo.hit = hit;
    this.probeInfo.wanted = length;
    this.probeInfo.allowed = length * allowed;
  }

  /**
   * Unit vector from the pivot to the camera.
   * @param {Vector3} out
   */
  direction(out) {
    const c = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * c, -Math.sin(this.pitch), Math.cos(this.yaw) * c).normalize();
  }

  /** @private */
  place() {
    this.position.copy(this.pivot).addScaledVector(this.direction(new Vector3()), this.distance);
  }

  /**
   * Forward and right on the ground plane, for camera-relative movement.
   * @returns {{ forward: { x: number, z: number }, right: { x: number, z: number } }}
   */
  groundAxes() {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return { forward: { x: fx, z: fz }, right: { x: -fz, z: fx } };
  }

  /**
   * Interpolated camera for drawing.
   * @param {number} alpha
   * @param {Vector3} outPosition
   * @param {Vector3} outLookAt
   */
  interpolate(alpha, outPosition, outLookAt) {
    outPosition.lerpVectors(this.prevPosition, this.position, alpha);
    outLookAt.lerpVectors(this.prevPivot, this.pivot, alpha);
  }
}
