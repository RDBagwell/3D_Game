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
records every file requested before the title screen, samples
`renderer.info` in three views, and times 600 simulation steps.

> Measured 2026-10-08: headless Chromium 141.0.7390.37, **SwiftShader
> (software WebGL)**, Intel Xeon @ 2.80 GHz × 4 (cloud container), Node 22.22.0.

### Download

| File | Raw | Gzipped |
| --- | --- | --- |
| `assets/index-*.js` (game, Three.js, Rapier with its WebAssembly inlined) | 3.63 MB | 1.28 MB |
| `models/skeleton_warrior.glb` | 2.62 MB | 0.54 MB |
| `models/knight.glb` | 2.02 MB | 0.40 MB |
| Six small models, CSS, HTML | 0.10 MB | 0.07 MB |
| **Total** | **8.37 MB** | **2.28 MB** |

Within budget either way: 2.3 MB if the host gzips everything, about 6 MB if
it only gzips JavaScript and CSS (GitHub Pages compresses text types; not
verified here whether it compresses `.glb`). The two characters are mostly
animation: they carry all 76 and 95 of their clips; stripping the unused ones
would roughly halve them (see docs/ASSETS-TODO.md).

Time to the title screen from the local preview server: 0.7 s (no network,
so this says nothing about real loading times).

### Rendering

| View | Draw calls | Triangles | fps (software-rendered) | Frame ms (software-rendered) |
| --- | --- | --- | --- | --- |
| Training grounds, facing the dummy | 158 | 55,154 | 4 | 283 |
| Arena, three grunts fighting | 130 | 52,390 | 4 | 250 |
| Lab open, every debug view on | 127 | 52,468 | 4 | 267 |

Draw calls and triangles are within budget; they include the shadow pass.
The fps and frame-time columns are SwiftShader numbers and are only there
to be honest about what the run showed: they mean nothing for a real GPU.

### Simulation (CPU)

600 steps of the full `Sandbox.step` (input buffer, three grunts' AI,
four character controllers, Rapier, combat, camera), timed inside the page:
**mean 0.36 ms, 95th percentile 0.90 ms per step; Rapier's `world.step`
0.05 ms** of that. Within budget on this CPU. A phone CPU will be slower; as an
unmeasured rule of thumb, even five times slower would still fit.

### Where the cost is, and what's already done

- **Shadows** double the draw calls: one directional light, a 2048² shadow
  map on desktop and 1024² on touch devices, with a 32 m box that follows
  the player.
- **Pixel ratio** is capped at 2 on desktop and 1.5 on touch devices, and
  anti-aliasing is off on touch devices.
- **Debug lines** (the lab's views) are one draw call however much is shown.
- **Particles** are one draw call (a single point cloud).
- **Characters** are about ten meshes each (body parts and accessories);
  merging them would cut draw calls further if a phone needs it.

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

Fill in this table for each device (three views, about 20 seconds each,
note the HUD's fps and worst frame):

| Device | Browser | Training grounds fps / worst ms | Arena fight fps / worst ms | Lab open, all views fps / worst ms | Load time on 4G / Wi-Fi | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

What to look for: worst frames over 33 ms during hits (shader compilation
on first use shows up as a one-off spike: note it but don't chase it),
thermal slow-down after a few minutes on a phone, and whether the touch
controls stay responsive. If a mid-range phone misses 60 fps, the first
levers are: shadows off or 512² on touch devices, pixel ratio 1.0, then
merging character meshes.

## Not measured

- Anything on a real GPU, a phone, or Safari.
- Real network loading (CDN, latency, whether Pages gzips `.glb`).
- Gamepad models: tested only with simulated standard-mapping pads in unit
  tests; no physical Xbox, PlayStation or Switch controller has been
  connected.
- Rumble: `vibrationActuator` is called where it exists; whether a given
  pad and browser actually rumble is untested.
