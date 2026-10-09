# The engine

This is a guide to the code in `src/engine/` and how the game in
`src/game/` sits on it. It's written for Robert, who owns the engine, and
for anyone building the game on top of it. It mirrors Island RPG's
`docs/ENGINE.md`: same rules, same layout, a 3D engine instead of a 2D one.

The engine is plain JavaScript (ES modules) with JSDoc types checked by
`tsc --noEmit` (`npm run typecheck`). It uses Three.js for drawing and
Rapier (`@dimforge/rapier3d-compat`) for collision. Every module is a short
file with a comment at the top saying what it does and why. When this
document and the code disagree, the code wins; please fix the document.

## The rule: engine and game stay separate

```
src/
  engine/   reusable: loop, physics, input, camera, audio, assets, debug... never about knights or grunts
  game/     this game: uses the engine, owns every game rule
  main.js   creates the Game and starts it
```

`src/engine/` never imports from `src/game/`, and `tests/boundary.test.js`
checks it. A second rule keeps the simulation testable: `game/sim`,
`game/player`, `game/enemies` and `game/combat` never import the view, the
UI or the lab, so the whole fight runs in Node.

## Module map

```mermaid
flowchart TD
  main[main.js] --> Game
  subgraph engine [src/engine]
    FixedStepLoop
    Physics --> CharacterBody
    Level --> levelNames
    Input --> InputBuffer
    TouchControls --> Input
    FollowCamera
    CameraShake
    AssetLoader
    Animator
    AudioManager --> synth
    MusicManager --> AudioManager
    StateMachine
    Gizmos
    PerfHud
  end
  subgraph game [src/game]
    Game --> Sandbox
    Game --> WorldView
    Game --> Hud
    Game --> Menus
    Game --> LabPanel
    Sandbox --> Player --> StateMachine
    Sandbox --> Grunt --> GruntBrain --> StateMachine
    Sandbox --> Dummy
    Sandbox --> hitboxes
    Sandbox --> lockOn
    Sandbox --> FollowCamera
    Sandbox --> Level
    WorldView --> CharacterView --> Animator
    WorldView --> Gizmos
  end
```

| Folder | What's in it |
| --- | --- |
| `engine/loop/` | `FixedStepLoop`: 60 Hz simulation, interpolated rendering, catch-up cap, pause when hidden, slow motion |
| `engine/core/` | `StateMachine` (explicit transitions), `EventBus`, `Rng` (seeded), `math.js` (frame-rate independent smoothing), `storage.js` |
| `engine/physics/` | `Physics` (Rapier world, ray and sphere casts), `CharacterBody` (kinematic character controller) |
| `engine/level/` | `Level` (scene graph → colliders, surfaces, spawns, triggers), `levelNames.js` (the Blender naming convention) |
| `engine/input/` | `Input` (actions over keyboard, mouse, gamepads, touch), `InputBuffer`, `TouchControls` |
| `engine/camera/` | `FollowCamera` (orbit, smoothing, look-ahead, collision, lock-on framing, recentre), `CameraShake` |
| `engine/assets/` | `AssetLoader` (meshopt glTF with real progress), `Animator` (one mixer, cross-fades) |
| `engine/audio/` | `AudioManager` (synthesised, positional sound effects), `MusicManager` (cross-fading tracks), `synth.js` |
| `engine/debug/` | `Gizmos` (debug lines in one draw call), `PerfHud` |
| `game/sim/` | `Sandbox`: the whole simulation, one `step(inputFrame)` at a time |
| `game/player/`, `game/enemies/`, `game/combat/` | The hero's state machine, the grunt and its brain, the dummy, hitboxes, lock-on |
| `game/view/` | `WorldView` (renderer, lights, feedback), `CharacterView` (models, animation, flashes, telegraphs), `Effects`, `models.js` |
| `game/ui/`, `game/lab/` | HUD, menus, the game-feel lab panel |
| `game/data/` | All tuning and content: attacks (frame data), actors, the lab's settings and presets, sounds, the asset manifest |

## The game loop

