/**
 * Cinder Cove: the village hub (docs/STORY.md).
 *
 *            z = -33   ══════ cliff ══════╗ gate ╔══════ cliff ══════   (the Hearth Halls lie behind the gate)
 *            z = -24        Ina ▸ by the gate                 satchel among the rocks (north-east)
 *            z = -14   training ring (Dorran, dummy)   houses        tavern
 *            z =   4                        well · square           Bram's forge
 *            z =  27   Wren on the shore           ║ dock
 *            z =  40                               ║ you land here
 *
 * Units are metres; +x is east, +z is south. Buildings from KayKit's Medieval
 * Hexagon pack are tiny (a house is under one unit), hence the scale of 5.
 */

const B = 5; // building scale

/** A line of fence pieces from a to b (each piece is 1.15 units long, offset 1 unit from its origin). */
function fenceLine(/** @type {[number, number]} */ a, /** @type {[number, number]} */ b, scale = 2.4) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / (1.15 * scale)));
  const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    // The model's rail runs along its z axis, 1 unit to the side of its origin: shift it back.
    pieces.push({ model: 'fence', at: /** @type {[number, number, number]} */ ([x + Math.cos(yaw) * scale, 0, z - Math.sin(yaw) * scale]), yaw, scale });
  }
  return pieces;
}

/** The training ring's fence: a circle with a gap facing the village. */
function ring(/** @type {[number, number]} */ c, r, gapAngle) {
  const pieces = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(mid - gapAngle), Math.cos(mid - gapAngle))) < 0.45) continue;
    pieces.push(...fenceLine([c[0] + Math.sin(a0) * r, c[1] + Math.cos(a0) * r], [c[0] + Math.sin(a1) * r, c[1] + Math.cos(a1) * r]));
  }
  return pieces;
}

const trees = /** @type {import('../../world/buildArea.js').PropDef[]} */ ([
  [-30, -24, 'trees_a', 0.3], [-31, -6, 'trees_b', 1.2], [-31, 10, 'trees_a', 2.1], [30, -26, 'trees_b', 0.7],
  [31, -8, 'trees_a', 2.6], [31, 12, 'trees_b', 0.2], [-26, 20, 'tree', 0], [27, 22, 'tree', 1], [-8, -26, 'tree', 2],
  [9, -27, 'trees_b', 1.7], [-22, -30, 'tree', 0.4], [22, -30, 'tree', 2.2], [24, 4, 'tree', 0.9],
].map(([x, z, model, yaw]) => ({ model: String(model), at: [Number(x), 0, Number(z)], yaw: Number(yaw), scale: B, solid: model === 'tree' ? [1.2, 4, 1.2] : [6, 4, 6] })));

