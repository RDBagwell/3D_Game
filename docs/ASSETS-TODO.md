# Assets to do

What Robert still needs to supply or download. Everything here is optional
for running the game: anything missing falls back to a placeholder shape or
silence.

## 1. Music (Robert)

Five tracks, all optional: `title`, `village`, `dungeon`, `boss` and
`victory`, as `public/music/<name>.ogg`. [docs/AUDIO.md](AUDIO.md) has when
each plays, how long it should be and how to make it loop. Drop the files in
and they play; nothing to register. Add a row for each to `ASSETS.md`.

## 2. Re-creating `public/models/` from the packs

Already done in this repository: these steps are for re-running
`npm run assets` (say, to change the texture size) or adding models.

1. Download each pack and put it under `art/incoming/` (any folder layout:
   the script searches by file name). `art/incoming/` is git-ignored.

   | Pack | Download | Files used |
   | --- | --- | --- |
   | KayKit Character Pack: Adventurers 1.0 | <https://kaylousberg.itch.io/kaykit-adventurers> or `git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0` | `Knight.glb`, `Mage.glb`, `Barbarian.glb`, `Rogue.glb`, `Rogue_Hooded.glb` |
   | KayKit Character Pack: Skeletons 1.0 | <https://kaylousberg.itch.io/kaykit-skeletons> or `git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0` | `Skeleton_Warrior.glb`, `Skeleton_Mage.glb`, `Skeleton_Minion.glb`, `Skeleton_Blade.gltf`, `Skeleton_Shield_Small_A.gltf`, `Skeleton_Axe.gltf`, `Skeleton_Staff.gltf` |
   | KayKit Prototype Bits 1.0 | <https://kaylousberg.itch.io/prototype-bits> or `git clone https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0` | `Dummy_Base.gltf`, `Barrel_A.gltf`, `Box_A.gltf`, `target_stand_A.gltf` |
   | KayKit Dungeon Remastered 1.0 | <https://kaylousberg.itch.io/kaykit-dungeon-remastered> or `git clone https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0` | walls, floors, torches, chests, banners... (see `tools/asset-sources.mjs`) |
   | KayKit Medieval Hexagon Pack 1.0 | <https://kaylousberg.itch.io/kaykit-medieval-hexagon> or `git clone https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0` | houses, forge, tavern, trees, rocks, fences... (see `tools/asset-sources.mjs`) |

2. Run `npm run assets`. It prints each file's size before and after.
3. Commit the changed files in `public/models/`.

To add a model: add a line to `tools/asset-sources.mjs`, a row to
`ASSETS.md` and an entry to `src/game/data/assets.js`, then run
`npm run assets -- --only <file name>`.

**Animations:** characters keep only the clips the game plays (each
source's `keep` list in `tools/asset-sources.mjs`); the importer removes the
rest before optimising. That took the knight from 2.0 MB to 0.6 MB. To use a
new clip, add its name to the list and re-run `npm run assets`.

## 3. Optional: recorded sound effects

All sounds are synthesised in code today, which keeps the repository free of
licensing questions. If recorded sounds are wanted later, these CC0 packs
fit the style:

| Pack | URL | For |
| --- | --- | --- |
| Kenney: Impact Sounds | <https://kenney.nl/assets/impact-sounds> | Footsteps on grass, wood, stone, plus hits |
| Kenney: RPG Audio | <https://kenney.nl/assets/rpg-audio> | Sword draws, cloth, metal |
| Kenney: Interface Sounds | <https://kenney.nl/assets/interface-sounds> | Menus |

The sound recipes in `src/game/data/sounds.js` are looked up by name, so a
recorded file can replace one recipe at a time.

## 4. Done in session 2

The village (KayKit Medieval Hexagon), the Hearth Halls (KayKit Dungeon
Remastered), the villagers (KayKit Adventurers) and the new enemies (KayKit
Skeletons) are in `public/models/`, listed in `ASSETS.md`. If they ever need
re-importing, both KayKit repositories were reachable with `git clone` from
the build session.
