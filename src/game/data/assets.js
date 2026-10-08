/**
 * Every file the game loads, with its size in bytes (for an honest loading
 * bar). tests/assetManifest.test.js checks that each file exists, that its
 * size here is right, and that ASSETS.md lists it, so a missing or
 * unlicensed file can't slip in.
 *
 * After `npm run assets`, update the sizes (the test prints the right ones).
 */

export const MODELS = {
  knight: { url: 'models/knight.glb', bytes: 2016952 },
  grunt: { url: 'models/skeleton_warrior.glb', bytes: 2623496 },
  gruntBlade: { url: 'models/skeleton_blade.glb', bytes: 11084 },
  gruntShield: { url: 'models/skeleton_shield.glb', bytes: 11712 },
  dummy: { url: 'models/dummy.glb', bytes: 42720 },
  barrel: { url: 'models/barrel.glb', bytes: 9048 },
  crate: { url: 'models/crate.glb', bytes: 6020 },
  target: { url: 'models/target_stand.glb', bytes: 8592 },
};

/**
 * Music tracks the game may request, as `public/music/<name>.ogg`. Empty
 * until Robert adds his tracks (docs/ASSETS-TODO.md): only listed names are
 * ever fetched, so there are no failing requests meanwhile.
 * @type {string[]}
 */
export const MUSIC_TRACKS = [];

/** Which track plays where (silence if it isn't in MUSIC_TRACKS). */
export const MUSIC = {
  title: 'title',
  sandbox: 'sandbox',
  combat: 'combat',
};

/** The knight's meshes to show; the pack's other weapons and shields are hidden. */
export const KNIGHT_SHOWN = ['1H_Sword', 'Round_Shield'];
export const KNIGHT_HIDDEN = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'];
