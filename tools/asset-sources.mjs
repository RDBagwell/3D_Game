/**
 * Where each shipped model comes from, for `npm run assets`.
 *
 *   file      the source file's name inside the downloaded pack (found by
 *             searching art/incoming/, so the folder layout of a GitHub clone
 *             or an itch.io zip both work)
 *   pack      which pack it is in (only for messages and ASSETS.md)
 *   to        where the optimised copy goes, relative to public/
 *   textureSize  longest side of its texture after resizing. KayKit packs use
 *             one small gradient atlas per pack, so 256 px loses nothing visible.
 *   keep      (characters) the animation clips to keep; the rest are removed
 *
 * Every `to` file must also be listed in ASSETS.md and in
 * src/game/data/assets.js (tests/assetManifest.test.js checks both).
 */

/** @typedef {{ file: string, pack: string, to: string, textureSize: number, keep?: string[] }} AssetSource */

export const PACKS = {
  adventurers: {
    name: 'KayKit Character Pack: Adventurers 1.0',
    url: 'https://kaylousberg.itch.io/kaykit-adventurers',
    git: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0',
  },
  skeletons: {
    name: 'KayKit Character Pack: Skeletons 1.0',
    url: 'https://kaylousberg.itch.io/kaykit-skeletons',
    git: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0',
  },
  prototype: {
    name: 'KayKit Prototype Bits 1.0',
    url: 'https://kaylousberg.itch.io/prototype-bits',
    git: 'https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0',
  },
  dungeon: {
    name: 'KayKit Dungeon Remastered 1.0',
    url: 'https://kaylousberg.itch.io/kaykit-dungeon-remastered',
    git: 'https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0',
  },
  hexagon: {
    name: 'KayKit Medieval Hexagon Pack 1.0',
    url: 'https://kaylousberg.itch.io/kaykit-medieval-hexagon',
    git: 'https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0',
  },
};

/** The clips each kind of character plays (everything else is stripped). */
const KNIGHT_CLIPS = [
  'Idle', 'Running_A', 'Running_Strafe_Left', 'Running_Strafe_Right', 'Walking_Backwards',
  '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop',
  'Dodge_Forward', 'Blocking', 'Hit_A', 'Death_A', 'Death_B', 'Lie_StandUp', 'Use_Item', 'Interact', 'Cheer', 'PickUp',
];
const SKELETON_CLIPS = [
  'Idle', 'Idle_Combat', 'Running_A', 'Running_B', 'Running_Strafe_Left', 'Running_Strafe_Right', 'Walking_Backwards',
  '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', 'Blocking', 'Hit_A', 'Hit_B', 'Death_A',
  'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Summon', 'Unarmed_Melee_Attack_Punch_A', 'Jump_Full_Short', 'Taunt',
];
const VILLAGER_CLIPS = ['Idle', 'Interact', 'Cheer', 'Use_Item'];

/** Scenery: a model per entry, all small (one shared colour atlas per pack). */
const hex = (/** @type {string} */ file, /** @type {string} */ to) => ({ file, pack: 'hexagon', to: `models/village/${to}.glb`, textureSize: 256 });
const dun = (/** @type {string} */ file, /** @type {string} */ to) => ({ file, pack: 'dungeon', to: `models/dungeon/${to}.glb`, textureSize: 256 });