`FixedStepLoop` calls **update** at a fixed 60 Hz and **render** once per
screen refresh, exactly like Island RPG's loop:

```
every animation frame:
  frameTime = time since last frame
  accumulator += frameTime × timeScale         (timeScale < 1 = the lab's slow motion)
  while accumulator ≥ 1/60 and fewer than 5 updates this frame:
      update(1/60)                              ← input, simulation, physics, camera
      accumulator −= 1/60
  if 5 updates ran and time is still owed: drop it (the spiral-of-death guard)
  render(alpha = accumulator / (1/60))          ← draw between the last two states
```

**Why fixed?** Frame data only means something if a frame is always 1/60 s,
physics is only repeatable with a constant step, and the same inputs must
give the same fight on a 30 Hz phone and a 144 Hz monitor.
`tests/fixedStepLoop.test.js` runs the real game at 30, 60, 144 fps and with
uneven frame times and checks that the results are identical to the last
bit.

**Why interpolate?** At 144 Hz most frames run no update at all; drawing
the last state would make motion stutter. Each actor keeps its previous
position (`Sandbox.prev`), the camera keeps its previous pivot and
position, and the view draws `previous + (current − previous) × alpha`.

**The spiral of death.** If updates fall behind (a slow phone, a debugger
pause), each frame owes more updates, which take longer, and the game
freezes. At most 5 updates run per frame; anything still owed is dropped
and counted in `loop.droppedTime`. The game slows down instead of locking
up.

**Hidden tabs.** `loop.pauseWhenHidden(document)`: no updates in the
background, and the time away is forgotten on return.

## The simulation and the view

`Sandbox` (in `game/sim/`) owns the physics world, the level, the player,
the enemies, the camera's simulated state, lock-on and combat. One update:

1. record presses in the input buffer
2. remember positions (for interpolation)
3. if hit-stop is running: count it down, move only the camera, stop here
4. lock-on: acquire, release, switch, break
5. player, then enemies, decide and move (character controller)
6. `physics.step()`
7. hitboxes against hurtboxes: hits, blocks, dodges, hit-stop
8. camera, triggers, respawns

It never draws or plays sound. It **emits events** (`hit`, `block`,
`dodge`, `swing`, `roll`, `footstep`, `windup`, `lockOn`...) and
`WorldView` turns them into flashes, sparks, shake, sound and rumble.
That split is what lets `tests/` run whole fights in Node.

## Physics: the character controller

Characters are Rapier **kinematic** bodies moved by Rapier's character
controller (`CharacterBody`), not dynamic bodies pushed with velocities.
Each update the game decides the movement it wants; the controller returns
the movement that's allowed: it walks up slopes (≤ 46°), climbs steps
(≤ 0.35 m), snaps to the ground going down, and slides along walls. Gravity
is a vertical speed the body keeps itself. There are no dynamic bodies at
all, so the physics is cheap and repeatable.

Rapier is used for movement and for the camera's collision probe
(`physics.sphereCast`). Hitboxes and hurtboxes are plain spheres and
capsules in `game/combat/hitboxes.js`: checked once per update in a known
order, no extra bodies to keep in sync with animations, and trivial to test.

## Levels

`Level.fromScene(root, physics)` turns a scene graph into colliders,
footstep surfaces, spawns and triggers using the Blender naming convention.
The guide is [BLENDER.md](BLENDER.md).

## Input

Game code asks about **actions**, never keys, the same as Island RPG:

```js
const frame = input.sample(dt);           // once per update
if (button(frame, 'attack').pressed) ...
frame.move   // { x, y } -1..1, y = forward (keys, left stick or touch stick)
frame.look   // { x, y } radians to turn the camera this update
```

Bindings map actions to `'key:KeyJ'`, `'mouse:0'`, `'btn:2'` (standard
gamepad mapping) and `'axis:1-'`. The defaults are in `src/game/config.js`;
players remap keyboard keys in **Settings → Controls**, saved in
`localStorage` (`src/game/settings.js`). Any gamepad with the browser's
standard mapping works; the HUD names its buttons (A/B/X/Y, ✕/○/□/△ or the
Switch layout) from the pad's id.

