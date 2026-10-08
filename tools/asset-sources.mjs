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
 *
 * Every `to` file must also be listed in ASSETS.md and in
 * src/game/data/assets.js (tests/assetManifest.test.js checks both).
 */

/** @typedef {{ file: string, pack: string, to: string, textureSize: number }} AssetSource */

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
};

/** @type {AssetSource[]} */
export const SOURCES = [
  { file: 'Knight.glb', pack: 'adventurers', to: 'models/knight.glb', textureSize: 256 },
  { file: 'Skeleton_Warrior.glb', pack: 'skeletons', to: 'models/skeleton_warrior.glb', textureSize: 256 },
  { file: 'Skeleton_Blade.gltf', pack: 'skeletons', to: 'models/skeleton_blade.glb', textureSize: 256 },
  { file: 'Skeleton_Shield_Small_A.gltf', pack: 'skeletons', to: 'models/skeleton_shield.glb', textureSize: 256 },
  { file: 'Dummy_Base.gltf', pack: 'prototype', to: 'models/dummy.glb', textureSize: 256 },
  { file: 'Barrel_A.gltf', pack: 'prototype', to: 'models/barrel.glb', textureSize: 256 },
  { file: 'Box_A.gltf', pack: 'prototype', to: 'models/crate.glb', textureSize: 256 },
  { file: 'target_stand_A.gltf', pack: 'prototype', to: 'models/target_stand.glb', textureSize: 256 },
];
