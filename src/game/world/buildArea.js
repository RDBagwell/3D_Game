import {
  Group, Mesh, BoxGeometry, CylinderGeometry, MeshStandardMaterial, Object3D, InstancedMesh, Matrix4, Quaternion, Vector3, Euler,
} from 'three';
import { buildTrainingGrounds } from '../scenes/trainingGrounds.js';

/**
 * Turns an area's data (src/game/data/areas/) into a scene graph named with
 * the Blender convention (docs/BLENDER.md), which `Level.fromScene` then reads
 * exactly as it would read a glTF exported from Blender:
 *
 *   blocks    → a box mesh + its `collider_box_` twin
 *   surfaces  → `area_<surface>_` boxes (footstep sounds)
 *   rooms     → dungeon floor tiles and walls (KayKit modules) + wall colliders
 *   props     → instanced models (+ a `collider_box_` when `solid`)
 *   spawns    → `spawn_player_<name>`      enemies → `spawn_enemy_<type>_<name>`
 *   npcs      → `npc_<id>`                 objects → `object_<id>`
 *   exits     → `exit_<area>_<spawn>`      triggers → `trigger_<id>`
 *   markers   → `marker_<name>`
 *
 * So an area can be rebuilt in Blender with the same names and dropped in
 * instead of its data. `models` is optional: without it (tests in Node) only
 * the invisible parts and plain blocks are made, which is all physics needs.
 *
 * Props are drawn as one InstancedMesh per model and mesh, so a hundred wall
 * pieces cost a handful of draw calls.
 */

/** Plain colours for blocks, by name. */
export const PALETTE = {
  grass: 0x8acb6b,
  meadow: 0x9ed27a,
  sand: 0xead9a6,
  dirt: 0xc99a62,
  path: 0xd8b07a,
  stone: 0xb9b4c9,
  slate: 0x6e6a7e,
  wood: 0xb57a4a,
  plank: 0xc98a52,
  wall: 0xf0dfb8,
  trim: 0x6c5aa6,
  water: 0x3f8fd0,
  cliff: 0x8c8074,
  ash: 0x4b4552,
  ember: 0xff7a2a,
};

/** Dungeon modules are 4 units; at this scale a wall piece is 3 m long and 3 m tall. */
export const DUNGEON_SCALE = 0.75;
export const MODULE = 4 * DUNGEON_SCALE;

/**
 * @typedef {[number, number, number]} Vec3
 * @typedef {{ name: string, size: Vec3, at: Vec3, material: keyof typeof PALETTE, rotY?: number, rotX?: number, collide?: boolean, hidden?: boolean, shadow?: boolean, shape?: 'box' | 'cylinder' }} BlockDef
 * @typedef {{ model: string, at: Vec3, yaw?: number, scale?: number, solid?: Vec3, solidAt?: Vec3 }} PropDef
 * @typedef {{ name: string, at: [number, number], size: [number, number], doors?: Partial<Record<'n' | 's' | 'e' | 'w', number[]>>, gated?: Partial<Record<'n' | 's' | 'e' | 'w', number[]>>, open?: ('n' | 's' | 'e' | 'w')[], floor?: string, height?: number }} RoomDef
 * @typedef {object} AreaDef
 * @property {string} id
 * @property {string} name  shown when you arrive and in save slots
 * @property {string} music  track name (docs/AUDIO.md)
 * @property {string} ambience  ambient sound loop (data/sounds.js AMBIENCE)
 * @property {'day' | 'halls'} look  sky, fog and lighting preset
 * @property {string} defaultSurface  footsteps where no surface zone matches
 * @property {boolean} [respawnEnemies]  enemies come back after a while (training); otherwise they stay down until you rest or die
 * @property {'trainingGrounds'} [scene]  build this scene in code first, then add the rest
 * @property {number} [killY]  falling below this height puts the hero back on solid ground (default PLAYER.fall.killY)
 * @property {BlockDef[]} [blocks]
 * @property {{ surface: string, size: Vec3, at: Vec3 }[]} [surfaces]
 * @property {RoomDef[]} [rooms]
 * @property {PropDef[]} [props]
 * @property {Record<string, { at: Vec3, yaw?: number }>} spawns
 * @property {{ type: string, name: string, at: Vec3, yaw?: number, unless?: Record<string, any>, defeat?: Record<string, any>[], behind?: string }[]} [enemies]
 *           `unless`: the enemy isn't there when this is true (a beaten boss); `defeat`: effects when it falls
 * @property {{ id: string, at: Vec3, yaw?: number, behind?: string }[]} [npcs]
 * @property {{ id: string, at: Vec3, yaw?: number, behind?: string }[]} [objects]
 * @property {{ to: string, spawn?: string, at: Vec3, size: Vec3, behind?: string }[]} [exits]
 *           `behind` (any placement): the gate or door object that must be open to reach it. Only the
 *           content validator's reachability check reads it; the walls themselves do the blocking.
 * @property {{ id: string, at: Vec3, size: Vec3 }[]} [triggers]
 * @property {Record<string, Vec3>} [markers]
 * @property {{ at: Vec3, color?: number, intensity?: number, distance?: number }[]} [lights]
 */

