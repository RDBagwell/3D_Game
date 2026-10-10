import { noise, tone, noiseBuffer } from '../../engine/index.js';

/**
 * Every sound effect, as a Web Audio recipe (see src/engine/audio/synth.js).
 * No recorded files: each sound is built from filtered noise and oscillators
 * when it plays, with a little random variation so repeats don't sound
 * mechanical.
 *
 *   caption   shown as a subtitle when it plays (Settings → Captions), for
 *             cues that matter to gameplay: you might need to know a grunt
 *             is winding up behind you without hearing it.
 *
 * Footsteps are `step_<surface>` (grass, dirt, stone, wood), chosen from the
 * level's `area_<surface>_` zones; `step_plain` is used when the lab switches
 * surface footsteps off, and for unknown surfaces.
 */

/** @type {Record<string, import('../../engine/audio/AudioManager.js').SoundDef>} */
export const SOUNDS = {
  swing: {
    volume: 0.55,
    recipe: (ctx, out, t, rng) => {
      noise(ctx, out, t, { duration: 0.16, filter: 'bandpass', from: 700 + rng() * 300, to: 3600, q: 1.4, volume: 0.6, attack: 0.03 });
    },
  },
  swing_heavy: {
    volume: 0.6,
    recipe: (ctx, out, t, rng) => {
      noise(ctx, out, t, { duration: 0.24, filter: 'bandpass', from: 450 + rng() * 150, to: 2400, q: 1.2, volume: 0.7, attack: 0.05 });
    },
  },
  hit: {
    volume: 0.9,
    recipe: (ctx, out, t, rng) => {
      // A crunchy transient, a low thump and a short ring.
      noise(ctx, out, t, { duration: 0.09, filter: 'highpass', from: 1800, to: 900, volume: 0.8 });
      tone(ctx, out, t, { type: 'sine', from: 160 + rng() * 30, to: 55, duration: 0.18, volume: 0.9 });
      tone(ctx, out, t, { type: 'triangle', from: 900 + rng() * 200, to: 700, duration: 0.07, volume: 0.15 });
    },
  },
  hit_heavy: {
    volume: 1,
    recipe: (ctx, out, t, rng) => {
      noise(ctx, out, t, { duration: 0.14, filter: 'lowpass', from: 4000, to: 600, volume: 0.9 });
      tone(ctx, out, t, { type: 'sine', from: 120 + rng() * 20, to: 40, duration: 0.3, volume: 1 });
    },
  },
  hit_wood: {
    volume: 0.8,
    recipe: (ctx, out, t, rng) => {
      noise(ctx, out, t, { duration: 0.06, filter: 'bandpass', from: 1200, to: 800, q: 3, volume: 0.6 });
      tone(ctx, out, t, { type: 'triangle', from: 320 + rng() * 40, to: 220, duration: 0.12, volume: 0.6 });
    },
  },
  hurt: {
    volume: 0.8,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'sawtooth', from: 300, to: 120, duration: 0.2, volume: 0.25 });
      noise(ctx, out, t, { duration: 0.12, filter: 'lowpass', from: 2000, to: 400, volume: 0.6 });
    },
  },
  parry: {
    caption: '[Parried]',
    volume: 0.9,
    recipe: (ctx, out, t) => {
      // A bright, clean ring, higher and longer than a block.
      for (const [f, v] of [[880, 0.3], [1320, 0.2], [2640, 0.1]]) tone(ctx, out, t, { type: 'sine', from: f, duration: 0.6, volume: v });
      noise(ctx, out, t, { duration: 0.05, filter: 'highpass', from: 4000, volume: 0.6 });
    },
  },
  charged: {
    caption: '[The sword hums, charged]',
    volume: 0.6,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', from: 330, to: 660, duration: 0.35, volume: 0.22, attack: 0.05 });
      tone(ctx, out, t + 0.12, { type: 'sine', from: 990, duration: 0.3, volume: 0.15 });
    },
  },
  boss_stomp_windup: {
    caption: '[The Warden raises a foot]',
    volume: 0.9,
    recipe: (ctx, out, t) => {
      // A short, low creak that rises: different from the axe's whine.
      tone(ctx, out, t, { type: 'sawtooth', from: 55, to: 110, duration: 0.45, volume: 0.25, attack: 0.2 });
      noise(ctx, out, t, { duration: 0.45, filter: 'lowpass', from: 200, to: 600, volume: 0.4, attack: 0.2 });
    },
  },
  pillar_break: {
    caption: '[A pillar shatters]',
    volume: 1,
    recipe: (ctx, out, t, rng) => {
      noise(ctx, out, t, { duration: 0.9, filter: 'lowpass', from: 1800, to: 120, volume: 0.8 });
      for (let i = 0; i < 6; i++) noise(ctx, out, t + 0.1 + i * 0.08 + rng() * 0.04, { duration: 0.06, filter: 'bandpass', from: 600 + rng() * 900, volume: 0.35 });
    },
  },
  armored: {
    caption: '[Clang: it keeps coming]',
    volume: 0.8,
    recipe: (ctx, out, t) => {
      // A dull, heavy clank: the blow lands but doesn't stop it.
      for (const [f, v] of [[180, 0.35], [410, 0.2], [930, 0.1]]) tone(ctx, out, t, { type: 'square', from: f, to: f * 0.92, duration: 0.25, volume: v });
      noise(ctx, out, t, { duration: 0.08, filter: 'bandpass', from: 1200, volume: 0.5 });
    },
  },
  flare: {
    caption: '[An ash flare kindles under you]',
    volume: 0.7,
    recipe: (ctx, out, t) => {
      // A rising hiss: get out before it peaks.
      noise(ctx, out, t, { duration: 0.85, filter: 'bandpass', from: 400, to: 2400, volume: 0.45, attack: 0.6 });
      tone(ctx, out, t, { type: 'sine', from: 160, to: 320, duration: 0.85, volume: 0.15, attack: 0.5 });
    },
  },
  fissure: {
    caption: '[The floor cracks open towards you]',
    volume: 0.9,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 0.8, filter: 'lowpass', from: 300, to: 900, volume: 0.6, attack: 0.3 });
      tone(ctx, out, t, { type: 'sawtooth', from: 45, to: 70, duration: 0.8, volume: 0.2, attack: 0.3 });
    },
  },
  flare_burst: {
    volume: 0.8,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 0.4, filter: 'lowpass', from: 2400, to: 300, volume: 0.7 });
      tone(ctx, out, t, { type: 'sawtooth', from: 120, to: 50, duration: 0.3, volume: 0.25 });
    },
  },
  shells: {
    volume: 0.5,
    recipe: (ctx, out, t, rng) => {
      // Little shells clinking into a pouch.
      for (let i = 0; i < 3; i++) tone(ctx, out, t + i * 0.05, { type: 'sine', from: 1800 + rng() * 600, duration: 0.08, volume: 0.15 });
    },
  },
  crumble: {
    volume: 0.6,
    recipe: (ctx, out, t, rng) => {
      // Bones settling: a dry clatter.
      for (let i = 0; i < 5; i++) noise(ctx, out, t + i * 0.06 + rng() * 0.03, { duration: 0.05, filter: 'bandpass', from: 1500 + rng() * 1500, volume: 0.35 });
    },
  },
  heartbeat: {
    volume: 0.7,
    recipe: (ctx, out, t) => {
      // Lub-dub: two soft, low thumps.
      tone(ctx, out, t, { type: 'sine', from: 70, to: 45, duration: 0.12, volume: 0.5 });
      tone(ctx, out, t + 0.18, { type: 'sine', from: 60, to: 40, duration: 0.14, volume: 0.35 });
    },
  },
  block: {
    volume: 0.8,
    recipe: (ctx, out, t, rng) => {
      // Metal: inharmonic partials that ring.
      const base = 520 + rng() * 60;
      for (const [ratio, vol] of [[1, 0.35], [2.76, 0.2], [5.4, 0.12]]) {
        tone(ctx, out, t, { type: 'sine', from: base * ratio, duration: 0.35, volume: vol });
      }
      noise(ctx, out, t, { duration: 0.04, filter: 'highpass', from: 3000, volume: 0.5 });
    },
  },
  dodge: {
    volume: 0.5,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'sine', from: 900, to: 1500, duration: 0.12, volume: 0.25 });
    },
  },
  roll: {
    volume: 0.6,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 0.3, filter: 'lowpass', from: 900, to: 300, volume: 0.5, attack: 0.04 });
    },
  },
  shield_up: {
    volume: 0.5,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 0.08, filter: 'bandpass', from: 2400, q: 2, volume: 0.4 });
      tone(ctx, out, t, { type: 'triangle', from: 700, to: 640, duration: 0.1, volume: 0.15 });
    },
  },
  lock_on: {
    volume: 0.5,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', from: 660, duration: 0.06, volume: 0.3 });
      tone(ctx, out, t + 0.06, { type: 'triangle', from: 990, duration: 0.09, volume: 0.3 });
    },
  },
  lock_off: {
    volume: 0.4,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', from: 880, to: 520, duration: 0.1, volume: 0.25 });
    },
  },
  windup: {
    caption: '[Grunt winds up]',
    volume: 0.8,
    recipe: (ctx, out, t) => {
      // A rising whine: "something is coming", whatever the colour on screen.
      tone(ctx, out, t, { type: 'sawtooth', from: 180, to: 520, duration: 0.5, volume: 0.18, attack: 0.08 });
      noise(ctx, out, t, { duration: 0.5, filter: 'bandpass', from: 400, to: 1600, q: 4, volume: 0.25, attack: 0.1 });
    },
  },
  noticed: {
    caption: '[An enemy spots you]',
    volume: 0.6,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'square', from: 220, to: 260, duration: 0.12, volume: 0.12 });
    },
  },
  death: {
    volume: 0.8,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 0.6, filter: 'lowpass', from: 1500, to: 120, volume: 0.6 });
      tone(ctx, out, t, { type: 'sine', from: 200, to: 50, duration: 0.6, volume: 0.6 });
    },
  },
  step_grass: {
    volume: 0.35,
    recipe: (ctx, out, t, rng) => noise(ctx, out, t, { duration: 0.09, filter: 'highpass', from: 2500 + rng() * 800, to: 1500, volume: 0.35, attack: 0.01 }),
  },
  step_dirt: {
    volume: 0.4,
    recipe: (ctx, out, t, rng) => noise(ctx, out, t, { duration: 0.08, filter: 'lowpass', from: 900 + rng() * 300, to: 250, volume: 0.6 }),
  },
  step_stone: {
    volume: 0.4,
    recipe: (ctx, out, t, rng) => {
      noise(ctx, out, t, { duration: 0.035, filter: 'bandpass', from: 2200 + rng() * 600, q: 2, volume: 0.6 });
      tone(ctx, out, t, { type: 'sine', from: 140, to: 90, duration: 0.05, volume: 0.25 });
    },
  },
  step_wood: {
    volume: 0.45,
    recipe: (ctx, out, t, rng) => {
      tone(ctx, out, t, { type: 'triangle', from: 210 + rng() * 30, to: 150, duration: 0.09, volume: 0.45 });
      noise(ctx, out, t, { duration: 0.04, filter: 'bandpass', from: 1100, q: 3, volume: 0.3 });
    },
  },
  step_plain: {
    volume: 0.35,
    recipe: (ctx, out, t) => noise(ctx, out, t, { duration: 0.05, filter: 'bandpass', from: 1000, q: 1, volume: 0.4 }),
  },
  ui_move: {
    volume: 0.3,
    recipe: (ctx, out, t) => tone(ctx, out, t, { type: 'triangle', from: 740, duration: 0.04, volume: 0.2 }),
  },
  ui_confirm: {
    volume: 0.35,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', from: 660, duration: 0.05, volume: 0.25 });
      tone(ctx, out, t + 0.05, { type: 'triangle', from: 880, duration: 0.08, volume: 0.25 });
    },
  },
  step_sand: {
    volume: 0.4,
    recipe: (ctx, out, t, rng) => {
      noise(ctx, out, t, { duration: 0.11, filter: 'highpass', from: 2200 + rng() * 500, to: 1400, volume: 0.35, attack: 0.01 });
    },
  },
  // ---- The adventure.
  talk: {
    volume: 0.35,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', from: 520, duration: 0.05, volume: 0.2 });
      tone(ctx, out, t + 0.05, { type: 'triangle', from: 640, duration: 0.07, volume: 0.2 });
    },
  },
  quest: {
    volume: 0.45,
    recipe: (ctx, out, t) => {
      for (const [i, f] of [523, 659, 784].entries()) tone(ctx, out, t + i * 0.08, { type: 'triangle', from: f, duration: 0.18, volume: 0.22 });
    },
  },
  quest_done: {
    volume: 0.5,
    recipe: (ctx, out, t) => {
      for (const [i, f] of [523, 659, 784, 1047].entries()) tone(ctx, out, t + i * 0.09, { type: 'triangle', from: f, duration: 0.3, volume: 0.22 });
    },
  },
  buy: {
    volume: 0.4,
    recipe: (ctx, out, t) => {
      // Shells clinking.
      for (const [i, f] of [1400, 1800, 1600].entries()) tone(ctx, out, t + i * 0.05, { type: 'sine', from: f, to: f * 0.9, duration: 0.07, volume: 0.25 });
    },
  },
  drink: {
    volume: 0.5,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'sine', from: 300, to: 700, duration: 0.25, volume: 0.3 });
      tone(ctx, out, t + 0.12, { type: 'triangle', from: 660, to: 990, duration: 0.3, volume: 0.15 });
    },
  },
  checkpoint: {
    caption: '[The hearthstone glows]',
    volume: 0.5,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 0.6, filter: 'lowpass', from: 400, to: 1800, volume: 0.25, attack: 0.2 });
      tone(ctx, out, t, { type: 'sine', from: 220, to: 330, duration: 0.7, volume: 0.25, attack: 0.2 });
    },
  },
  switch_hit: {
    caption: '[The crystal rings]',
    volume: 0.6,
    recipe: (ctx, out, t) => {
      for (const [i, f] of [1320, 1980, 2640].entries()) tone(ctx, out, t + i * 0.02, { type: 'sine', from: f, duration: 0.9, volume: 0.2 });
    },
  },
  gate: {
    caption: '[A gate grinds open]',
    volume: 0.6,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 1.1, filter: 'lowpass', from: 300, to: 150, volume: 0.7, attack: 0.1 });
      tone(ctx, out, t, { type: 'sawtooth', from: 55, to: 45, duration: 1.1, volume: 0.12 });
    },
  },
  // ---- Cindermites, ash adepts and the Cinder Warden.
  mite_noticed: {
    caption: '[Cindermites chitter]',
    volume: 0.5,
    recipe: (ctx, out, t, rng) => {
      for (let i = 0; i < 3; i++) tone(ctx, out, t + i * 0.05, { type: 'square', from: 900 + rng() * 300, to: 700, duration: 0.04, volume: 0.08 });
    },
  },
  mite_windup: {
    caption: '[A cindermite hisses]',
    volume: 0.5,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 0.3, filter: 'highpass', from: 3000, to: 5000, volume: 0.35, attack: 0.08 });
    },
  },
  cast_windup: {
    caption: '[An adept gathers cinders]',
    volume: 0.6,
    recipe: (ctx, out, t) => {
      noise(ctx, out, t, { duration: 0.7, filter: 'bandpass', from: 300, to: 2400, q: 4, volume: 0.4, attack: 0.5 });
      tone(ctx, out, t, { type: 'sine', from: 180, to: 520, duration: 0.7, volume: 0.15, attack: 0.5 });
    },
  },
  cast: {
    volume: 0.55,
    recipe: (ctx, out, t, rng) => {
      noise(ctx, out, t, { duration: 0.35, filter: 'bandpass', from: 2000 + rng() * 400, to: 500, q: 1.5, volume: 0.55 });
    },
  },
  fizzle: {
    volume: 0.4,
    recipe: (ctx, out, t) => noise(ctx, out, t, { duration: 0.25, filter: 'highpass', from: 4000, to: 2000, volume: 0.35 }),
  },
  deflect: {
    volume: 0.7,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', from: 1500, to: 1100, duration: 0.15, volume: 0.35 });
      noise(ctx, out, t, { duration: 0.12, filter: 'highpass', from: 2500, to: 1500, volume: 0.5 });
    },
  },
  boss_awake: {
    caption: '[The Cinder Warden wakes]',
    volume: 0.9,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'sawtooth', from: 70, to: 45, duration: 1.2, volume: 0.25, attack: 0.3 });
      noise(ctx, out, t, { duration: 1.2, filter: 'lowpass', from: 500, to: 120, volume: 0.6, attack: 0.3 });
    },
  },
  boss_windup: {
    caption: '[The Warden draws its axe back]',
    volume: 0.85,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'sawtooth', from: 60, to: 140, duration: 0.6, volume: 0.22, attack: 0.3 });
      noise(ctx, out, t, { duration: 0.6, filter: 'bandpass', from: 200, to: 900, q: 2, volume: 0.5, attack: 0.3 });
    },
  },
  boss_slam_windup: {
    caption: '[The Warden lifts its axe high]',
    volume: 0.9,
    recipe: (ctx, out, t) => {
      // Lower and longer than the sweep, rising to a held note: the axe goes up, and up.
      tone(ctx, out, t, { type: 'sawtooth', from: 45, to: 180, duration: 0.8, volume: 0.24, attack: 0.5 });
      tone(ctx, out, t, { type: 'square', from: 30, to: 60, duration: 0.8, volume: 0.1, attack: 0.4 });
      noise(ctx, out, t, { duration: 0.8, filter: 'bandpass', from: 120, to: 1400, q: 3, volume: 0.45, attack: 0.5 });
    },
  },
  roar: {
    caption: '[The Warden roars, and the floor cracks]',
    volume: 1,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'sawtooth', from: 90, to: 50, duration: 1.4, volume: 0.35, attack: 0.1 });
      tone(ctx, out, t, { type: 'square', from: 135, to: 70, duration: 1.4, volume: 0.12, attack: 0.1 });
      noise(ctx, out, t, { duration: 1.4, filter: 'lowpass', from: 1200, to: 200, volume: 0.8, attack: 0.1 });
    },
  },
  opening: {
    caption: '[Its axe is stuck: strike the glowing core]',
    volume: 0.7,
    recipe: (ctx, out, t) => {
      tone(ctx, out, t, { type: 'triangle', from: 440, duration: 0.12, volume: 0.25 });
      tone(ctx, out, t + 0.12, { type: 'triangle', from: 660, duration: 0.2, volume: 0.25 });
    },
  },
};

