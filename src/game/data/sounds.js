import { noise, tone } from '../../engine/index.js';

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
    caption: '[Grunt spots you]',
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
};

/** Surfaces that have their own footstep sound. */
export const SURFACES = ['grass', 'dirt', 'stone', 'wood'];
