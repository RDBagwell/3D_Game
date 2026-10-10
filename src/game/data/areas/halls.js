/**
 * The Hearth Halls: the dungeon under the hill (docs/STORY.md).
 *
 *   z =   0   The Ash Steps        hearthstone (checkpoint), three cindermites      ← from the village
 *   z = -21   The Switch Hall      gate north, crystal switch east, an ash adept and two cindermites
 *   z = -42   The Key Vault        two grunts and an adept, the chest with the Hearth Key, the locked door north
 *   z = -60   The antechamber      hearthstone (checkpoint)
 *   z = -86   The Hearth           the Cinder Warden, and the cold Hearth
 *
 * Rooms are KayKit Dungeon Remastered modules, 3 m each (buildArea.js
 * `rooms`). Each room's size is an odd number of modules wide so its doorway
 * (module index n) sits on x = 0, where the corridors run.
 */

/** @typedef {[number, number, number]} V */

/** Wall torches: a model on the wall and a warm light (a few per room; lights cost). */
const torch = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ yaw) => ({ model: 'dun_torch', at: /** @type {V} */ ([x, 1.9, z]), yaw, scale: 0.9 });

/** @type {import('../../world/buildArea.js').AreaDef} */
export const halls = {
  id: 'halls',
  name: 'The Hearth Halls',
  music: 'dungeon',
  ambience: 'halls',
  look: 'halls',
  defaultSurface: 'stone',
  blocks: [
    // One floor under everything (the tiles are only drawn).
    { name: 'floor', size: [44, 1, 116], at: [0, -0.5, -46], material: 'slate', shadow: false },
    { name: 'landing', size: [3, 0.2, 3], at: [0, 0.0, 9], material: 'stone', collide: false },
    // The Switch Hall's dais and the cold Hearth's plinth.
    { name: 'dais', size: [4, 0.3, 4], at: [8, 0.15, -21], material: 'stone' },
    { name: 'hearth_plinth', size: [6, 0.3, 6], at: [0, 0.15, -96], material: 'stone' },
  ],
  rooms: [
    { name: 'steps', at: [0, 0], size: [9, 15], doors: { s: [1], n: [1] } },
    { name: 'corridor_a', at: [0, -10.5], size: [3, 6], open: ['n', 's'] },
    { name: 'switch', at: [0, -21], size: [21, 15], doors: { s: [3] }, gated: { n: [3] } },
    { name: 'corridor_b', at: [0, -31.5], size: [3, 6], open: ['n', 's'] },
    { name: 'vault', at: [0, -42], size: [15, 15], doors: { s: [2] }, gated: { n: [2] }, floor: 'dun_floor_rocks' },
    { name: 'corridor_c', at: [0, -52.5], size: [3, 6], open: ['n', 's'] },
    { name: 'ante', at: [0, -60], size: [9, 9], doors: { s: [1], n: [1] } },
    { name: 'corridor_d', at: [0, -67.5], size: [3, 6], open: ['n', 's'] },
    { name: 'arena', at: [0, -85.5], size: [27, 30], doors: { s: [4] } },
  ],
  surfaces: [{ surface: 'stone', size: [44, 1, 116], at: [0, 0, -46] }],
  props: [
    torch(-4.1, 2, Math.PI / 2), torch(4.1, -4, -Math.PI / 2),
    torch(-10.1, -18, Math.PI / 2), torch(10.1, -25, -Math.PI / 2),
    torch(-7.1, -40, Math.PI / 2), torch(7.1, -44, -Math.PI / 2),
    torch(-4.1, -60, Math.PI / 2),
    torch(-13.1, -80, Math.PI / 2), torch(13.1, -80, -Math.PI / 2), torch(-13.1, -92, Math.PI / 2), torch(13.1, -92, -Math.PI / 2),
    { model: 'dun_banner', at: [-2.5, 0, -27.9], scale: 0.75 },
    { model: 'dun_banner', at: [2.5, 0, -27.9], scale: 0.75 },
    { model: 'dun_barrel', at: [-3, 0, -5.5], yaw: 0.4, scale: 0.55, solid: [1, 1.1, 1] },
    { model: 'dun_crates', at: [3, 0, 5.8], yaw: 0.2, scale: 0.6, solid: [1.3, 1.3, 1.35] },
    { model: 'dun_rubble', at: [-6, 0, -14.8], yaw: 0, scale: 0.6, solid: [4.8, 1.2, 1.2] },
    { model: 'dun_pillar', at: [-5, 0, -21], scale: 0.75, solid: [1.6, 3, 1.2] },
    { model: 'dun_pillar', at: [3, 0, -17], scale: 0.75, solid: [1.6, 3, 1.2] },
    { model: 'dun_sword_shield', at: [0, 1.8, -34.9], yaw: 0, scale: 0.6 },
    { model: 'dun_crates', at: [5.5, 0, -48], yaw: 1.1, scale: 0.6, solid: [1.3, 1.3, 1.35] },
    { model: 'dun_barrel', at: [-5.6, 0, -36.5], yaw: 0.4, scale: 0.55, solid: [1, 1.1, 1] },
    { model: 'dun_candles', at: [-3, 0, -63], scale: 0.9 },
    { model: 'dun_candles', at: [3, 0, -63], scale: 0.9 },
    { model: 'dun_banner', at: [-4, 0, -100.3], scale: 0.9 },
    { model: 'dun_banner', at: [4, 0, -100.3], scale: 0.9 },
  ],
  spawns: {
    start: { at: [0, 0, 5.5], yaw: Math.PI },
    entrance: { at: [0, 0, 2], yaw: Math.PI },
    ante: { at: [0, 0, -58], yaw: Math.PI },
  },
  enemies: [
    { type: 'mite', name: 'steps_a', at: [-2, 0, -4], yaw: 0 },
    { type: 'mite', name: 'steps_b', at: [2, 0, -5], yaw: 0 },
    { type: 'mite', name: 'steps_c', at: [0, 0, -6.5], yaw: 0 },
    { type: 'adept', name: 'switch', at: [6.5, 0, -25], yaw: 0 },
    { type: 'mite', name: 'switch_a', at: [-6, 0, -18], yaw: 0 },
    { type: 'mite', name: 'switch_b', at: [-3, 0, -24], yaw: 0 },
    { type: 'adept', name: 'vault', at: [4.5, 0, -39], yaw: 0, behind: 'hall_gate' },
    { type: 'grunt', name: 'vault_a', at: [-3, 0, -43], yaw: 0, behind: 'hall_gate' },
    { type: 'grunt', name: 'vault_b', at: [3, 0, -45], yaw: 0, behind: 'hall_gate' },
    { type: 'warden', name: 'warden', at: [0, 0, -88], yaw: 0, behind: 'vault_door', unless: { flag: 'warden_defeated' }, defeat: [{ setFlag: 'warden_defeated' }, { giveItem: 'hearth_ember' }, { giveShells: 40 }] },
  ],
  objects: [
    { id: 'hearthstone_steps', at: [2.6, 0, 4] },
    { id: 'hall_switch', at: [8, 0.3, -21] },
    { id: 'hall_gate', at: [0, 0, -28.5] },
    { id: 'vault_chest', at: [-5, 0, -46.5], yaw: Math.PI / 2, behind: 'hall_gate' },
    { id: 'vault_door', at: [0, 0, -49.5], behind: 'hall_gate' },
    { id: 'hearthstone_ante', at: [2.4, 0, -59.5], behind: 'vault_door' },
    { id: 'hearth', at: [0, 0.3, -96], behind: 'vault_door' },
    // The arena's pillars: cover from the Warden, but its slams smash them.
    { id: 'arena_pillar_nw', at: [-8, 0, -78], behind: 'vault_door' },
    { id: 'arena_pillar_ne', at: [8, 0, -78], behind: 'vault_door' },
    { id: 'arena_pillar_sw', at: [-6, 0, -96], behind: 'vault_door' },
    { id: 'arena_pillar_se', at: [6, 0, -96], behind: 'vault_door' },
  ],
  exits: [{ to: 'village', spawn: 'gate', at: [0, 1.5, 9.5], size: [3, 3, 1.6] }],
  triggers: [
    { id: 'steps', at: [0, 1.5, 3], size: [8, 3, 4] },
    { id: 'arena', at: [0, 1.5, -78], size: [26, 3, 14] },
  ],
  markers: { summon_a: [-9, 0, -84], summon_b: [9, 0, -84], summon_c: [0, 0, -76] },
  lights: [
    { at: [0, 2.6, 0] }, { at: [0, 2.6, -21] }, { at: [0, 2.6, -42] }, { at: [0, 2.4, -60] }, { at: [0, 3.4, -82], intensity: 1.6, distance: 26 },
  ],
};