/** @type {import('../../world/buildArea.js').AreaDef} */
export const village = {
  id: 'village',
  name: 'Cinder Cove',
  music: 'village',
  ambience: 'shore',
  look: 'day',
  defaultSurface: 'grass',
  blocks: [
    // The island, the beach and the sea around it.
    { name: 'ground', size: [72, 1, 72], at: [0, -0.5, -4], material: 'grass' },
    { name: 'beach', size: [72, 1, 10], at: [0, -0.55, 35], material: 'sand' },
    { name: 'sea', size: [400, 0.2, 400], at: [0, -0.9, 0], material: 'water', collide: false },
    // Paths: dock to square to the Hearth gate, and out to the ring.
    { name: 'path_main', size: [3.6, 0.04, 56], at: [0, 0.01, 2], material: 'path', collide: false },
    { name: 'path_ring', size: [14, 0.04, 3], at: [-9, 0.012, -12], material: 'path', collide: false },
    { name: 'square', size: [16, 0.05, 14], at: [0, 0.015, 4], material: 'stone', collide: false },
    { name: 'ring_floor', size: [15, 0.04, 15], at: [-20, 0.013, -14], material: 'dirt', collide: false, shape: 'cylinder' },
    // The dock and Ren's boat.
    { name: 'dock', size: [3.4, 0.3, 16], at: [0, 0.0, 39], material: 'plank' },
    { name: 'dock_post_a', size: [0.4, 1.6, 0.4], at: [-1.8, -0.2, 46.5], material: 'wood' },
    { name: 'dock_post_b', size: [0.4, 1.6, 0.4], at: [1.8, -0.2, 46.5], material: 'wood' },
    { name: 'boat', size: [2.2, 0.7, 5], at: [3.6, -0.45, 43], material: 'wood' },
    { name: 'boat_seat', size: [2.2, 0.15, 0.5], at: [3.6, 0.0, 43], material: 'plank', collide: false },
    // The cliff along the north, with the gap for the Hearth gate.
    { name: 'cliff_w', size: [34, 10, 6], at: [-19, 5, -37], material: 'cliff', shadow: true },
    { name: 'cliff_e', size: [34, 10, 6], at: [19, 5, -37], material: 'cliff', shadow: true },
    { name: 'gate_alcove_w', size: [1.2, 10, 8], at: [-2.6, 5, -38], material: 'cliff' },
    { name: 'gate_alcove_e', size: [1.2, 10, 8], at: [2.6, 5, -38], material: 'cliff' },
    { name: 'gate_alcove_back', size: [6, 10, 1], at: [0, 5, -42], material: 'cliff' },
    { name: 'gate_steps', size: [4, 0.3, 6], at: [0, 0.15, -38], material: 'stone' },
    // The edge of the island: invisible walls in the shallows.
    { name: 'edge_s', size: [80, 4, 1], at: [0, 2, 40.5], material: 'water', collide: true, shadow: false, hidden: true },
    { name: 'edge_w', size: [1, 4, 90], at: [-36.5, 2, 0], material: 'water', hidden: true },
    { name: 'edge_e', size: [1, 4, 90], at: [36.5, 2, 0], material: 'water', hidden: true },
    { name: 'edge_dock_w', size: [0.4, 2, 9], at: [-1.9, 1, 43], material: 'water', hidden: true },
    { name: 'edge_dock_e', size: [0.4, 2, 9], at: [1.9, 1, 43], material: 'water', hidden: true },
    { name: 'edge_dock_end', size: [4, 2, 0.4], at: [0, 1, 47.2], material: 'water', hidden: true },
  ],
  surfaces: [
    { surface: 'wood', size: [3.4, 1, 16], at: [0, 0.2, 39] },
    { surface: 'sand', size: [72, 1, 9], at: [0, 0, 35] },
    { surface: 'dirt', size: [3.6, 1, 56], at: [0, 0, 2] },
    { surface: 'dirt', size: [15, 1, 15], at: [-20, 0, -14] },
    { surface: 'stone', size: [16, 1, 14], at: [0, 0, 4] },
    { surface: 'stone', size: [4, 1, 8], at: [0, 0, -38] },
  ],
  props: [
    { model: 'home_a', at: [-12, 0, 12], yaw: Math.PI / 2, scale: B, solid: [4.2, 4, 4.4] },
    { model: 'home_b', at: [-13, 0, -1], yaw: Math.PI / 2, scale: B, solid: [5, 5, 5.5] },
    { model: 'home_c', at: [12, 0, 14], yaw: -Math.PI / 2, scale: B, solid: [4.2, 4, 4.4] },
    { model: 'tavern', at: [14, 0, -4], yaw: -Math.PI / 2, scale: B, solid: [6.5, 6, 6] },
    { model: 'smithy', at: [16, 0, 5], yaw: -Math.PI / 2, scale: B, solid: [6.2, 4, 6.4] },
    { model: 'market', at: [-6, 0, 22], yaw: 0, scale: B * 0.8, solid: [7, 3, 5] },
    { model: 'well', at: [0, 0, 4], yaw: 0.4, scale: 3.5, solid: [2.2, 2, 2.2] },
    { model: 'weaponrack', at: [12.5, 0, 9], yaw: -Math.PI / 2, scale: B },
    { model: 'crate_big', at: [11.5, 0, 1.2], yaw: 0.3, scale: B, solid: [1, 1, 1] },
    { model: 'crate_big', at: [2.6, 0.15, 35.5], yaw: 0.1, scale: B, solid: [1, 1, 1] },
    { model: 'crate_big', at: [2.4, 1.2, 35.6], yaw: 0.7, scale: B * 0.9 },
    { model: 'sack', at: [-2.4, 0.15, 34], yaw: 0.5, scale: B },
    { model: 'sack', at: [-6, 0, 18.6], yaw: 1.4, scale: B },
    { model: 'wheelbarrow', at: [8, 0, 19], yaw: 2.2, scale: B, solid: [1.2, 1, 2.4] },
    { model: 'tent', at: [-24, 0, -3], yaw: 0.7, scale: B, solid: [2.6, 2.6, 2.6] },
    { model: 'flag', at: [-15.5, 0, -8], yaw: 0.8, scale: B },
    { model: 'flag', at: [-2.8, 0, -31], yaw: 0, scale: B },
    { model: 'flag', at: [2.8, 0, -31], yaw: 0, scale: B },
    // The rocks where Wren lost her satchel, and the shore where she waits.
    { model: 'rock_c', at: [21, 0, -17], yaw: 0.4, scale: B * 1.4, solid: [2.2, 1.2, 2.2] },
    { model: 'rock_c', at: [25, 0, -14], yaw: 2.1, scale: B * 1.1, solid: [1.8, 1, 1.8] },
    { model: 'rock_a', at: [23, 0, -19.5], yaw: 1, scale: B },
    { model: 'rock_c', at: [-20, 0, 30], yaw: 1.4, scale: B * 1.6, solid: [2.6, 1.4, 2.6] },
    { model: 'rock_a', at: [-15, 0, 31], yaw: 0.3, scale: B * 1.2 },
    { model: 'rock_c', at: [18, 0, 31], yaw: 2.4, scale: B, solid: [1.7, 0.9, 1.7] },
    // Hills beyond the cliff, and out to sea.
    { model: 'mountain', at: [-22, 0, -50], yaw: 0.3, scale: 14 },
    { model: 'mountain', at: [6, 0, -56], yaw: 1.6, scale: 17 },
    { model: 'mountain', at: [30, 0, -48], yaw: 2.9, scale: 13 },
    { model: 'mountain', at: [-70, -2, 30], yaw: 0.5, scale: 9 },
    { model: 'mountain', at: [75, -2, 10], yaw: 2, scale: 10 },
    ...ring([-20, -14], 7.5, Math.PI / 2 + 0.25),
    ...fenceLine([20, 18], [20, 28]),
    ...fenceLine([-24, 6], [-24, 14]),
    ...trees,
  ],
  spawns: {
    start: { at: [0, 0.15, 42], yaw: Math.PI },
    gate: { at: [0, 0, -28.5], yaw: 0 },
    ring: { at: [-14.5, 0, -13], yaw: -Math.PI / 2 },
  },
  enemies: [{ type: 'dummy', name: 'ring', at: [-24, 0, -18], yaw: 0.6 }],
  npcs: [
    { id: 'ina', at: [3.2, 0, -26], yaw: -2.6 },
    { id: 'bram', at: [12.2, 0, 4.6], yaw: -Math.PI / 2 },
    { id: 'wren', at: [-17.5, 0, 27.5], yaw: Math.PI * 0.8 },
    { id: 'dorran', at: [-13, 0, -9], yaw: -2.2 },
  ],
  objects: [
    { id: 'hearth_gate', at: [0, 0, -34.2] },
    { id: 'satchel', at: [22.8, 0, -15.6], yaw: 0.7 },
  ],
  exits: [{ to: 'halls', spawn: 'start', at: [0, 1.5, -39.5], size: [4, 3, 2], behind: 'hearth_gate' }],
  triggers: [{ id: 'ring', at: [-20, 1.5, -14], size: [13, 3, 13] }],
  markers: { ring_a: [-22, 0, -18], ring_b: [-17, 0, -19], ring_c: [-24, 0, -12], ring_d: [-19, 0, -9] },
};