/** Surfaces that have their own footstep sound. */
export const SURFACES = ['grass', 'dirt', 'stone', 'wood', 'sand'];

/**
 * Ambient beds, one per kind of place (each area names its own:
 * data/areas/). Built from looping filtered noise and slow swells; see
 * src/engine/audio/Ambience.js.
 *
 *   shore   waves rolling in and out, a breeze
 *   meadow  soft wind (the training grounds)
 *   halls   a low cave hum, slow air, and now and then a drip
 * @type {Record<string, import('../../engine/audio/Ambience.js').Bed>}
 */
export const AMBIENCE = {
  shore: (ctx, out) => {
    const stops = [swell(ctx, out, { filter: 'lowpass', freq: 520, rate: 0.11, depth: 0.8, level: 0.55 }), swell(ctx, out, { filter: 'highpass', freq: 3500, rate: 0.05, depth: 0.5, level: 0.08 })];
    // A gull now and then: two or three falling cries.
    const gull = () => {
      const t = ctx.currentTime;
      const cries = 2 + Math.floor(Math.random() * 2);
      const pitch = 1500 + Math.random() * 500;
      for (let i = 0; i < cries; i++) tone(ctx, out, t + i * 0.22, { type: 'triangle', from: pitch, to: pitch * 0.62, duration: 0.17, volume: 0.035, attack: 0.02 });
      timer = setTimeout(gull, 6000 + Math.random() * 9000);
    };
    let timer = setTimeout(gull, 3000);
    return () => {
      clearTimeout(timer);
      stops.forEach((s) => s());
    };
  },
  meadow: (ctx, out) => swell(ctx, out, { filter: 'bandpass', freq: 700, rate: 0.07, depth: 0.7, level: 0.25, q: 0.7 }),
  halls: (ctx, out) => {
    const stops = [swell(ctx, out, { filter: 'lowpass', freq: 160, rate: 0.04, depth: 0.3, level: 0.6 }), swell(ctx, out, { filter: 'bandpass', freq: 420, rate: 0.09, depth: 0.6, level: 0.06, q: 2 })];
    // A drip every few seconds, somewhere in the dark.
    const drip = () => {
      const t = ctx.currentTime;
      tone(ctx, out, t, { type: 'sine', from: 1400 + Math.random() * 600, to: 700, duration: 0.09, volume: 0.06 });
      timer = setTimeout(drip, 2500 + Math.random() * 4000);
    };
    let timer = setTimeout(drip, 2000);
    return () => {
      clearTimeout(timer);
      stops.forEach((s) => s());
    };
  },
};

/**
 * Looping noise through a filter, its loudness swelling slowly up and down.
 * @param {AudioContext} ctx
 * @param {AudioNode} out
 * @param {{ filter: BiquadFilterType, freq: number, rate: number, depth: number, level: number, q?: number }} o
 */
function swell(ctx, out, { filter, freq, rate, depth, level, q = 1 }) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = level * (1 - depth / 2);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = (level * depth) / 2;
  lfo.connect(lfoGain).connect(gain.gain);
  source.connect(f).connect(gain).connect(out);
  source.start();
  lfo.start();
  return () => {
    source.stop();
    lfo.stop();
  };
}
