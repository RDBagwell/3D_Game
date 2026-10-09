import RAPIER from '@dimforge/rapier3d-compat';
import { CharacterBody } from './CharacterBody.js';

/**
 * The Rapier world, and the few things the game asks of it.
 *
 * We use `@dimforge/rapier3d-compat` (the WebAssembly is inlined as base64),
 * which needs no bundler plugins, works the same in Vite, on GitHub Pages and
 * in Node for tests. `createPhysics()` must be awaited once before anything
 * else: it loads the WebAssembly.
 *
 * Static level geometry is fixed bodies (triangle meshes or boxes). Characters
 * are kinematic bodies moved by Rapier's character controller (see
 * CharacterBody.js). Nothing in the game is a dynamic rigid body, so the
 * simulation is fully deterministic and cheap.
 *
 * The world steps at the loop's fixed rate (1/60 s), never with a variable
 * dt: `step()` is called once per FixedStepLoop update.
 */

let initialised = false;

/**
 * @param {object} [options]
 * @param {number} [options.gravity=-24]  m/s². Stronger than Earth's 9.81, as most action games use: falls feel snappy, not floaty.
 * @param {number} [options.step=1/60]
 */
export async function createPhysics(options = {}) {
  if (!initialised) {
    await RAPIER.init();
    initialised = true;
  }
  return new Physics(options);
}

export class Physics {
  /**
   * @param {object} [options]
   * @param {number} [options.gravity]
   * @param {number} [options.step]
   */
  constructor({ gravity = -24, step = 1 / 60 } = {}) {
    this.R = RAPIER;
    this.gravity = gravity;
    // Gravity is applied by the character controller, not by Rapier: there are no dynamic bodies.
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = step;
    /** Milliseconds the last step() took (for the performance HUD). */
    this.lastStepMs = 0;
    /** @type {CharacterBody[]} */
    this.characters = [];
  }

  /**
   * A fixed triangle-mesh collider, in world space.
   * @param {Float32Array} vertices  x, y, z triples
   * @param {Uint32Array} indices
   */
  addStaticMesh(vertices, indices) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), body);
  }

  /**
   * A fixed box collider.
   * @param {{ x: number, y: number, z: number }} halfExtents
   * @param {{ x: number, y: number, z: number }} position  centre
   * @param {{ x: number, y: number, z: number, w: number }} [rotation]  quaternion
   */
  addStaticBox(halfExtents, position, rotation = { x: 0, y: 0, z: 0, w: 1 }) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z).setRotation(rotation));
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z), body);
  }

  /**
   * A character moved by the kinematic character controller.
   * @param {ConstructorParameters<typeof CharacterBody>[1]} options
   */
  createCharacter(options) {
    const character = new CharacterBody(this, options);
    this.characters.push(character);
    return character;
  }

  /** @param {CharacterBody} character */
  removeCharacter(character) {
    character.dispose();
    this.characters = this.characters.filter((c) => c !== character);
  }

  step() {
    const start = performance.now();
    this.world.step();
    this.lastStepMs = performance.now() - start;
  }

  /**
   * Distance along a ray to the first static surface, or null. Characters are
   * ignored (the camera shouldn't bump into a grunt).
   * @param {{ x: number, y: number, z: number }} origin
   * @param {{ x: number, y: number, z: number }} dir  normalised
   * @param {number} maxDistance
   */
  rayDistance(origin, dir, maxDistance) {
    const hit = this.world.castRay(new RAPIER.Ray(origin, dir), maxDistance, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    return hit ? hit.timeOfImpact : null;
  }

  /**
   * Sweep a sphere from `origin` along `dir`; the distance it can travel
   * before touching static geometry, or null if it's clear. Used by the
   * camera so it stops short of walls rather than clipping into them.
   * @param {{ x: number, y: number, z: number }} origin
   * @param {{ x: number, y: number, z: number }} dir  normalised
   * @param {number} maxDistance
   * @param {number} radius
   */
  sphereCast(origin, dir, maxDistance, radius) {
    const hit = this.world.castShape(
      origin,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      new RAPIER.Ball(radius),
      0,
      maxDistance,
      false, // ignore anything the sphere already overlaps at the start
      RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
    );
    return hit ? hit.time_of_impact : null;
  }

  /** Line segments of every collider, for the "colliders" view in the lab. */
  debugLines() {
    return this.world.debugRender().vertices;
  }

  dispose() {
    this.world.free();
  }
}
