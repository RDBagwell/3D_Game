# Audio

Everything you hear except music is synthesised in the browser (Web Audio),
so the game ships no sound files. Music is Robert's: drop the tracks below
into `public/music/` and they play; until then the game is silent where
they'd be, with no errors and no failed requests.

## Music

Put Ogg Vorbis files in `public/music/` with exactly these names. The build
lists whatever is there (`vite.config.js`, `virtual:music-tracks`), so
there's nothing else to register.

| File | Plays | Length | Loop |
| --- | --- | --- | --- |
| `title.ogg` | Title screen, and behind the save slots and credits until a game starts | 1–2 min | Seamless loop |
| `village.ogg` | Cinder Cove (and the game-feel lab's training grounds) | 2–3 min | Seamless loop |
| `dungeon.ogg` | The Hearth Halls | 2–3 min | Seamless loop; quieter, sparser than the village |
| `boss.ogg` | The moment the Cinder Warden wakes, until it falls (or you do) | 1.5–2.5 min | Seamless loop; it may play for a long time |
| `victory.ogg` | Once when the Warden falls (then the Halls' track returns), and under the ending and credits | 20–60 s | Plays once after the boss; loops under the credits, so a gentle ending that loops well is best |

**Loop points.** Tracks loop from their last sample back to their first,
so export each loop with no silence at either end, cut on the beat, and
check the seam (Audacity: select all, Effect → Repeat, listen to the join).
Ogg encoders can add a few milliseconds of padding; if the seam clicks, a
very short fade (5–10 ms) at both ends hides it.

**Format.** Ogg Vorbis, 44.1 kHz stereo, quality 4–5 (about 1 MB a
minute), the same as Island RPG. Safari before 17 can't play Ogg: if that
matters, the MusicManager would need an `.m4a` fallback (not built).

**Cross-fades.** Every change fades out the old track and in the new one
over 1.5 s (`MusicManager`). Changes happen on: the title screen, arriving
in an area (its `music` in `src/game/data/areas/`), the boss waking, the
boss falling, and the ending.

**Credit.** Add a row for each file to `ASSETS.md` (the asset test fails
until you do) and, if anyone else made it, a line in its Credits table.

## Sound effects

All in `src/game/data/sounds.js`, each a short recipe of filtered noise and
oscillators. Positional sounds go through an HRTF panner (so a wind-up
behind you sounds behind you); the listener is the camera.

| Group | Sounds |
| --- | --- |
| Combat | swings, hits (flesh, heavy, wood), blocks, dodges, rolls, hurt, death, lock-on, wind-ups (grunt, cindermite, adept, Warden), bolts cast, fizzling and cut down, the Warden waking, roaring and getting its axe stuck |
| Footsteps | by surface: grass, dirt, stone, wood, sand (from the level's `area_<surface>_` zones) |
| World | gates grinding open, the crystal switch ringing, hearthstones, drinking a tonic, buying |
| UI | menu moves and confirms, dialogue, quest updates and completions |

Cues that matter for play carry a caption (Settings → Captions), e.g.
"[The Warden raises its axe]".

## Ambience

A looping bed per kind of place, cross-faded over 2 s when you change area
(`AMBIENCE` in `sounds.js`, played by `src/engine/audio/Ambience.js`):

| Bed | Where | What |
| --- | --- | --- |
| `shore` | Cinder Cove | Waves rolling in and out, a breeze |
| `meadow` | Training grounds | Soft wind |
| `halls` | The Hearth Halls | A low hum, slow air, and now and then a drip |

Ambience plays through the effects volume.