/**
 * @param {AreaDef} area
 * @param {Record<string, any>} [models]  loaded glTFs by MODELS key (null when missing)
 * @returns {Group}
 */
export function buildArea(area, models) {
  const root = area.scene === 'trainingGrounds' ? buildTrainingGrounds() : new Group();
  root.name = `level_${area.id}`;
  /** @type {Map<string, MeshStandardMaterial>} */
  const materials = new Map();
  const material = (/** @type {string} */ name) => {
    if (!materials.has(name)) {
      materials.set(name, new MeshStandardMaterial({ color: PALETTE[/** @type {keyof typeof PALETTE} */ (name)] ?? 0xff00ff, roughness: 0.92 }));
    }
    return /** @type {MeshStandardMaterial} */ (materials.get(name));
  };
  /** Prop placements, grouped by model, drawn instanced at the end. @type {Map<string, Matrix4[]>} */
  const placements = new Map();

  const named = (/** @type {Object3D} */ o, /** @type {string} */ name, /** @type {Vec3} */ at, yaw = 0) => {
    o.name = name;
    o.userData.area = true; // built for this area: freed when it's left
    o.position.set(...at);
    o.rotation.y = yaw;
    root.add(o);
    return o;
  };
  const box = (/** @type {Vec3} */ size) => new Mesh(new BoxGeometry(...size));
  let counter = 0;
  const unique = (/** @type {string} */ name) => `${name}_${++counter}`;

  /** A solid, invisible box (a wall's collision). */
  const colliderBox = (/** @type {string} */ name, /** @type {Vec3} */ size, /** @type {Vec3} */ at, yaw = 0) => named(box(size), `collider_box_${unique(name)}`, at, yaw);

  for (const b of area.blocks ?? []) {
    if (b.hidden) {
      // Collision only: the invisible edges of the world.
      colliderBox(b.name, b.size, b.at, b.rotY ?? 0);
      continue;
    }
    const geometry = b.shape === 'cylinder' ? new CylinderGeometry(b.size[0] / 2, b.size[0] / 2, b.size[1], 40) : new BoxGeometry(...b.size);
    const mesh = new Mesh(geometry, material(b.material));
    mesh.name = b.name;
    mesh.userData.area = true;
    mesh.position.set(...b.at);
    mesh.rotation.set(b.rotX ?? 0, b.rotY ?? 0, 0);
    mesh.castShadow = b.shadow ?? false;
    mesh.receiveShadow = true;
    root.add(mesh);
    if (b.collide ?? true) {
      const twin = new Mesh(geometry);
      twin.name = `collider_box_${b.name}`;
      twin.position.copy(mesh.position);
      twin.rotation.copy(mesh.rotation);
      root.add(twin);
    }
  }

  for (const s of area.surfaces ?? []) named(box(s.size), `area_${s.surface}_${++counter}`, s.at);

  const place = (/** @type {string} */ model, /** @type {Vec3} */ at, yaw = 0, scale = 1) => {
    const m = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(scale, scale, scale));
    if (!placements.has(model)) placements.set(model, []);
    /** @type {Matrix4[]} */ (placements.get(model)).push(m);
  };

  // Each room's pieces are instanced on their own, so rooms out of view are culled.
  for (const room of area.rooms ?? []) buildRoom(room, (model, at, yaw, scale) => place(`${model}@${room.name}`, at, yaw, scale), colliderBox);

  for (const p of area.props ?? []) {
    place(p.model, p.at, p.yaw ?? 0, p.scale ?? 1);
    if (p.solid) {
      const yaw = p.yaw ?? 0;
      const off = p.solidAt ?? [0, 0, 0];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // The collider stands on the prop's base, offset in the prop's own frame.
      const at = /** @type {Vec3} */ ([p.at[0] + off[0] * c + off[2] * s, p.at[1] + off[1] + p.solid[1] / 2, p.at[2] - off[0] * s + off[2] * c]);
      colliderBox(`prop_${p.model}`, p.solid, at, yaw);
    }
  }

  for (const [name, s] of Object.entries(area.spawns)) named(new Object3D(), name === 'start' ? 'spawn_player' : `spawn_player_${name}`, s.at, s.yaw ?? 0);
  for (const e of area.enemies ?? []) named(new Object3D(), `spawn_enemy_${e.type}_${e.name}`, e.at, e.yaw ?? 0);
  for (const n of area.npcs ?? []) named(new Object3D(), `npc_${n.id}`, n.at, n.yaw ?? 0);
  for (const o of area.objects ?? []) named(new Object3D(), `object_${o.id}`, o.at, o.yaw ?? 0);
  for (const e of area.exits ?? []) named(box(e.size), `exit_${e.to}_${e.spawn ?? 'start'}`, e.at);
  for (const t of area.triggers ?? []) named(box(t.size), `trigger_${t.id}`, t.at);
  for (const [name, at] of Object.entries(area.markers ?? {})) named(new Object3D(), `marker_${name}`, at);

  if (models) {
    for (const [key, matrices] of placements) {
      // "model!nodoor" draws the model without its door (KayKit's doorway has one, closed);
      // "@room" groups a room's pieces.
      const [model, option] = key.split('@')[0].split('!');
      const gltf = models[model];
      if (gltf) root.add(instanced(gltf.scene, matrices, key, option === 'nodoor' ? (name) => name.endsWith('_door') : () => false));
    }
  }
  return root;
}

