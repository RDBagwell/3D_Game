import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Object3D } from 'three';

/**
 * The training grounds: the combat sandbox, built from boxes in code.
 *
 *              z = -36  ┌───────────── arena (dirt): three grunts ─────────────┐
 *                       │      grunt a        grunt c         grunt b           │
 *              z = -18  └──────── wall ────────┐  gate  ┌──────── wall ────────┘
 *                         pillar (camera test) │        │
 *              z = -11   steps → stone ledge   │  path  │   ramp → wood deck
 *              z = -4                     [dummy on the stone plaza]
 *              z = +1.5                        you start here, facing the dummy
 *
 * Everything is named with the Blender convention (docs/BLENDER.md), and the
 * game loads it through the same `Level.fromScene` as a glTF export:
 * `collider_box_*` twins give each solid block its collision, `area_*` boxes
 * set the footstep surface, `spawn_*` empties place the player, the dummy
 * and the grunts, and `trigger_arena` marks the gate. Swapping this for a
 * level built in Blender is a change of one line in Game.js.
 *
 * `materials` is optional so tests can build the level in Node.
 */

/**
 * @typedef {object} LevelMaterials
 * @property {import('three').Material} grass
 * @property {import('three').Material} dirt
 * @property {import('three').Material} stone
 * @property {import('three').Material} wood
 * @property {import('three').Material} wall
 * @property {import('three').Material} trim
 */

/** @returns {LevelMaterials} */
export function plainMaterials() {
  const m = (/** @type {number} */ color, roughness = 0.9) => new MeshStandardMaterial({ color, roughness, metalness: 0 });
  return {
    grass: m(0x8acb6b),
    dirt: m(0xd2a467),
    stone: m(0xc2bdd4),
    wood: m(0xc98552),
    wall: m(0xf0dfb8),
    trim: m(0x6c5aa6),
  };
}

/**
 * @param {Partial<LevelMaterials>} [materials]
 * @returns {Group}
 */