**Touch:** `TouchControls` adds a floating stick (it appears under the left
thumb), camera drag on the right, and thumb-sized buttons. It drives the same
actions. The stick and the drag read fingers from the canvas itself and
ignore the mouse, so nothing invisible ever sits over the game. The controls
follow the pointer actually in use (`Game.listen`): they start on for phones
and tablets, come up as soon as a finger touches a touchscreen laptop, and go
away again when the mouse is used. Settings → touch controls On / Off
overrides that.

**The input buffer** (`InputBuffer`) remembers attack and roll presses for
a few frames so an early press still counts when the action becomes
possible. See [GAME-FEEL.md](GAME-FEEL.md).

## Camera

`FollowCamera` orbits a pivot near the player's chest. Smoothing, look-ahead,
collision avoidance and lock-on framing are each a setting (the lab's Camera
section). Collision sweeps a sphere from the player's head towards where the
camera wants to be and stops short of anything solid; it pulls in instantly
and eases back out. `CameraShake` adds shake and hit nudges only when
drawing, never to the simulated camera, so they can't affect aiming; it is
capped and off with reduced motion.

## Assets and animation

`AssetLoader` loads meshopt-compressed glTFs (made by `npm run assets`)
with a byte-accurate progress bar: the manifest (`src/game/data/assets.js`)
lists each file's size, and `tests/assetManifest.test.js` keeps those sizes
honest. A file that fails to load becomes a placeholder shape.

`Animator` wraps one `AnimationMixer` per character: `play(name, { fade,
duration, loop })` cross-fades from the current clip, and `duration`
stretches a clip to match an attack's frame data.

## Audio

All sound effects are synthesised (`game/data/sounds.js`), so the game
ships no audio files. `AudioManager.play(name, { position })` goes through
an HRTF panner when positional sound is on; the listener follows the camera.
Cues that matter for gameplay carry a caption. `MusicManager.play(name)`
cross-fades to `music/<name>.ogg` if the name is listed in `MUSIC_TRACKS`,
and plays silence otherwise.

## Debugging

- **Tab** opens the game-feel lab, which can show colliders, hitboxes,
  hurtboxes, the camera probe, the state machine, the input buffer and a
  performance HUD.
- **F3** or **`** toggles the performance HUD and colliders together.
- `window.game` is the running game in the browser console:
  `game.sandbox.player.state`, `game.sandbox.step(frame)`, `game.feel`.

---

## How to…

### …add an attack

Add it to `ATTACKS` in `src/game/data/attacks.js` (the header explains every
field), then point a combo step's `next` at it. Run `npm test`: the frame
data test checks it's well formed.

### …add an enemy type

1. Numbers in `ENEMIES` (`src/game/data/actors.js`).
2. A class like `Grunt` (body) and, if it thinks differently, a brain like
   `GruntBrain` with its own transition table. Test the brain with made-up
   perceptions, like `tests/gruntAi.test.js`.
3. A `case` in `Sandbox`'s spawn loop, and a model in `WorldView`.
4. Place it in a level with `spawn_enemy_<type>`.

### …add a game-feel technique to the lab

1. Add a setting to `FEEL_SETTINGS` (`src/game/data/feel.js`) with its
   "What this does" sentence, and its "off" value to the Raw preset.
2. Read it where it applies (`ctx.feel.<id>` in the simulation, or
   `this.feel()` in `WorldView` for feedback). Read it every time it's
   used, so changes apply mid-fight.
3. The lab panel, saving, sharing and validation pick it up automatically.
4. Document it in [GAME-FEEL.md](GAME-FEEL.md).

---

## Known limitations

- **No jump.** The action list has none; coyote time is applied to the roll.
- **Root motion isn't used.** Movement is code-driven (KayKit's clips are
  in place), so the lab has no root-motion switch.
- **One level at a time.** Travel between levels comes in session 2.
- **Hit-stop freezes the whole fight**, not just the two fighters. With
  one fight on screen that reads the same and is simpler.
- **Type checking covers `src/` only**, as in Island RPG.