/** @type {AssetSource[]} */
export const SOURCES = [
  { file: 'Knight.glb', pack: 'adventurers', to: 'models/knight.glb', textureSize: 256, keep: KNIGHT_CLIPS },
  { file: 'Skeleton_Warrior.glb', pack: 'skeletons', to: 'models/skeleton_warrior.glb', textureSize: 256, keep: SKELETON_CLIPS },
  { file: 'Skeleton_Mage.glb', pack: 'skeletons', to: 'models/skeleton_mage.glb', textureSize: 256, keep: SKELETON_CLIPS },
  { file: 'Skeleton_Minion.glb', pack: 'skeletons', to: 'models/skeleton_minion.glb', textureSize: 256, keep: SKELETON_CLIPS },
  { file: 'Skeleton_Axe.gltf', pack: 'skeletons', to: 'models/skeleton_axe.glb', textureSize: 256 },
  { file: 'Skeleton_Staff.gltf', pack: 'skeletons', to: 'models/skeleton_staff.glb', textureSize: 256 },
  { file: 'Mage.glb', pack: 'adventurers', to: 'models/npc_mage.glb', textureSize: 256, keep: VILLAGER_CLIPS },
  { file: 'Barbarian.glb', pack: 'adventurers', to: 'models/npc_barbarian.glb', textureSize: 256, keep: VILLAGER_CLIPS },
  { file: 'Rogue_Hooded.glb', pack: 'adventurers', to: 'models/npc_rogue_hooded.glb', textureSize: 256, keep: VILLAGER_CLIPS },
  { file: 'Rogue.glb', pack: 'adventurers', to: 'models/npc_rogue.glb', textureSize: 256, keep: VILLAGER_CLIPS },
  { file: 'Skeleton_Blade.gltf', pack: 'skeletons', to: 'models/skeleton_blade.glb', textureSize: 256 },
  { file: 'Skeleton_Shield_Small_A.gltf', pack: 'skeletons', to: 'models/skeleton_shield.glb', textureSize: 256 },
  { file: 'Dummy_Base.gltf', pack: 'prototype', to: 'models/dummy.glb', textureSize: 256 },
  { file: 'Barrel_A.gltf', pack: 'prototype', to: 'models/barrel.glb', textureSize: 256 },
  { file: 'Box_A.gltf', pack: 'prototype', to: 'models/crate.glb', textureSize: 256 },
  { file: 'target_stand_A.gltf', pack: 'prototype', to: 'models/target_stand.glb', textureSize: 256 },

  // The village (KayKit Medieval Hexagon).
  hex('red/building_home_A_red.gltf', 'home_a'),
  hex('yellow/building_home_B_yellow.gltf', 'home_b'),
  hex('blue/building_home_A_blue.gltf', 'home_c'),
  hex('blue/building_blacksmith_blue.gltf', 'smithy'),
  hex('green/building_tavern_green.gltf', 'tavern'),
  hex('blue/building_well_blue.gltf', 'well'),
  hex('red/building_market_red.gltf', 'market'),
  hex('trees_A_large.gltf', 'trees_a'),
  hex('trees_B_medium.gltf', 'trees_b'),
  hex('tree_single_A.gltf', 'tree'),
  hex('rock_single_A.gltf', 'rock_a'),
  hex('rock_single_C.gltf', 'rock_c'),
  hex('fence_wood_straight.gltf', 'fence'),
  hex('crate_A_big.gltf', 'crate_big'),
  hex('sack.gltf', 'sack'),
  hex('tent.gltf', 'tent'),
  hex('flag_red.gltf', 'flag'),
  hex('wheelbarrow.gltf', 'wheelbarrow'),
  hex('weaponrack.gltf', 'weaponrack'),
  hex('mountain_A_grass_trees.gltf', 'mountain'),
  // The dungeon (KayKit Dungeon Remastered).
  dun('wall.gltf.glb', 'wall'),
  dun('wall_doorway.glb', 'wall_doorway'),
  dun('wall_corner.gltf.glb', 'wall_corner'),
  dun('wall_gated.gltf.glb', 'wall_gated'),
  dun('floor_tile_large.gltf.glb', 'floor'),
  dun('floor_tile_large_rocks.gltf.glb', 'floor_rocks'),
  dun('column.gltf.glb', 'column'),
  dun('pillar_decorated.gltf.glb', 'pillar'),
  dun('torch_mounted.gltf.glb', 'torch'),
  dun('chest.glb', 'chest'),
  dun('chest_gold.glb', 'chest_gold'),
  dun('key.gltf.glb', 'key'),
  dun('banner_red.gltf.glb', 'banner'),
  dun('rubble_large.gltf.glb', 'rubble'),
  dun('barrel_large.gltf.glb', 'barrel'),
  dun('crates_stacked.gltf.glb', 'crates'),
  dun('sword_shield.gltf.glb', 'sword_shield'),
  dun('candle_triple.gltf.glb', 'candles'),
];
