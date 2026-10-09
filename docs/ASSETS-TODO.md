# Assets to do

What Robert still needs to supply or download. Everything here is optional
for running the game: anything missing falls back to a placeholder shape or
silence.

## 1. Music (Robert)

The music manager (`src/engine/audio/MusicManager.js`) looks for these files
and plays nothing if one is missing:

| File | When it plays | Notes |
| --- | --- | --- |
| `public/music/title.ogg` | Title screen | Loop |
| `public/music/sandbox.ogg` | Training grounds | Loop; it cross-fades in over 1.5 s |
| `public/music/combat.ogg` | Optional: while a grunt is chasing you | Cross-fades with `sandbox.ogg` |

Ogg Vorbis at 44.1 kHz stereo, about 1 MB a track (the same settings as
Island RPG). Add a row to `ASSETS.md` for each track and add it to
`MUSIC_TRACKS` in `src/game/data/assets.js`. Safari before 17 can't play
Ogg; if that matters, also export `.m4a` and list both.

## 2. Re-creating `public/models/` from the packs

Already done in this repository: these steps are for re-running
`npm run assets` (say, to change the texture size) or adding models.

1. Download each pack and put it under `art/incoming/` (any folder layout:
   the script searches by file name). `art/incoming/` is git-ignored.

   | Pack | Download | Files used |
   | --- | --- | --- |
   | KayKit Character Pack: Adventurers 1.0 | <https://kaylousberg.itch.io/kaykit-adventurers> or `git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0` | `Knight.glb` |
   | KayKit Character Pack: Skeletons 1.0 | <https://kaylousberg.itch.io/kaykit-skeletons> or `git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0` | `Skeleton_Warrior.glb`, `Skeleton_Blade.gltf`, `Skeleton_Shield_Small_A.gltf` |
   | KayKit Prototype Bits 1.0 | <https://kaylousberg.itch.io/prototype-bits> or `git clone https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0` | `Dummy_Base.gltf`, `Barrel_A.gltf`, `Box_A.gltf`, `target_stand_A.gltf` |

2. Run `npm run assets`. It prints each file's size before and after.
3. Commit the changed files in `public/models/`.

To add a model: add a line to `tools/asset-sources.mjs`, a row to
`ASSETS.md` and an entry to `src/game/data/assets.js`, then run
`npm run assets -- --only <file name>`.

**Possible saving:** the knight and the skeleton carry all 76 and 95 of their
animations (about 2 MB each after compression); the game uses about 15 of
each. Stripping unused clips would roughly halve the download. That needs a
small gltf-transform script (the CLI has no "keep these animations" command),
so it's left for when the download size matters.

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

## 4. For session 2 (the village and the dungeon)

| Pack | URL | Why |
| --- | --- | --- |
| KayKit Dungeon Remastered 1.0 | <https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0> (CC0) | Modular walls, floors, stairs, doors, chests for the dungeon |
| KayKit Medieval Hexagon Pack 1.0 | <https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0> (CC0) | Houses, trees and props for the village |
| KayKit Adventurers: Rogue, Mage, Barbarian | Same pack as the knight | Villagers that share the knight's rig and animations |
| Quaternius: Ultimate Nature | <https://quaternius.com> (CC0; check each pack's page) | Trees, rocks, grass |

Both KayKit repositories above were reachable from the build session, so
`git clone` into `art/incoming/` works.
