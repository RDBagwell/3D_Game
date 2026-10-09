/**
 * A character (the player or an enemy) moved by Rapier's kinematic character
 * controller.
 *
 * Why not a dynamic rigid body with a velocity, like the 2024 prototype? A
 * dynamic body is pushed around by the physics solver: it bounces off steps,
 * slides down gentle slopes, jitters against walls and gets launched by
 * other bodies. The character controller instead takes the movement we *want*
 * this step and returns the movement that is *allowed*:
 *
 *   - slopes up to `maxSlope` are walked up; steeper ones are slid down;
 *   - steps up to `stepHeight` are climbed without slowing down;
 *   - "snap to ground" keeps feet on the floor going down ramps and stairs
 *     instead of skipping into the air;
 *   - against a wall, the part of the movement along the wall is kept, so
 *     running diagonally into it slides along it.
 *
 * The game decides velocities (from input and frame data), and the result is
 * exactly repeatable. Gravity is applied here, as a vertical speed that resets
 * on the ground.
 *
 * The collider is a capsule standing on `position` (feet at position.y).
 */
export class CharacterBody {
  /**
   * @param {import('./Physics.js').Physics} physics
   * @param {object} options
   * @param {{ x: number, y: number, z: number }} options.position  feet
   * @param {number} [options.radius=0.35]
   * @param {number} [options.height=1.6]  total capsule height
   * @param {number} [options.stepHeight=0.35]
   * @param {number} [options.maxSlopeDeg=46]
   * @param {number} [options.snapDistance=0.35]
   */
  constructor(physics, { position, radius = 0.35, height = 1.6, stepHeight = 0.35, maxSlopeDeg = 46, snapDistance = 0.35 }) {
    const R = physics.R;
    this.physics = physics;
    this.radius = radius;
    this.height = height;
    this.halfHeight = Math.max(0.01, height / 2 - radius);
    this.centerOffset = height / 2;

    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y + this.centerOffset, position.z),
    );
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(this.halfHeight, radius), this.body);

    this.controller = physics.world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle((maxSlopeDeg * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle(((maxSlopeDeg + 4) * Math.PI) / 180);
    this.controller.enableAutostep(stepHeight, radius * 0.5, false);
    this.controller.enableSnapToGround(snapDistance);

    /** Feet position after the last move. */
    this.position = { x: position.x, y: position.y, z: position.z };
    /** Vertical speed, m/s (gravity accumulates here while airborne). */
    this.vy = 0;
    this.grounded = false;
    /** Updates since the character last touched the ground (0 while grounded). */
    this.airFrames = 0;
  }

  /**
   * Move by a horizontal displacement this step; gravity is added here.
   * Call once per fixed update, before Physics.step().
   * @param {number} dx  metres this step
   * @param {number} dz
   * @param {number} dt  seconds
   */
  move(dx, dz, dt) {
    if (this.grounded && this.vy < 0) this.vy = -2; // keep pressing into the floor so snapping works
    else this.vy += this.physics.gravity * dt;
    if (this.vy < -40) this.vy = -40;

    const desired = { x: dx, y: this.vy * dt, z: dz };
    this.controller.computeColliderMovement(this.collider, desired, this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    this.airFrames = this.grounded ? 0 : this.airFrames + 1;
    if (this.grounded && this.vy < 0) this.vy = -2;
    // Bumped a ceiling: stop rising.
    if (this.vy > 0 && moved.y < desired.y * 0.5) this.vy = 0;

    const t = this.body.translation();
    const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z };
    this.body.setNextKinematicTranslation(next);
    this.position.x = next.x;
    this.position.y = next.y - this.centerOffset;
    this.position.z = next.z;
    return moved;
  }

  /**
   * Put the character somewhere without sweeping (respawn).
   * @param {{ x: number, y: number, z: number }} p  feet
   */
  teleport(p) {
    this.body.setTranslation({ x: p.x, y: p.y + this.centerOffset, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + this.centerOffset, z: p.z });
    this.position = { x: p.x, y: p.y, z: p.z };
    this.vy = 0;
  }

  /** Turn collisions with this character on or off (off while dead). */
  setSolid(solid) {
    this.collider.setEnabled(solid);
  }

  dispose() {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
}
