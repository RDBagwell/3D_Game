# Building levels in Blender

This is a guide to making a level for the game in Blender, with no code.
The game reads a level from a glTF file and decides what each object is
from its **name**. Name an object `collider_floor` and it becomes something
to walk on; name an empty `spawn_player` and that's where the hero starts.

The convention is the 2024 prototype's (`collider*` and `area_<surface>_`
still work exactly as before), extended with spawns, triggers and cheaper
box colliders. The parser is `src/engine/level/levelNames.js`, and
`tests/blenderNames.test.js` checks it against the real names in
`art/blender/exports/world0.glb`.

## The names

| Name starts with | What it becomes | Drawn? | Example |
| --- | --- | --- | --- |
| `collider` | Solid ground or wall: the exact triangles of the mesh | No | `collider_cliffs`, `collider1` |
| `collider_box` | Solid box: the object's bounding box (much cheaper than triangles; use for walls, crates, steps) | No | `collider_box_wall_north` |
| `area_<surface>_` | Footstep surface for anything standing inside its bounds | No | `area_stone_plaza`, `area_wood_` |
| `spawn_player` | Where the hero starts (its facing too) | No | `spawn_player` |
| `spawn_player_<name>` | Another place the hero can arrive (doors, docks; session 2) | No | `spawn_player_dock` |
| `spawn_enemy_<type>` | An enemy of that type, facing the way the object faces | No | `spawn_enemy_grunt_a`, `spawn_enemy_dummy` |
| `trigger_<id>` | An invisible box; walking in or out fires the event `<id>` | No | `trigger_arena_gate` (id `arena`) |
| `exit_<area>_<spawn>` | An invisible box; walking in takes you to `<area>`, arriving at its `spawn_player_<spawn>` (no spawn: `start`) | No | `exit_halls`, `exit_village_gate` |
| `npc_<id>` | Where a villager stands and faces (an Empty). Who they are is data: `src/game/data/npcs.js` | No | `npc_ina` |
| `object_<id>` | Where an interactive object stands: gate, door, chest, switch, hearthstone (an Empty). What it does is data: `src/game/data/objects.js` | No (the game draws it) | `object_vault_chest` |
| `marker_<name>` | A named point the game uses: where an encounter's enemies appear, where the boss calls for help | No | `marker_ring_a` |
| anything else | Scenery: drawn, but nothing collides with it | Yes | `house_roof`, `tree.004` |

Rules:

- **Blender's `.001` suffixes are ignored.** Duplicate `collider_box_crate`
  ten times and all ten are crates.
- **Names are not case-sensitive.** `Collider_Floor` works.
- **Everything else in the name is yours.** `area_grass_meadow_north` is
  grass; the rest is just for you.
- **Surfaces the game has sounds for:** `grass`, `dirt`, `stone`, `wood`.
  Anywhere not inside an area counts as grass. A new surface name works
  straight away but plays a plain footstep until it gets its own sound in
  `src/game/data/sounds.js` (`step_<surface>`).
- **Overlapping areas:** the smallest one wins, so a stone path inside a
  big grass area sounds like stone.
- **Enemy types:** `grunt` and `dummy` today (`src/game/data/actors.js`).
- **Trigger ids** are the first word after `trigger_`: `trigger_arena_gate`
  and `trigger_arena_back` both fire `arena`.
- **Exits** name an area id (`village`, `halls`; see
  `src/game/data/areas/index.js`) and a spawn in it. `npm test` fails if an
  exit leads to an area or spawn that doesn't exist.
- **NPCs and objects** are only placed in Blender; their ids must exist in
  `npcs.js` / `objects.js`, which `npm test` checks too.

## The usual pattern: a visible mesh and a collider twin

Most solid things are two objects: the detailed mesh you see (named
anything) and a simple invisible stand-in for collision.

```
house                  <- the pretty model: drawn, not solid
collider_box_house     <- a plain box around it: solid, hidden
```