export function buildTrainingGrounds(materials = {}) {
  const mats = { ...plainMaterials(), ...materials };
  const root = new Group();
  root.name = 'training_grounds';

  /**
   * A solid block: the visible mesh plus its invisible `collider_box_` twin,
   * exactly as you'd model it in Blender.
   * @param {string} name
   * @param {[number, number, number]} size
   * @param {[number, number, number]} center
   * @param {import('three').Material} material
   * @param {{ rotX?: number, rotY?: number, collide?: boolean, shadow?: boolean }} [opts]
   */
  const block = (name, size, center, material, { rotX = 0, rotY = 0, collide = true, shadow = true } = {}) => {
    const geometry = new BoxGeometry(...size);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...center);
    mesh.rotation.set(rotX, rotY, 0);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
    if (collide) {
      const twin = new Mesh(geometry);
      twin.name = `collider_box_${name}`;
      twin.position.copy(mesh.position);
      twin.rotation.copy(mesh.rotation);
      root.add(twin);
    }
    return mesh;
  };

  /**
   * A surface zone (footstep sounds).
   * @param {string} surface
   * @param {[number, number, number]} size
   * @param {[number, number, number]} center
   */
  const area = (surface, size, center) => {
    const zone = new Mesh(new BoxGeometry(...size));
    zone.name = `area_${surface}_${root.children.length}`;
    zone.position.set(...center);
    root.add(zone);
  };

  /**
   * @param {string} name  e.g. 'spawn_player'
   * @param {[number, number, number]} position
   * @param {number} yaw
   */
  const empty = (name, position, yaw) => {
    const o = new Object3D();
    o.name = name;
    o.position.set(...position);
    o.rotation.y = yaw;
    root.add(o);
  };

  // Ground: a big grass field, with a dirt path and arena and a stone plaza inlaid.
  block('ground', [60, 1, 76], [0, -0.5, -12], mats.grass, { shadow: false });
  block('plaza', [9, 0.06, 9], [0, 0.0, -4], mats.stone, { collide: false, shadow: false });
  block('path', [3.2, 0.05, 11], [0, 0.0, -13.5], mats.dirt, { collide: false, shadow: false });
  block('arena_floor', [26, 0.05, 18], [0, 0.0, -28], mats.dirt, { collide: false, shadow: false });
  area('stone', [9, 0.1, 9], [0, 0, -4]);
  area('dirt', [3.2, 0.1, 11], [0, 0, -13.5]);
  area('dirt', [26, 0.1, 18], [0, 0, -28]);

  // Ramp up to a wooden deck (east): a 14° slope, walkable.
  const rampAngle = Math.atan2(1.5, 6);
  const rampLength = Math.hypot(1.5, 6);
  const nx = 0;
  const ny = Math.cos(rampAngle);
  const nz = Math.sin(rampAngle);
  block('ramp', [3, 0.4, rampLength], [9, 0.75 - ny * 0.2, -3 - nz * 0.2 + nx], mats.wood, { rotX: rampAngle });
  block('deck', [5, 1.5, 5], [9.5, 0.75, -8.5], mats.wood);
  area('wood', [3, 3, 6.2], [9, 1, -3]);
  area('wood', [5, 1, 5], [9.5, 1.5, -8.5]);
  block('deck_rail', [5, 0.5, 0.2], [9.5, 1.75, -11], mats.trim);

  // Steps up to a stone ledge (west): five steps of 0.3 m, under the controller's step height.
  for (let i = 0; i < 5; i++) {
    const h = 0.3 * (i + 1);
    block(`step_${i}`, [3, h, 0.5], [-8.5, h / 2, -2.25 - 0.5 * i], mats.stone);
  }
  block('ledge', [5, 1.5, 5], [-9.5, 0.75, -7], mats.stone);
  area('stone', [3, 2, 2.6], [-8.5, 0.8, -3.25]);
  area('stone', [5, 1, 5], [-9.5, 1.5, -7]);

  // The north wall with its gate, and a pillar next to it to back the camera into.
  block('wall_west', [17.5, 3.5, 0.6], [-11.25, 1.75, -18], mats.wall);
  block('wall_east', [17.5, 3.5, 0.6], [11.25, 1.75, -18], mats.wall);
  block('wall_west_cap', [17.7, 0.25, 0.8], [-11.25, 3.6, -18], mats.trim, { collide: false });
  block('wall_east_cap', [17.7, 0.25, 0.8], [11.25, 3.6, -18], mats.trim, { collide: false });
  block('gate_post_w', [0.8, 4.2, 0.8], [-2.4, 2.1, -18], mats.trim);
  block('gate_post_e', [0.8, 4.2, 0.8], [2.4, 2.1, -18], mats.trim);
  block('pillar', [1.6, 4, 1.6], [5.5, 2, -14.5], mats.wall);
  block('corner_wall', [0.5, 3, 5], [-4.5, 1.5, -14.5], mats.wall);

  // Field boundary: low walls all round so nobody leaves the map.
  block('border_n', [60, 1.2, 0.6], [0, 0.6, -49.7], mats.wall);
  block('border_s', [60, 1.2, 0.6], [0, 0.6, 25.7], mats.wall);
  block('border_w', [0.6, 1.2, 76], [-29.7, 0.6, -12], mats.wall);
  block('border_e', [0.6, 1.2, 76], [29.7, 0.6, -12], mats.wall);

  // A few low crates in the arena to fight around.
  block('arena_block_a', [1.4, 0.9, 1.4], [-7, 0.45, -24], mats.wood);
  block('arena_block_b', [1.4, 0.9, 1.4], [8, 0.45, -31], mats.wood);

  // Who goes where.
  empty('spawn_player', [0, 0, 1.5], Math.PI);
  empty('spawn_enemy_dummy', [0, 0, -4], 0);
  empty('spawn_enemy_grunt_a', [-4.5, 0, -27], 0);
  empty('spawn_enemy_grunt_b', [4.5, 0, -28], 0);
  empty('spawn_enemy_grunt_c', [0, 0, -32], 0);

  // Walking through the gate: the game uses this to change the music and hint.
  const gate = new Mesh(new BoxGeometry(4, 3, 1.5));
  gate.name = 'trigger_arena_gate';
  gate.position.set(0, 1.5, -18);
  root.add(gate);

  return root;
}

/** Where props stand (visual only, each with its own collider): kind, position, yaw. */
export const PROPS = [
  { kind: 'barrel', position: [-5.5, 0, -1.5], yaw: 0.3 },
  { kind: 'barrel', position: [-6.3, 0, -0.8], yaw: 1.2 },
  { kind: 'crate', position: [5.6, 0, -1.2], yaw: 0.4 },
  { kind: 'crate', position: [5.2, 0, -2.4], yaw: -0.2 },
  { kind: 'target', position: [-3.5, 0, -9.5], yaw: 0.6 },
  { kind: 'target', position: [3.5, 0, -9.5], yaw: -0.6 },
  { kind: 'barrel', position: [11, 1.5, -10], yaw: 0 },
  { kind: 'crate', position: [-11, 1.5, -8.5], yaw: 0.8 },
];