/**
 * A dungeon room from KayKit modules: floor tiles, walls along each side
 * (doorways where `doors` says), corner pieces, and one collider per wall run.
 *
 *   at    the room's centre (x, z); size its width (x) and depth (z) in metres,
 *         multiples of MODULE (3 m)
 *   doors per side, the module indexes (0 = west/north end) that are open archways
 *   gated per side, doorways left empty for a gate or door object (OBJECTS) to fill
 *   open  sides with no wall at all (where a corridor joins a room)
 *
 * @param {RoomDef} room
 * @param {(model: string, at: Vec3, yaw?: number, scale?: number) => void} place
 * @param {(name: string, size: Vec3, at: Vec3, yaw?: number) => void} collider
 */
function buildRoom(room, place, collider) {
  const [cx, cz] = room.at;
  const [w, d] = room.size;
  const nx = Math.round(w / MODULE);
  const nz = Math.round(d / MODULE);
  const s = DUNGEON_SCALE;
  const h = room.height ?? 3;
  const floor = room.floor ?? 'dun_floor';
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      place(floor, [cx - w / 2 + MODULE * (i + 0.5), 0, cz - d / 2 + MODULE * (j + 0.5)], 0, s);
    }
  }
  const doors = room.doors ?? {};
  /** @type {[side: 'n' | 's' | 'e' | 'w', count: number, origin: [number, number], step: [number, number], yaw: number][]} */
  const sides = [
    ['n', nx, [cx - w / 2, cz - d / 2], [1, 0], 0],
    ['s', nx, [cx - w / 2, cz + d / 2], [1, 0], Math.PI],
    ['w', nz, [cx - w / 2, cz - d / 2], [0, 1], Math.PI / 2],
    ['e', nz, [cx + w / 2, cz - d / 2], [0, 1], -Math.PI / 2],
  ];
  const thick = 0.75;
  for (const [side, count, [ox, oz], [sx, sz], yaw] of sides) {
    if (room.open?.includes(side)) continue;
    const gated = room.gated?.[side] ?? [];
    const openings = [...(doors[side] ?? []), ...gated];
    let runStart = 0;
    const flush = (/** @type {number} */ end) => {
      if (end <= runStart) return;
      const len = (end - runStart) * MODULE;
      const mid = (runStart + end) / 2 * MODULE;
      const along = sx !== 0;
      collider(`wall_${room.name}_${side}`, along ? [len, h + 1, thick] : [thick, h + 1, len], [ox + sx * mid, (h + 1) / 2, oz + sz * mid]);
    };
    for (let i = 0; i < count; i++) {
      const at = /** @type {Vec3} */ ([ox + sx * MODULE * (i + 0.5), 0, oz + sz * MODULE * (i + 0.5)]);
      if (openings.includes(i)) {
        // An open archway: the doorway module without its door (a gate object draws its own).
        if (!gated.includes(i)) place('dun_wall_doorway!nodoor', at, yaw, s);
        // The doorway's jambs: solid either side of a 1.6 m opening.
        const jamb = (MODULE - 1.6) / 2;
        for (const k of [-1, 1]) {
          const off = (MODULE / 2 - jamb / 2) * k;
          collider(`jamb_${room.name}_${side}`, sx !== 0 ? [jamb, h + 1, thick] : [thick, h + 1, jamb], [at[0] + sx * off, (h + 1) / 2, at[2] + sz * off]);
        }
        flush(i);
        runStart = i + 1;
      } else {
        place('dun_wall', at, yaw, s);
      }
    }
    flush(count);
  }
  // Pillars hide the seams at the corners.
  for (const [px, pz] of [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2]]) {
    place('dun_column', [px, 0, pz], 0, 1.3 * s * 2);
  }
}

/**
 * One InstancedMesh per mesh in the model, sharing its geometry and material.
 * @param {Object3D} scene
 * @param {Matrix4[]} matrices
 * @param {string} name
 * @param {(meshName: string) => boolean} skip  parts to leave out
 */
function instanced(scene, matrices, name, skip) {
  const group = new Group();
  group.name = `props_${name}`;
  scene.updateMatrixWorld(true);
  const inverseRoot = scene.matrixWorld.clone().invert();
  scene.traverse((o) => {
    const mesh = /** @type {Mesh} */ (o);
    if (!mesh.isMesh || skip(mesh.name)) return;
    const local = new Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
    const inst = new InstancedMesh(mesh.geometry, mesh.material, matrices.length);
    const m = new Matrix4();
    matrices.forEach((placement, i) => inst.setMatrixAt(i, m.multiplyMatrices(placement, local)));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);
  });
  return group;
}
