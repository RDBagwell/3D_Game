# Assets

Every non-code file in the repository, where it came from and its licence.
Read this before publishing anything.

Each file is marked:

- **keep**: its source and licence are known, and it may sit in a public
  repository and ship in the game;
- **replace**: it can't ship (copied from a commercial game, or a licence
  that doesn't allow it) and was removed, with what replaced it;
- **unknown**: nobody has confirmed where it came from. It doesn't ship; it
  stays out of `public/` until Robert confirms its source.

## Robert's own work (`art/blender/`)

The 2024 prototype's Blender scenes and their glTF exports. They were in
`public/` (so every build deployed 69 MB of sources); they now live in
`art/blender/`, which Vite never serves or copies. The game doesn't load any
of them. The exports are kept because `tests/blenderNames.test.js` reads the
real node names in `world0.glb` to check the naming convention
([docs/BLENDER.md](docs/BLENDER.md)).

| File | What | Source | Licence | Status |
| --- | --- | --- | --- | --- |
| `art/blender/character/character.blend`, `character2.blend` | The 2024 hero: helmet, spear, round shield, Mixamo rig | Modelled by Robert | Robert's own | keep (not shipped) |
| `art/blender/mob1/mob1.blend` | Sword-and-shield soldier enemy, Mixamo rig | Modelled by Robert | Robert's own | keep (not shipped) |
| `art/blender/mob2/mob2.blend` | Slime enemy | Modelled by Robert | Robert's own | keep (not shipped) |
| `art/blender/world/world.blend`, `world0.blend`, `world1.blend`, `world2.blend`, `world2b.blend`, `world2b.blend1` | Test levels with `collider*` and `area_<surface>_` meshes (`.blend1` is Blender's automatic backup) | Built by Robert | Robert's own | keep (not shipped) |
| `art/blender/character/color.png`, `color.jpg`, `normal.png`, `normal.jpg` | The hero's 2048² colour and normal maps | Unknown: painted, generated or downloaded? | Unknown | **unknown**: please confirm. The colour map has a green tunic, pointed ears and a blue round shield; even if it's original, that reads as Link's trade dress, so it shouldn't be the public face of this game |
| `art/blender/mob1/color.png`, `color.jpg`, `normal.png`, `normal.jpg` | The soldier's 2048² maps (red and gold armour) | Unknown | Unknown | **unknown**: please confirm |
| `art/blender/world/color1-4.png`, `color1-4.jpg`, `normal1-4.jpg` | Grass, dirt-path, rock, wood, stone and sign textures (one sign has an EXIT label) | Unknown | Unknown | **unknown**: please confirm |
| `art/blender/exports/character.glb`, `mob1.glb`, `mob2.glb`, `world.glb`, `world0.glb`, `world1.glb`, `world2.glb`, `world2b.glb` | glTF exports of the scenes above (they embed the textures above) | Exported by Robert from Blender 3.4 / 4.0 | Robert's own, plus the unknown textures | keep (not shipped) |

**About the animations in `character` and `mob1`.** Their rigs use
`mixamorig:` bone names, so the animations (attack, roll, idle_shield,
straf...) almost certainly came from Adobe Mixamo. Mixamo animations may be
used inside a game, but Adobe's terms don't allow redistributing them as
standalone files, which a public repository arguably does. Another reason
these exports stay out of `public/`.

## Third-party models (`art/models/`)

| File | What | Source | Licence | Status |
| --- | --- | --- | --- | --- |
| `art/models/RobotExpressive.glb` (was `public/glb/character2.glb`) | The Three.js example robot, 14 animations | [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive): model by Tomás Laulhé ([Quaternius](https://quaternius.com)), modifications by Don McCurdy | CC0 1.0 (from the example's README: "CC0 1.0") | keep (credit given here; not loaded by the game) |

## Removed in the asset audit

Removed in the commit that added this file. They are still in git history
(tag `v1-original`); the pull request has optional commands to purge them.

**Images (`public/image/`)**

| File | What | Why it went | Status |
| --- | --- | --- | --- |
| `sprite_ui.png` | Full, half and empty hearts and a green rupee | Nintendo's *Zelda* HUD icons | replace: the HUD draws its own health bar and has no currency icon |
| `gamepad.png` | Photo of an Xbox One controller with orange call-outs | A Microsoft product image of unknown origin | replace: control hints are drawn by the game for the device in use |
| `tech.png` | Rapier, three.js and JavaScript logos | Third-party logos (trademarks), unknown origin | replace: the README names the tools instead |
| `sky.jpg` | Blue sky with clouds | Unknown origin | replace: the sky is a gradient drawn in code |

**Favicons**

| File | What | Why it went | Status |
| --- | --- | --- | --- |
| `favicon.ico`, `public/favicon.ico`, `public/glb/favicon.ico` | Three identical 64×64 icons: a black cat's head on a pink-to-blue disc | Unknown origin | replace: `public/favicon.svg`, drawn for this project |

**Music (`public/sound/`)**

| File | What | Why it went | Status |
| --- | --- | --- | --- |
| `AddingTheSun.mp3` | 1 min 25 s instrumental | Probably Kevin MacLeod's "Adding the Sun" (CC BY 4.0), but the file has no tags and could not be checked against the original from this session, so it couldn't be confirmed | replace: Robert's own music goes in `public/music/`. To bring it back, confirm it on [incompetech.com](https://incompetech.com) and add the CC BY credit line the site gives to this file and the title screen |
| `ambient.mp3` | 54 s ambience loop | Unknown origin | replace (Robert's music) |
| `danger.mp3` | 49 s tense loop | Unknown origin; the name matches *Zelda*'s low-health / danger cues | replace (Robert's music) |

**Sound effects (`public/sound/`)**

All 63 effects were removed. The names and contents match *The Legend of
Zelda* (Link's voice and the series' jingles). None of them has a recorded
source, so the ones that sound generic, such as the footsteps, go too:
"unknown" can't ship in a public portfolio game.

| Files | What | Why it went | Status |
| --- | --- | --- | --- |
| `get_rubis.wav`, `get_rubis2.wav`, `get_heart.wav`, `heart.wav`, `secret.wav` | Rupee, heart and secret-found jingles | Nintendo-derived | replace: no pickups in session 1; session 2 uses generated cues |
| `attack1-4.wav`, `yell.wav`, `rollvoice1-3.wav`, `cry.wav`, `death.wav`, `fall.wav`, `jump.wav`, `push.wav`, `hit_player.wav` | The hero's voice: attack shouts, roll grunts, hurt, death, falling | Nintendo-derived (Link's voice) | replace: the hero has no voice; actions have generated sounds |
| `focus.wav`, `cancel.wav`, `shield.wav`, `shieldout.wav` | Lock-on (Z-targeting) and shield sounds | Nintendo-derived | replace: generated lock-on and shield sounds |
| `sword1.wav`, `sword2.wav`, `cut.wav`, `roll.wav`, `break.wav`, `drop.wav` | Sword swings, grass cut, roll, pot break, item drop | Nintendo-derived | replace: generated swing, hit and roll sounds |
| `attack_mob.wav`, `hit_mob.wav` | Enemy attack and hurt | Nintendo-derived | replace: generated sounds |
| `hit_iron1-3.wav`, `hit_wood1-3.wav` | Sword hitting metal and wood | Unknown origin (likely the same game) | replace: generated hit and block sounds |
| `step_dirt1-4.wav`, `step_grass1-4.wav`, `step_iron1-3.wav`, `step_stone1-4.wav` (with `b`/`c` variants), `step_wood1-2.wav`, `steps_wood.wav` | Footsteps by surface | Unknown origin | replace: generated footsteps per surface (the surface system itself is kept) |

## Adding an asset

Add a row here in the same commit, with the real source URL and licence
(quote it: pages change). Prefer CC0 or CC-BY art, and write the attribution
text CC-BY requires. Check that the licence lets the files sit in a public
repository: this one is public.
