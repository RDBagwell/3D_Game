/**
 * The player's and enemies' numbers: speeds, health, timings. Frames are
 * simulation updates (60 a second). Attacks are in attacks.js.
 *
 * Enemies all use the same body (enemies/Enemy.js) and one of three brains,
 * chosen by `brain`:
 *
 *   melee   GruntBrain: notice, chase, circle, wait for the attack token,
 *           approach, wind up (telegraphed), strike, recover. Grunts and
 *           cindermites differ only in these numbers.
 *   caster  CasterBrain: keep its distance, back away when you close in,
 *           wind up a visible cast, throw a slow bolt you can roll through,
 *           block, or cut out of the air.
 *   warden  WardenBrain: the boss's two phases (see that file).
 *
 * `token` limits how many of a group may attack at once (grunts: one at a
 * time; cindermites: two). `heavy` enemies aren't knocked back or
 * interrupted by hits.
 */

export const PLAYER = {
  maxHp: 100,
  /** Capsule size for physics and the hurtbox. */
  radius: 0.35,
  height: 1.7,
  runSpeed: 6.2,
  strafeSpeed: 4.3,
  shieldSpeed: 2.3,
  roll: {
    frames: 26,
    /** m/s at the start; it eases out over the roll. */
    speed: 10.5,
    /** First invulnerable frame. The lab's "roll i-frames" slider sets how many follow. */
    iframesFrom: 2,
    /** From this frame a buffered attack or roll may interrupt the end of the roll. */
    actFrom: 20,
  },
  /** Shield blocks attacks within this many degrees either side of straight ahead. */
  blockHalfAngle: 65,
  /** Push back when blocking, as a fraction of the attack's knockback. */
  blockPush: 0.45,
  /** Frames on the floor after a knockdown, then getting up (invulnerable throughout). */
  knockdownFrames: 64,
  /** Seconds before respawning in the training grounds. */
  respawnSeconds: 2.5,
  /** Distance between footsteps while running, metres. */
  stride: 1.55,
  /** Drinking a tonic: how long it takes, when it heals, and the walking speed meanwhile. */
  drink: { frames: 54, effectFrame: 30, speed: 1.3 },
};

export const ENEMIES = {
  grunt: {
    name: 'Grunt',
    brain: 'melee',
    maxHp: 60,
    poise: 24,
    radius: 0.38,
    height: 1.75,
    walkSpeed: 2.1,
    runSpeed: 3.8,
    /** Notices the player within this distance and field of view (degrees, total)... */
    sightRange: 11,
    sightFov: 150,
    /** ...or this close whatever the direction ("hears" them). */
    hearRange: 3.2,
    /** Gives up beyond this distance. */
    loseRange: 20,
    /** Keeps this far away while waiting its turn, strafing round the player. */
    circleDistance: 3.4,
    /** Starts its wind-up within this distance. */
    attackRange: 1.95,
    attack: 'gruntChop',
    /** Frames between attacks (random in this range). */
    cooldown: [50, 110],
    /** Chance of raising its shield when the player starts an attack in front of it. */
    blockChance: 0.35,
    blockFrames: 34,
    blockHalfAngle: 70,
    hitstunFrames: 14,
    staggerFrames: 50,
    /** Turn rate while winding up (degrees per second): it tracks you, but slowly... */
    windupTurn: 140,
    /** ...and stops tracking this many frames before the hit, so a late roll works. */
    commitFrames: 9,
    respawnSeconds: 6,
    /** Shells it leaves when beaten. */
    shells: 6,
    token: { group: 'grunt', max: 1 },
  },
  mite: {
    name: 'Cindermite',
    brain: 'melee',
    maxHp: 16,
    poise: 6,
    radius: 0.3,
    height: 1.0,
    walkSpeed: 3.4,
    runSpeed: 5.6,
    sightRange: 12,
    sightFov: 220,
    hearRange: 4.5,
    loseRange: 22,
    circleDistance: 2.6,
    attackRange: 1.45,
    attack: 'miteBite',
    cooldown: [36, 80],
    blockChance: 0,
    blockFrames: 0,
    blockHalfAngle: 0,
    hitstunFrames: 14,
    staggerFrames: 30,
    windupTurn: 240,
    commitFrames: 6,
    respawnSeconds: 6,
    shells: 2,
    token: { group: 'mite', max: 2 },
  },
  adept: {
    name: 'Ash Adept',
    brain: 'caster',
    maxHp: 34,
    poise: 12,
    radius: 0.36,
    height: 1.75,
    walkSpeed: 2.3,
    runSpeed: 3.6,
    sightRange: 15,
    sightFov: 170,
    hearRange: 4,
    loseRange: 24,
    /** Keeps between these distances from you, metres... */
    keepAway: [5.5, 10],
    /** ...and backs away faster when you're closer than this. */
    fleeRange: 3.6,
    cast: 'cinderBolt',
    /** Wind-up before each bolt (frames): the staff glows and the warning shows. */
    castFrames: 44,
    castRecovery: 26,
    cooldown: [80, 140],
    blockChance: 0,
    blockFrames: 0,
    blockHalfAngle: 0,
    hitstunFrames: 16,
    staggerFrames: 54,
    windupTurn: 160,
    commitFrames: 10,
    respawnSeconds: 6,
    shells: 5,
    token: { group: 'adept', max: 1 },
  },
  warden: {
    name: 'Cinder Warden',
    brain: 'warden',
    heavy: true,
    maxHp: 360,
    poise: 9999,
    radius: 0.75,
    height: 2.6,
    walkSpeed: 2.0,
    /** Faster than you strafe while locked on (4.3), slower than you run (6.2). */
    runSpeed: 4.6,
    sightRange: 13,
    sightFov: 360,
    hearRange: 13,
    loseRange: 40,
    /** Picks an attack within this distance (it keeps stepping in while it winds up)... */
    attackRange: 4.0,
    /** ...and if you keep out of reach this long (frames), it charges. */
    patience: 210,
    chargeSpeed: 6.4,
    /** Below this fraction of health, phase two (once, with a roar). */
    phaseTwoAt: 0.5,
    /** Frames its axe stays stuck after the slam: the opening (phase one, two). */
    stuckFrames: [125, 100],
    /** Damage it takes while its axe is stuck (the weak point), and otherwise (armour). */
    weakPoint: 2,
    armour: 0.6,
    /** Frames between attacks (phase one, two). */
    rest: [50, 30],
    /** Phase two recovers this many frames sooner from each attack. */
    quickerRecovery: { wardenSweep: 8 },
    /** The roar into phase two: invulnerable, calls cindermites to these markers. */
    roarFrames: 96,
    summon: { type: 'mite', at: ['summon_a', 'summon_b', 'summon_c'] },
    windupTurn: 110,
    commitFrames: 10,
    hitstunFrames: 0,
    staggerFrames: 0,
    respawnSeconds: 0,
    // Its reward is in the Hearth Halls' data (the `defeat` effects), not paid per kill.
    shells: 0,
    token: { group: 'warden', max: 1 },
  },
  dummy: {
    name: 'Training dummy',
    maxHp: 9999,
    poise: 9999,
    radius: 0.42,
    height: 1.7,
  },
};
