/**
 * The game-feel lab's settings: every technique that can be switched or
 * tuned while playing, with a one-sentence "What this does" for someone who
 * has never made a game, and the presets.
 *
 *   id        the key in code, saved settings and shared URLs (never rename one)
 *   group     the lab's section
 *   type      'bool' | 'range'
 *   default   the "Polished" value
 *   min/max/step/unit   for ranges
 *   what      the "What this does" sentence shown under the control
 *
 * Read by src/game/feel/feelSettings.js (validation, presets, URL sharing)
 * and src/game/lab/LabPanel.js (the panel). docs/GAME-FEEL.md explains each
 * one in depth.
 */

/**
 * @typedef {object} FeelDef
 * @property {string} id
 * @property {string} group
 * @property {string} label
 * @property {'bool' | 'range'} type
 * @property {number | boolean} default
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string} [unit]
 * @property {string} what
 */

export const FEEL_GROUPS = ['Movement', 'Combat', 'Camera', 'Animation', 'Feedback'];

/** @type {FeelDef[]} */
export const FEEL_SETTINGS = [
  // Movement
  { id: 'accelTime', group: 'Movement', label: 'Acceleration', type: 'range', default: 0.1, min: 0, max: 0.6, step: 0.02, unit: 's',
    what: 'How long the hero takes to reach full speed; 0 starts instantly, which feels robotic, and long times feel like running on ice.' },
  { id: 'decelTime', group: 'Movement', label: 'Deceleration', type: 'range', default: 0.08, min: 0, max: 0.6, step: 0.02, unit: 's',
    what: 'How long the hero takes to stop after you let go; a short skid reads as weight, a long one as sliding.' },
  { id: 'turnSpeed', group: 'Movement', label: 'Turn speed', type: 'range', default: 900, min: 90, max: 3600, step: 30, unit: '°/s',
    what: 'How fast the hero swings round to face a new direction; at the maximum they snap instantly.' },
  { id: 'coyoteFrames', group: 'Movement', label: 'Coyote time', type: 'range', default: 6, min: 0, max: 15, step: 1, unit: 'frames',
    what: 'You can still roll for a moment after running off a ledge, like a cartoon coyote that hasn\'t looked down yet.' },
  { id: 'rollBuffer', group: 'Movement', label: 'Roll buffering', type: 'range', default: 8, min: 0, max: 20, step: 1, unit: 'frames',
    what: 'A roll pressed slightly too early (while still swinging or landing) is remembered and happens as soon as it can.' },

  // Combat
  { id: 'comboBuffer', group: 'Combat', label: 'Combo input buffer', type: 'range', default: 10, min: 0, max: 24, step: 1, unit: 'frames',
    what: 'An attack pressed during the previous swing is remembered, so mashing gives a smooth combo instead of dropped presses.' },
  { id: 'hitstopScale', group: 'Combat', label: 'Hit-stop', type: 'range', default: 1, min: 0, max: 3, step: 0.1, unit: '×',
    what: 'The fight freezes for a few frames when a blow lands, which makes hits feel heavy instead of passing through.' },
  { id: 'knockbackScale', group: 'Combat', label: 'Knockback', type: 'range', default: 1, min: 0, max: 3, step: 0.1, unit: '×',
    what: 'How far a hit pushes its target, showing the force of the blow and giving you room after a combo.' },
  { id: 'rollIframes', group: 'Combat', label: 'Roll invulnerability', type: 'range', default: 12, min: 0, max: 26, step: 1, unit: 'frames',
    what: 'For part of a roll, attacks pass through you, so dodging through a swing with good timing works.' },
  { id: 'cancelWindows', group: 'Combat', label: 'Attack-cancel windows', type: 'bool', default: true,
    what: 'Late in a swing you may roll out of it, so committing to an attack isn\'t a death sentence.' },
  { id: 'aimAssist', group: 'Combat', label: 'Lock-on aim assist', type: 'range', default: 0.6, min: 0, max: 1, step: 0.05,
    what: 'When you start a swing, the hero turns a little towards the nearest enemy, so near-misses become hits.' },
  { id: 'telegraph', group: 'Combat', label: 'Enemy telegraphs', type: 'bool', default: true,
    what: 'Enemies glow, show a shrinking ring and make a rising sound before they strike, so every hit can be seen coming.' },

  // Camera
  { id: 'cameraSmoothing', group: 'Camera', label: 'Follow smoothing', type: 'range', default: 0.12, min: 0, max: 0.6, step: 0.02, unit: 's',
    what: 'The camera eases after the hero instead of being bolted on, which hides small jitters but lags if set too high.' },
  { id: 'lookAhead', group: 'Camera', label: 'Look-ahead', type: 'range', default: 1.2, min: 0, max: 3, step: 0.1, unit: 'm',
    what: 'The view leads the hero in the direction they\'re running, so you see where you\'re going, not where you\'ve been.' },
  { id: 'cameraCollision', group: 'Camera', label: 'Collision avoidance', type: 'bool', default: true,
    what: 'The camera moves in front of walls instead of going through them; switch it off and back into the wall.' },
  { id: 'lockFraming', group: 'Camera', label: 'Lock-on framing', type: 'bool', default: true,
    what: 'While locked on, the camera swings round to keep both you and your target in view.' },
  { id: 'shake', group: 'Camera', label: 'Shake', type: 'range', default: 1, min: 0, max: 2, step: 0.1, unit: '×',
    what: 'A short shake on big hits sells their impact; too much is tiring, and it\'s always capped and off with reduced motion.' },

  // Animation
  { id: 'crossFade', group: 'Animation', label: 'Cross-fade blending', type: 'range', default: 0.12, min: 0, max: 0.4, step: 0.02, unit: 's',
    what: 'Animations blend into each other over this time; at 0 they snap from one pose to the next.' },

  // Feedback
  { id: 'hitFlash', group: 'Feedback', label: 'Hit flash', type: 'bool', default: true,
    what: 'Whatever you hit flashes white for an instant, so you know at a glance that it connected.' },
  { id: 'cameraNudge', group: 'Feedback', label: 'Camera nudge', type: 'bool', default: true,
    what: 'The view kicks a few centimetres in the direction of the blow, so you feel which way it went.' },
  { id: 'particles', group: 'Feedback', label: 'Particles', type: 'bool', default: true,
    what: 'Sparks fly where the sword connects and dust puffs up under rolls and landings.' },
  { id: 'hitSounds', group: 'Feedback', label: 'Impact sounds', type: 'bool', default: true,
    what: 'Swings whoosh and hits crunch; sound is half of what makes a hit feel like a hit.' },
  { id: 'positionalSound', group: 'Feedback', label: 'Positional sound', type: 'bool', default: true,
    what: 'Sounds come from where they happen, so you can hear an enemy winding up behind you.' },
  { id: 'surfaceFootsteps', group: 'Feedback', label: 'Footsteps by surface', type: 'bool', default: true,
    what: 'Footsteps sound different on grass, dirt, stone and wood; off, every step makes the same tap.' },
  { id: 'rumble', group: 'Feedback', label: 'Controller rumble', type: 'bool', default: true,
    what: 'The gamepad buzzes on hits, where the browser and pad support it.' },
];