For ground and slopes, use `collider_…` with a simplified copy of the
terrain (fewer triangles walk just as well). For walls, steps, crates and
pillars, `collider_box_…` is cheaper and its edges are perfectly flat.
Collider objects are hidden by the game, so their material doesn't matter.

Scale, rotation and parenting are all applied: rotate a `collider_box` to
make a ramp, parent colliders under an empty to keep the outliner tidy (a
`collider` empty with meshes under it makes all of them solid).

## What the character can walk on

The character controller (`src/engine/physics/CharacterBody.js`) decides:

| | Value | Where to change it |
| --- | --- | --- |
| Steepest walkable slope | 46° | `maxSlopeDeg` in `CharacterBody` |
| Highest step climbed without slowing | 0.35 m | `stepHeight` in `CharacterBody` |
| Gaps it can snap down without "falling" | 0.35 m | `snapDistance` in `CharacterBody` |
| Hero size | 0.35 m radius, 1.7 m tall | `PLAYER` in `src/game/data/actors.js` |

So: stairs with steps up to 0.3 m, ramps up to about 40°, doorways at
least 0.9 m wide and 2.0 m high. Steeper slopes become slides.

## Exporting

1. **File → Export → glTF 2.0**, format **glTF Binary (.glb)**.
2. Include: **Visible objects** off (hidden helpers must export too),
   **Custom properties** off, **Apply modifiers** on.
3. Transform: **+Y up** (the default).
4. Save it as `art/levels/<name>.glb`, then run it through the asset
   pipeline so it is compressed like the models: add a line to
   `tools/asset-sources.mjs` (`{ file: '<name>.glb', pack: 'robert', to:
   'levels/<name>.glb', textureSize: 1024 }`, plus a `robert` entry in
   `PACKS`) and run `npm run assets -- --incoming art/levels`.
5. Add it to `MODELS` in `src/game/data/assets.js` and a row to `ASSETS.md`.

To play it, swap the level in `Game.start()` (`src/game/Game.js`):

```js
// was: levelRoot: buildTrainingGrounds()
this.sandbox = await Sandbox.create({ levelRoot: models.myLevel.scene, feel: this.feel });
```

Session 2 adds a level list and travel between levels, so this becomes data.

## Checking a level

- Open the game-feel lab (**Tab**) and tick **Colliders**: every solid shape
  is drawn in green, so missing or misnamed colliders show up at once.
- Walk over each surface and listen; or tick **State machine** to see the
  hero's state while you test slopes and steps.
- `npm test` includes a test that loads the training grounds through this
  same code; copy it for a new level to check its spawns and surfaces.

## The training grounds as an example

The combat sandbox is built in code (`src/game/scenes/trainingGrounds.js`)
but with exactly these names, and loaded through the same
`Level.fromScene()` as a Blender export, so it's a working reference:
`ground` + `collider_box_ground`, a rotated `collider_box_ramp`, five
`collider_box_step_*`, `area_stone_*` / `area_wood_*` / `area_dirt_*`,
`spawn_player`, `spawn_enemy_dummy`, three `spawn_enemy_grunt_*` and
`trigger_arena_gate`.

## The village and the Hearth Halls

The two areas of the adventure are data (`src/game/data/areas/village.js`
and `halls.js`), turned into a scene graph with these same names by
`src/game/world/buildArea.js` and then read by `Level.fromScene()`, exactly
like an export. To rebuild one in Blender instead:

1. Model it with the names above (KayKit's packs import into Blender as
   glTF; the dungeon pieces are 4 units, used at 0.75 scale, so 3 m).
2. Keep the ids the data uses: `spawn_player`, `spawn_player_gate`,
   `npc_ina`, `object_hearth_gate`, `exit_halls`... (`npm test` lists any that
   don't match).
3. Export to `public/levels/<area>.glb` and load it as the area's `levelRoot`
   (`Sandbox.create({ levelRoot })`) in place of `buildArea()`.
