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
 *   room       when that leaves too little room (a wall at the hero's back),
 *              the camera first swings round to the nearest side with space
 *              (not while locked on, or while the player turns it), then
 *              rises to look down from above: the hero and what's in front
 *              stay in view instead of the camera ending up in their head
 *
 * Every feature has a switch in `settings`, for the game-feel lab.
 */

/**
 * @typedef {object} CameraSettings
 * @property {number} smoothing   seconds to (mostly) catch up with the player; 0 = rigidly attached
 * @property {number} lookAhead   metres the view leads the player at full speed
 * @property {boolean} collision  pull in in front of walls
 * @property {boolean} lockFraming  while locked on, turn to keep player and target in view
 * @property {number} [follow]  0..1: how strongly the camera drifts back behind a running player
 *                              once they leave it alone (0 = never)
 * @property {number} [followDelay]  seconds without turning the camera before it starts to follow
 */

/**
 * @typedef {object} CameraInput
 * @property {{ x: number, y: number, z: number }} target  the player's feet
 * @property {{ x: number, z: number }} lead  direction of travel, scaled 0..1 by speed
 * @property {{ x: number, y: number }} look  radians to turn this update
 * @property {{ x: number, y: number, z: number } | null} lockTarget  feet of the locked-on enemy
 * @property {number} [lockHeight]  the locked-on enemy's height (m), to frame tall ones
 * @property {number | null} recenter  if set, swing behind a character facing this yaw
 * @property {{ pivot: { x: number, y: number, z: number }, yaw: number, pitch: number, distance: number }} [shot]
 *           a framed shot that overrides the follow camera (conversations): look at `pivot`
 *           from this angle and distance; collision still applies
 */

/** Less room than this (metres) behind the hero, and the camera starts to rise. */
const LIFT_BELOW = 2.4;
/** Room (metres) the lift looks for: enough to see the hero whole. */
const LIFT_ROOM = 1.8;
/** Pitches it can rise to, gentlest first (looking down at about 45, 60, 75 and 83 degrees). */
const LIFT_PITCHES = [-0.8, -1.05, -1.3, -1.45];
/** Turns (radians) it tries, nearest first, to find room to the side. */
const SWING_TRIES = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6];
/** Running more directly at the camera than this (radians off "behind"), it doesn't follow round. */
const FOLLOW_MAX_TURN = 2.5;
/** Locked on, the camera only turns once the target is this far (radians) from straight ahead. */
const LOCK_DEAD_ZONE = 0.3;
/** Seconds a recentre takes to settle (eased in and out). */
const RECENTER_TIME = 0.35;

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
    this.settings = { smoothing: 0.12, lookAhead: 1.2, collision: true, lockFraming: true, follow: 0.6, followDelay: 0.8 };

    this.yaw = 0;
    this.pitch = -0.32;
    this.minPitch = -1.15;
    this.maxPitch = 0.45;
    this.distance = distance;
    /** 0..1: how far along the head-to-camera line the camera may sit (collision). */
    this.pull = 1;
    /** 0..1: how far the camera has risen to look down from above (tight spots). */
    this.lift = 0;
    /** The pitch the lift rises to (the gentlest with room enough). */
    this.liftPitch = LIFT_PITCHES[0];
    /** Metres from the hero's head to the camera, after collision (WorldView fades the hero when close). */
    this.clearance = distance;
    this.pivot = new Vector3();
    this.position = new Vector3();
    this.prevPivot = new Vector3();
    this.prevPosition = new Vector3();
    /** Recentring in progress: the yaw being swung to. @type {number | null} */
    this.recenterYaw = null;
    /** The recentre's start yaw and how far through it is (0..1), for its ease. */
    this.recenterFrom = 0;
    this.recenterT = 0;
    /** Seconds since the player last turned the camera themselves. */
    this.sinceLook = 0;
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
    this.lift = 0;
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
    this.sinceLook = lookMoved ? 0 : this.sinceLook + dt;
    if (input.recenter !== null) {
      this.recenterYaw = input.recenter + Math.PI;
      this.recenterFrom = this.yaw;
      this.recenterT = 0;
    }
    if (lookMoved && !input.lockTarget) this.recenterYaw = null;

    if (input.shot) {
      // A framed shot (a conversation, a cutscene): swing to its angle.
      const k = dampFactor(0.18, dt);
      this.yaw += angleDelta(this.yaw, input.shot.yaw) * k;
      this.pitch = damp(this.pitch, input.shot.pitch, 0.18, dt);
      this.recenterYaw = null;
    } else if (input.lockTarget && s.lockFraming) {
      // Put the camera on the far side of the player from the target, but
      // only turn once the target drifts out of the middle of the view, so a
      // fight that's already well framed doesn't keep the camera swaying.
      const dx = input.target.x - input.lockTarget.x;
      const dz = input.target.z - input.lockTarget.z;
      if (dx * dx + dz * dz > 0.01) {
        const off = angleDelta(this.yaw, Math.atan2(dx, dz));
        const excess = Math.sign(off) * Math.max(0, Math.abs(off) - LOCK_DEAD_ZONE);
        this.yaw += excess * dampFactor(Math.max(0.08, s.smoothing), dt);
      }
      this.pitch = damp(this.pitch, -0.32, 0.2, dt);
      this.recenterYaw = null;
    } else {
      this.yaw -= input.look.x;
      this.pitch = clamp(this.pitch + input.look.y, this.minPitch, this.maxPitch);
      if (this.recenterYaw !== null) {
        // Eased in and out over RECENTER_TIME, rather than a flat-speed snap.
        this.recenterT = Math.min(1, this.recenterT + dt / RECENTER_TIME);
        const e = this.recenterT * this.recenterT * (3 - 2 * this.recenterT);
        this.yaw = this.recenterFrom + angleDelta(this.recenterFrom, this.recenterYaw) * e;
        if (this.recenterT >= 1) this.recenterYaw = null;
      } else if ((s.follow ?? 0) > 0 && this.sinceLook >= (s.followDelay ?? 0.8)) {
        // Auto-follow: left alone, the camera drifts round behind a running
        // player, faster the faster they run. Not when they run at it (that
        // would whip it round), and gently enough that turning it by hand
        // always wins.
        const speed = Math.hypot(input.lead.x, input.lead.z);
        if (speed > 0.3) {
          const off = angleDelta(this.yaw, Math.atan2(input.lead.x, input.lead.z) + Math.PI);
          if (Math.abs(off) < FOLLOW_MAX_TURN) this.yaw += off * dampFactor(1.1 / (s.follow ?? 0.6), dt) * speed;
        }
      }
    }

    // 2. Pivot: follow the player, lead their movement, frame the lock-on target.
    const goal = new Vector3(
      input.target.x + input.lead.x * s.lookAhead,
      input.target.y + this.pivotHeight,
      input.target.z + input.lead.z * s.lookAhead,
    );
    let wantedDistance = this.baseDistance;
    if (input.shot) {
      goal.set(input.shot.pivot.x, input.shot.pivot.y, input.shot.pivot.z);
      wantedDistance = input.shot.distance;
    } else if (input.lockTarget && s.lockFraming) {
      // Aim at the target's upper body, whatever its size (a tall Warden isn't cropped).
      const height = input.lockHeight ?? this.pivotHeight / 0.6;
      const t = new Vector3(input.lockTarget.x, input.lockTarget.y + Math.max(this.pivotHeight * 0.8, height * 0.55), input.lockTarget.z);
      const gap = Math.hypot(t.x - input.target.x, t.z - input.target.z);
      goal.lerp(t, 0.35);
      wantedDistance += clamp(gap * 0.25, 0, 2.2) + Math.max(0, height - 2) * 0.9;
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
    const head = new Vector3(input.target.x, input.target.y + this.pivotHeight, input.target.z);
    /**
     * Where the camera would go at `pitch` and `yaw`, and how much of the way is free.
     * @param {number} pitch
     * @param {number} [yaw]
     */
    const reach = (pitch, yaw = this.yaw) => {
      const desired = new Vector3().copy(this.pivot).addScaledVector(this.direction(new Vector3(), pitch, yaw), this.distance);
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
      return { desired, length, allowed, hit, room: length * allowed };
    };

    // Too little room behind: swing round to the nearest side with room.
    if (s.collision && !input.shot && !input.lockTarget && !lookMoved && reach(this.pitch).room < LIFT_BELOW) {
      const turn = SWING_TRIES.find((t) => reach(this.pitch, this.yaw + t).room >= LIFT_ROOM);
      if (turn !== undefined) {
        this.yaw += turn * dampFactor(0.3, dt);
        this.recenterYaw = null;
      }
    }

    // Still too little room: rise and look down from above, as gently as
    // leaves room enough. Rise quickly; settle back once there's space again.
    let wantLift = 0;
    if (s.collision && !input.shot) {
      const level = reach(this.pitch);
      if (level.room < LIFT_BELOW) {
        let best = { pitch: this.pitch, room: level.room };
        for (const pitch of LIFT_PITCHES) {
          if (pitch >= this.pitch) continue;
          const room = reach(pitch).room;
          if (room > best.room) best = { pitch, room };
          if (room >= LIFT_ROOM) break;
        }
        if (best.room > level.room + 0.3) {
          wantLift = clamp((LIFT_BELOW - level.room) / (LIFT_BELOW - 0.6), 0, 1);
          this.liftPitch = damp(this.liftPitch, best.pitch, 0.15, dt);
        }
      }
    }
    this.lift = wantLift > this.lift ? lerp(this.lift, wantLift, dampFactor(0.08, dt)) : lerp(this.lift, wantLift, dampFactor(0.5, dt));
    const { desired, length, allowed, hit } = reach(lerp(this.pitch, Math.min(this.pitch, this.liftPitch), this.lift));

    // Pull in at once (never show the inside of a wall); ease back out.
    this.pull = allowed < this.pull ? allowed : lerp(this.pull, allowed, dampFactor(0.25, dt));
    this.position.copy(head).lerp(desired, this.pull);
    this.clearance = this.position.distanceTo(head);
    this.probeInfo.from.copy(head);
    this.probeInfo.to.copy(desired);
    this.probeInfo.hit = hit;
    this.probeInfo.wanted = length;
    this.probeInfo.allowed = length * allowed;
  }

  /**
   * Unit vector from the pivot to the camera.
   * @param {Vector3} out
   * @param {number} [pitch]  default: the camera's own
   * @param {number} [yaw]  default: the camera's own
   */
  direction(out, pitch = this.pitch, yaw = this.yaw) {
    const c = Math.cos(pitch);
    return out.set(Math.sin(yaw) * c, -Math.sin(pitch), Math.cos(yaw) * c).normalize();
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