/**
 * Presets: values that differ from Polished (the defaults). "Raw" turns
 * every technique off; Floaty and Twitchy are two common mistakes.
 */
export const FEEL_PRESETS = {
  polished: {
    label: 'Polished',
    what: 'Everything on, tuned. The default.',
    values: {},
  },
  raw: {
    label: 'Raw',
    what: 'Every technique off. Hit the dummy and feel how stiff, weightless and unfair it gets.',
    values: {
      accelTime: 0, decelTime: 0, turnSpeed: 3600, coyoteFrames: 0, rollBuffer: 0,
      comboBuffer: 0, hitstopScale: 0, knockbackScale: 0, rollIframes: 0, cancelWindows: false, aimAssist: 0, telegraph: false,
      cameraSmoothing: 0, lookAhead: 0, cameraCollision: false, lockFraming: false, shake: 0,
      crossFade: 0,
      hitFlash: false, cameraNudge: false, particles: false, hitSounds: false, positionalSound: false, surfaceFootsteps: false, rumble: false,
    },
  },
  floaty: {
    label: 'Floaty',
    what: 'A common mistake: long acceleration, slow turns, a lazy camera and no hit-stop. Everything feels like it\'s underwater.',
    values: {
      accelTime: 0.5, decelTime: 0.55, turnSpeed: 210, hitstopScale: 0, knockbackScale: 0.5, aimAssist: 0.2,
      cameraSmoothing: 0.5, lookAhead: 2.6, shake: 0.2, crossFade: 0.38,
    },
  },
  twitchy: {
    label: 'Twitchy',
    what: 'The opposite mistake: instant everything, a rigid camera, huge shake and knockback. Responsive, but harsh and hard to read.',
    values: {
      accelTime: 0, decelTime: 0, turnSpeed: 3600, rollBuffer: 2, comboBuffer: 2, hitstopScale: 0.3, knockbackScale: 2.4,
      rollIframes: 6, aimAssist: 0, cameraSmoothing: 0, lookAhead: 0, shake: 2, crossFade: 0,
    },
  },
};

/**
 * What the lab can draw. Not game feel, so not part of the presets, but saved
 * and shared the same way.
 */
export const SHOW_SETTINGS = [
  { id: 'colliders', label: 'Colliders', what: 'Every physics shape: the level\'s collision and each character\'s capsule.' },
  { id: 'boxes', label: 'Hitboxes and hurtboxes', what: 'Red spheres are a sword\'s hitbox, only while it can hurt; cyan capsules are what can be hurt (grey while invulnerable).' },
  { id: 'states', label: 'State machine', what: 'The hero\'s current state, what it may change to, and the last few changes.' },
  { id: 'buffer', label: 'Input buffer', what: 'The last two seconds of presses: when each was pressed and when the game used it.' },
  { id: 'camera', label: 'Camera target and probe', what: 'Where the camera aims, and the sphere it sweeps towards itself to avoid walls (orange when it hits).' },
  { id: 'perf', label: 'Performance', what: 'Frames per second, frame time, draw calls, triangles and physics time.' },
  { id: 'damage', label: 'Damage numbers', what: 'How much each hit on the training dummy did.' },
];

/** Simulation speed choices (slow motion makes frame data visible). */
export const SPEEDS = [1, 0.5, 0.25];
