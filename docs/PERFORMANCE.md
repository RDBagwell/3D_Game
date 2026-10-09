# Performance

The budget the game is held to, what has been measured so far (and on
what), and how to measure on real devices.

**Read this first:** every number below was measured in headless Chromium
in a cloud container, where WebGL is rendered **in software** (SwiftShader,
on the CPU). Sizes, draw calls, triangles and the simulation's CPU time are
meaningful there. **Frame rates and frame times are not**: software rendering
is tens of times slower than any real GPU. Real-device measurements are
Robert's to do, with the steps at the end; nothing here claims the game runs
at 60 fps on a phone.

## The budget

| What | Budget | Why |
| --- | --- | --- |
| Initial download, compressed | ≤ 15 MB | Playable within seconds on a phone connection; a portfolio visitor won't wait |
| Frame rate | 60 fps on a mid-range phone (a 2022 Android around the Pixel 6a / Galaxy A54 class, or an iPhone 12) | Combat timing is designed at 60 Hz; the simulation stays at 60 Hz regardless, but a lower frame rate hurts reading telegraphs |
| Draw calls | ≤ 250 per frame, including the shadow pass | Mobile GPUs and WebGL drivers are bound by draw calls long before triangles |
| Triangles | ≤ 150,000 per frame | Comfortable on mid-range mobile GPUs |
| Simulation | ≤ 2 ms per 60 Hz step on desktop (so it stays well under a phone's frame) | The simulation runs up to 5 steps in a slow frame |

## Measured

Command, after `npm run build`:

```sh
node tools/measure.mjs
```

It serves the build with `vite preview`, loads it in headless Chromium,
records every file requested before the title screen, starts a new game,
samples `renderer.info` in six views (the village at each quality preset,
a fight in the Hearth Halls, the Warden's chamber, the lab), and times 600
simulation steps in the Switch Hall with its enemies coming for you.

> Measured 2026-10-09: headless Chromium 141.0.7390.37, **SwiftShader
> (software WebGL)**, Intel Xeon @ 2.80 GHz × 4 (cloud container), Node 22.22.0.

### Download

Everything is loaded before the title screen (so moving between areas never
waits on the network).

| File | Raw | Gzipped |
| --- | --- | --- |
| `assets/index-*.js` (game, Three.js, Rapier with its WebAssembly inlined) | 3.77 MB | 1.32 MB |
| The knight and three skeletons (warrior, minion, mage), 0.61–0.68 MB each | 2.60 MB | 0.71 MB |
| Four villagers, 0.21–0.22 MB each | 0.85 MB | 0.37 MB |
| 46 small models (village and dungeon scenery, weapons, the dummy and props), CSS, HTML | 0.74 MB | 0.49 MB |
| **Total** | **7.96 MB** | **2.89 MB** |

Within the 15 MB budget either way. Session 1 shipped 8.37 MB for one level
and two characters; the whole adventure is now smaller, because the
importer strips unused animation clips (the knight went from 2.02 MB to
0.61 MB; docs/ASSETS-TODO.md).

Time to the title screen from the local preview server: 1.1 s (no network,
so this says nothing about real loading times).

### Rendering

Draw calls and triangles include the shadow pass where there is one. The
fps and frame-time columns are SwiftShader numbers and are only there to be
honest about what the run showed: **they mean nothing for a real GPU**.

| View | Draw calls | Triangles | fps (software) | Frame ms (software) |
| --- | --- | --- | --- | --- |
| Village square, High | 149 | 104,491 | 2 | 433 |
| Village square, Medium | 149 | 104,491 | 3 | 350 |
| Village square, Low (no shadows) | 81 | 50,379 | 3 | 367 |
| Hearth Halls, a fight in the Switch Hall, High | 140 | 128,523 | 3 | 333 |
| The Warden's chamber, High | 119 | 105,260 | 4 | 233 |
| Training grounds, lab open with every debug view, High | 150 | 55,166 | 0 | 2,233 |

All within budget (≤ 250 draw calls, ≤ 150,000 triangles). Medium differs
from High in shadow-map size and resolution, not in what's drawn, so its
counts match.

Two problems this measurement found and fixed before these numbers:

- **The Hearth Halls drew 176,433 triangles**, over budget: every kind of
  dungeon piece was one instanced mesh spanning the whole dungeon, so none
  of it was ever culled, and rooms past the fog were still drawn. Pieces are
  now instanced per room, and indoors the camera stops drawing at 38 m, just
  past the fog, where nothing can be seen anyway.
- **GPU memory grew with every area change**: each cloned character's
  skeleton keeps a bone texture on the GPU, and leaving an area never freed
  them (about ten per character; 126 textures per visit to the halls). Areas
  now free their skeletons, shadow maps and own geometry when you leave, and
  a smoke test (`tests/e2e/smoke.spec.js`) checks that round trips between
  the village and the halls leave texture counts unchanged.

### Simulation (CPU)

600 steps of the full `Sandbox.step` in the Switch Hall (input buffer, the
AI of the room's cindermites and adept, the character controllers, Rapier,
projectiles, combat, camera), timed inside the page: **mean 0.28 ms, 95th
percentile 0.70 ms per step; Rapier's `world.step` 0.04 ms** of that.
Within the 2 ms budget on this CPU. A phone CPU will be slower; as an
unmeasured rule of thumb, even five times slower would still fit.

### Where the cost is, and the levers

- **Quality presets** (Settings → Graphics, `src/game/data/quality.js`):
  Low has no shadows, a pixel ratio of 1, a 95 m view and 40% of the
  particles; phones and tablets start on Low, small computers on Medium.
- **Shadows** double the draw calls outdoors (one directional light, its
  shadow box following the player). The halls have no shadow-casting light.
- **Torch lights** in the halls are capped per preset (3, 5 or 8 lit).
- **Scenery is instanced**: one draw call per model per room, however many
  wall pieces.
- **Characters** are the biggest triangle cost (about 5,000 to 6,700 each)
  and about ten meshes each; merging their parts would cut draw calls
  further if a phone needs it.
- **Particles** and **debug lines** are one draw call each.

## Measuring on real devices (for Robert)

The performance HUD is built in: open the lab and tick **Performance**, or
add `?lab&show=perf` to the address (F3 toggles it too). It shows fps, the
average and worst frame time over a quarter second, draw calls, triangles
and the physics step time.

1. **Build and serve it on your network:** `npm run build`, then
   `npx vite preview --host`; open the printed network address on the phone
   (same Wi-Fi). Or use the GitHub Pages URL once it's deployed.
2. **Android (Chrome):** enable USB debugging, connect, open
   `chrome://inspect` on the desktop, and use the **Performance** panel
   (record 10 seconds of fighting) alongside the in-game HUD.
3. **iPhone (Safari):** Settings → Safari → Advanced → Web Inspector on;
   connect to a Mac, Safari → Develop → *the phone* → the page; use the
   **Timelines** tab.
4. **Desktop:** Chrome DevTools → Performance, with CPU throttling at 4×
   for a rough mobile approximation.

Fill in this table for each device (three places, about 20 seconds each,
note the HUD's fps and worst frame):

| Device | Browser | Quality | Village square fps / worst ms | Switch Hall fight fps / worst ms | Warden fight fps / worst ms | Load time on 4G / Wi-Fi | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

What to look for: worst frames over 33 ms during hits (shader compilation
on first use shows up as a one-off spike: note it but don't chase it),
thermal slow-down after a few minutes on a phone, and whether the touch
controls stay responsive. If a mid-range phone misses 60 fps, the first
levers are: the Low preset (already the default on touch devices), then
fewer torch lights, then merging character meshes.

## Not measured

- Anything on a real GPU, a phone, or Safari.
- Real network loading (CDN, latency, whether Pages gzips `.glb`).
- Gamepad models: tested only with simulated standard-mapping pads in unit
  tests; no physical Xbox, PlayStation or Switch controller has been
  connected.
- Rumble: `vibrationActuator` is called where it exists; whether a given
  pad and browser actually rumble is untested.
