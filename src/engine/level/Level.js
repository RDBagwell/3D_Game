import { Box3, Vector3, Quaternion, Euler } from 'three';
import { parseNodeName } from './levelNames.js';

/**
 * Turns a scene graph (a loaded glTF scene, or one built in code) into a
 * playable level, following the naming convention in levelNames.js:
 *
 *   const level = Level.fromScene(gltf.scene, physics);
 *   scene.add(level.root);
 *   level.spawns.player.start;        // { position, yaw }
 *   level.surfaceAt(player.position); // 'stone'
 *   level.updateTriggers(id, position, onEnter, onExit)
 *
 * Collider, area, spawn and trigger objects are hidden; everything else is
 * drawn. Colliders are created in world space (each object's full transform
 * is baked in), so scaling or rotating a collider in Blender just works.
 *
 * The training grounds are built in code (src/game/scenes/trainingGrounds.js)
 * with the same names and go through this same function, so a level made in
 * Blender is a drop-in replacement.
 */

/** @typedef {{ position: Vector3, yaw: number }} Spawn */
/** @typedef {{ type: string, name: string, position: Vector3, yaw: number }} EnemySpawn */

export class Level {
  /**
   * @param {import('three').Object3D} root
   */
  constructor(root) {
    this.root = root;
    /** Surface zones, in priority order (smallest first, so a path inside a meadow wins). @type {{ surface: string, box: Box3 }[]} */
    this.areas = [];
    /** @type {{ player: Record<string, Spawn>, enemies: EnemySpawn[] }} */
    this.spawns = { player: {}, enemies: [] };
    /** @type {{ id: string, box: Box3 }[]} */
    this.triggers = [];
    /** Number of physics colliders made. */
    this.colliderCount = 0;
    /** Which triggers each actor is inside: actorId -> set of trigger indexes. @type {Map<string, Set<number>>} */
    this.inside = new Map();
    /** Surface used where no area matches. */
    this.defaultSurface = 'grass';
  }

  /**
   * @param {import('three').Object3D} root
   * @param {import('../physics/Physics.js').Physics} physics
   * @param {{ defaultSurface?: string }} [options]
   */
  static fromScene(root, physics, options = {}) {
    const level = new Level(root);
    if (options.defaultSurface) level.defaultSurface = options.defaultSurface;
    root.updateMatrixWorld(true);

    /** @type {import('three').Object3D[]} */
    const hide = [];
    root.traverse((object) => {
      const meaning = parseNodeName(object.name);
      switch (meaning.kind) {
        case 'collider': {
          // A collider can be one mesh or a group of meshes.
          object.traverse((child) => {
            const mesh = /** @type {import('three').Mesh} */ (child);
            if (mesh.isMesh) {
              addMeshCollider(mesh, physics);
              level.colliderCount++;
            }
          });
          hide.push(object);
          break;
        }
        case 'colliderBox': {
          addBoxCollider(object, physics);
          level.colliderCount++;
          hide.push(object);
          break;
        }
        case 'area': {
          const box = new Box3().setFromObject(object);
          // Surfaces are usually flat planes: give the zone some height so feet are inside it.
          box.min.y -= 0.5;
          box.max.y += 2;
          level.areas.push({ surface: meaning.surface, box });
          hide.push(object);
          break;
        }
        case 'spawn': {
          const spawn = { position: object.getWorldPosition(new Vector3()), yaw: worldYaw(object) };
          if (meaning.role === 'player') level.spawns.player[meaning.name] = spawn;
          else level.spawns.enemies.push({ type: meaning.enemyType, name: meaning.name, ...spawn });
          hide.push(object);
          break;
        }
        case 'trigger': {
          level.triggers.push({ id: meaning.id, box: new Box3().setFromObject(object) });
          hide.push(object);
          break;
        }
        default:
          break;
      }
    });
    for (const object of hide) object.visible = false;
    level.areas.sort((a, b) => volume(a.box) - volume(b.box));
    return level;
  }

  /**
   * The surface under a position: the smallest area containing it.
   * @param {{ x: number, y: number, z: number }} position
   */
  surfaceAt(position) {
    const p = new Vector3(position.x, position.y, position.z);
    for (const area of this.areas) {
      if (area.box.containsPoint(p)) return area.surface;
    }
    return this.defaultSurface;
  }

  /**
   * Check an actor against every trigger and report changes.
   * @param {string} actorId
   * @param {{ x: number, y: number, z: number }} position
   * @param {(id: string) => void} onEnter
   * @param {(id: string) => void} [onExit]
   */
  updateTriggers(actorId, position, onEnter, onExit) {
    let set = this.inside.get(actorId);
    if (!set) this.inside.set(actorId, (set = new Set()));
    const p = new Vector3(position.x, position.y + 0.5, position.z);
    this.triggers.forEach((trigger, index) => {
      const now = trigger.box.containsPoint(p);
      if (now && !set.has(index)) {
        set.add(index);
        onEnter(trigger.id);
      } else if (!now && set.has(index)) {
        set.delete(index);
        onExit?.(trigger.id);
      }
    });
  }
}

/**
 * @param {import('three').Mesh} mesh
 * @param {import('../physics/Physics.js').Physics} physics
 */
function addMeshCollider(mesh, physics) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const vertices = new Float32Array(position.count * 3);
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    vertices[i * 3] = v.x;
    vertices[i * 3 + 1] = v.y;
    vertices[i * 3 + 2] = v.z;
  }
  let indices;
  if (geometry.index) {
    indices = Uint32Array.from(geometry.index.array);
  } else {
    indices = new Uint32Array(position.count);
    for (let i = 0; i < position.count; i++) indices[i] = i;
  }
  physics.addStaticMesh(vertices, indices);
}

/**
 * A box collider matching an object's local bounds and its full transform.
 * @param {import('three').Object3D} object
 * @param {import('../physics/Physics.js').Physics} physics
 */
function addBoxCollider(object, physics) {
  // Local-space bounds (ignoring the object's own transform), then apply it.
  const inverse = object.matrixWorld.clone().invert();
  const local = new Box3();
  object.traverse((child) => {
    const mesh = /** @type {import('three').Mesh} */ (child);
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    local.union(box);
  });
  if (local.isEmpty()) local.set(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  object.matrixWorld.decompose(position, quaternion, scale);
  const size = local.getSize(new Vector3()).multiply(scale).multiplyScalar(0.5);
  const centre = local.getCenter(new Vector3()).multiply(scale).applyQuaternion(quaternion).add(position);
  physics.addStaticBox({ x: size.x, y: size.y, z: size.z }, centre, { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w });
}

/** @param {import('three').Object3D} object */
function worldYaw(object) {
  const q = object.getWorldQuaternion(new Quaternion());
  return new Euler().setFromQuaternion(q, 'YXZ').y;
}

/** @param {Box3} box */
function volume(box) {
  const s = box.getSize(new Vector3());
  return s.x * s.y * s.z;
}
