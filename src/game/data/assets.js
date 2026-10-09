import musicFiles from 'virtual:music-tracks';

/**
 * Every file the game loads, with its size in bytes (for an honest loading
 * bar). tests/assetManifest.test.js checks that each file exists, that its
 * size here is right, and that ASSETS.md lists it, so a missing or
 * unlicensed file can't slip in.
 *
 * After `npm run assets`, update the sizes (the test prints the right ones).
 */

export const MODELS = {
  // Characters and the training grounds' props.
  knight: { url: 'models/knight.glb', bytes: 613736 },
  grunt: { url: 'models/skeleton_warrior.glb', bytes: 681848 },
  gruntBlade: { url: 'models/skeleton_blade.glb', bytes: 11084 },
  gruntShield: { url: 'models/skeleton_shield.glb', bytes: 11712 },
  adept: { url: 'models/skeleton_mage.glb', bytes: 651520 },
  mite: { url: 'models/skeleton_minion.glb', bytes: 664868 },
  wardenAxe: { url: 'models/skeleton_axe.glb', bytes: 12516 },
  adeptStaff: { url: 'models/skeleton_staff.glb', bytes: 25676 },
  npc_mage: { url: 'models/npc_mage.glb', bytes: 210628 },
  npc_barbarian: { url: 'models/npc_barbarian.glb', bytes: 216920 },
  npc_rogue_hooded: { url: 'models/npc_rogue_hooded.glb', bytes: 210412 },
  npc_rogue: { url: 'models/npc_rogue.glb', bytes: 214096 },
  dummy: { url: 'models/dummy.glb', bytes: 42720 },
  barrel: { url: 'models/barrel.glb', bytes: 9048 },
  crate: { url: 'models/crate.glb', bytes: 6020 },
  target: { url: 'models/target_stand.glb', bytes: 8592 },
  // The village (KayKit Medieval Hexagon).
  crate_big: { url: 'models/village/crate_big.glb', bytes: 6236 },
  fence: { url: 'models/village/fence.glb', bytes: 8308 },
  flag: { url: 'models/village/flag.glb', bytes: 5104 },
  home_a: { url: 'models/village/home_a.glb', bytes: 18884 },
  home_b: { url: 'models/village/home_b.glb', bytes: 24672 },
  home_c: { url: 'models/village/home_c.glb', bytes: 18884 },
  market: { url: 'models/village/market.glb', bytes: 43308 },
  mountain: { url: 'models/village/mountain.glb', bytes: 12132 },
  rock_a: { url: 'models/village/rock_a.glb', bytes: 4732 },
  rock_c: { url: 'models/village/rock_c.glb', bytes: 4996 },
  sack: { url: 'models/village/sack.glb', bytes: 5416 },
  smithy: { url: 'models/village/smithy.glb', bytes: 35324 },
  tavern: { url: 'models/village/tavern.glb', bytes: 50136 },
  tent: { url: 'models/village/tent.glb', bytes: 5740 },
  tree: { url: 'models/village/tree.glb', bytes: 5396 },
  trees_a: { url: 'models/village/trees_a.glb', bytes: 21172 },
  trees_b: { url: 'models/village/trees_b.glb', bytes: 15140 },
  weaponrack: { url: 'models/village/weaponrack.glb', bytes: 5112 },
  well: { url: 'models/village/well.glb', bytes: 15440 },
  wheelbarrow: { url: 'models/village/wheelbarrow.glb', bytes: 9684 },
  // The Hearth Halls (KayKit Dungeon Remastered).
  dun_banner: { url: 'models/dungeon/banner.glb', bytes: 6496 },
  dun_barrel: { url: 'models/dungeon/barrel.glb', bytes: 12136 },
  dun_candles: { url: 'models/dungeon/candles.glb', bytes: 7592 },
  dun_chest: { url: 'models/dungeon/chest.glb', bytes: 19344 },
  dun_chest_gold: { url: 'models/dungeon/chest_gold.glb', bytes: 32680 },
  dun_column: { url: 'models/dungeon/column.glb', bytes: 5416 },
  dun_crates: { url: 'models/dungeon/crates.glb', bytes: 29296 },
  dun_floor: { url: 'models/dungeon/floor.glb', bytes: 7308 },
  dun_floor_rocks: { url: 'models/dungeon/floor_rocks.glb', bytes: 10616 },
  dun_key: { url: 'models/dungeon/key.glb', bytes: 6416 },
  dun_pillar: { url: 'models/dungeon/pillar.glb', bytes: 17768 },
  dun_rubble: { url: 'models/dungeon/rubble.glb', bytes: 16804 },
  dun_sword_shield: { url: 'models/dungeon/sword_shield.glb', bytes: 14024 },
  dun_torch: { url: 'models/dungeon/torch.glb', bytes: 9056 },
  dun_wall: { url: 'models/dungeon/wall.glb', bytes: 15408 },
  dun_wall_corner: { url: 'models/dungeon/wall_corner.glb', bytes: 14028 },
  dun_wall_doorway: { url: 'models/dungeon/wall_doorway.glb', bytes: 23664 },
  dun_wall_gated: { url: 'models/dungeon/wall_gated.glb', bytes: 12392 },
};

/**
 * Music tracks the game may request: whatever `public/music/<name>.ogg`
 * files exist when the game is built (vite.config.js lists them). Only these
 * names are ever fetched, so a missing track is silence, not a failed
 * request. docs/AUDIO.md lists the names the game uses.
 * @type {string[]}
 */
export const MUSIC_TRACKS = musicFiles;

/**
 * Tracks that aren't tied to an area (each area names its own in
 * data/areas/: village, dungeon). Silence if a file isn't there.
 * docs/AUDIO.md lists every name, with lengths and loop points.
 */
export const MUSIC = {
  title: 'title',
  boss: 'boss',
  victory: 'victory',
};

/** Every track name the game asks for (docs/AUDIO.md; tests check the two agree). */
export const MUSIC_NAMES = ['title', 'village', 'dungeon', 'boss', 'victory'];

/** The knight's meshes to show; the pack's other weapons and shields are hidden. */
export const KNIGHT_SHOWN = ['1H_Sword', 'Round_Shield'];
export const KNIGHT_HIDDEN = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'];
