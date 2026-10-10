/**
 * The player's and enemies' numbers: speeds, health, timings. Frames are
 * simulation updates (60 a second). Attacks are in attacks.js.
 *
 * Enemies all use the same body (enemies/Enemy.js) and one of three brains,
 * chosen by `brain`:
 *
 *   melee   GruntBrain: notice, chase, circle, wait for a turn from the room's budget,
 *           approach, wind up (telegraphed), strike, recover. Grunts and
 *           cindermites differ only in these numbers.
 *   caster  CasterBrain: keep its distance, back away when you close in,
 *           wind up a visible cast, throw a slow bolt you can roll through,
 *           block, or cut out of the air.
 *   warden  WardenBrain: the boss's two phases (see that file).
 *
 * `threat` is what an enemy's turn to attack costs from the room's shared
 * budget (ENEMY_BUDGET): a grunt (2) and a cindermite (1) may attack
 * together, two grunts may not. The boss has a budget of its own. `heavy`
 * enemies aren't knocked back or interrupted by hits.
 *
 * Senses, shared by every type: they notice you by sight (in range, in
 * their field of view, nothing solid in between) or by hearing (close, any
 * direction). Seen from afar, they hesitate a moment (`suspiciousFrames`)
 * before coming. Noticing you, they call allies within `alertRadius` who can
 * see them. They give up beyond `loseRange` or after `loseSightFrames` out
 * of sight, and walk back to where they started.
 */

/** How much threat (ENEMIES[type].threat) may be attacking at once, per room. */
export const ENEMY_BUDGET = 3;

/** Senses every enemy shares unless its own entry says otherwise. */
const SENSES = { suspiciousFrames: 24, alertRadius: 7, loseSightFrames: 240 };

export const PLAYER = {
  maxHp: 100,
  /** Capsule size for physics and the hurtbox. */
  radius: 0.35,
  height: 1.7,
  runSpeed: 6.2,
  strafeSpeed: 4.3,
  shieldSpeed: 2.3,
  /** Falling off an edge (the fall and land states). */
  fall: {
    /** Frames off the ground before it counts as a fall (so steps down don't). */
    after: 6,
    /** Steering in the air, as a fraction of running. */
    airControl: 0.35,
    /** Frames in the air after which landing takes a moment (Jump_Land). */
    hardAfter: 24,
    landFrames: 10,
    /** Below this height an area's floor, the hero is caught and put back on solid ground. */
    killY: -12,
    /** Damage for falling out of the world (it's still a mistake). */
    fallOutDamage: 10,
  },
  /** Below this speed (m/s) the hero walks rather than runs. */
  walkBelow: 1.4,
  /**
   * How fast (m/s) each locomotion clip carries the knight at normal
   * playback: the clip is sped up or slowed to the hero's real speed, so the
   * planted foot doesn't slide. Measured from the clips (the toes' speed
   * along the ground while they're down, at the game's 0.72 scale).
   */
  clipSpeeds: { Walking_A: 0.55, Walking_Backwards: 0.55, Running_A: 3.07, Running_Strafe_Left: 3.05, Running_Strafe_Right: 3.05 },
  roll: {
    frames: 26,
    /** m/s at the start; it eases out over the roll. */
    speed: 10.5,
    /** First invulnerable frame. The lab's "roll i-frames" slider sets how many follow. */
    iframesFrom: 2,
    /** From this frame a buffered attack or roll may interrupt the end of the roll. */
    actFrom: 20,
  },
  /**
   * The backstep: rolling with no direction held while locked on. A short
   * hop straight back, quicker to recover from than a roll and covering
   * less ground, for slipping out of reach without losing your footing.
   */
  backstep: {
    frames: 18,
    speed: 7.5,
    iframesFrom: 1,
    /** At most this many invulnerable frames (and never more than the lab's roll i-frames). */
    iframes: 8,
    actFrom: 13,
  },
  /** Shield blocks attacks within this many degrees either side of straight ahead. */
  blockHalfAngle: 65,
  /** Push back when blocking, as a fraction of the attack's knockback. */
  blockPush: 0.45,
  /**
   * Blocking isn't free: a blocked blow still takes this fraction of its
   * damage (chip damage, never the last hit point). Arrows and embers don't.
   */
  blockChip: 0.12,
  /** Shield up and not locked on, the hero turns to face where the camera looks, this fast (deg/s). */
  shieldTurnSpeed: 360,
  /**
   * The parry: the first frames of raising the shield. A blow that lands in
   * them staggers the attacker, and a bolt goes back where it came from.
   * Raising it again soon after lowering it gives no window (no tapping).
   */
  parry: { window: 8, cooldown: 30, hitstop: 8 },
  /** Combos: a press this many frames late (or just after the attack ends) takes `pauseNext`. */
  combo: { pauseFrom: 8, pauseWindow: 15 },
  /** Attacking out of a run faster than this fraction of runSpeed is a running thrust. */
  dashFrom: 0.8,
  /** Holding attack through a swing charges the sword: frames to full, and walking speed meanwhile. */
  charge: { frames: 30, walkSpeed: 2 },
  /**
   * Aim assist (the lab's strength scales the turn): enemies within `range`
   * metres and `maxTurnDeg` of where you swing pull the swing towards them,
   * and keep pulling through the wind-up at `trackDegPerSec`.
   */
  aimAssist: { range: 3.2, maxTurnDeg: 75, trackDegPerSec: 300 },
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
    threat: 2,
    ...SENSES,
    /** Chance it follows its chop with a second cut (the chop's `next`). */
    comboChance: 0.4,
    /** After its shield stops a blow: chance it shoves back (`counter`). */
    counterChance: 0.5,
    counter: 'gruntBash',
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
    threat: 1,
    ...SENSES,
    /** From this far (metres, min and max) it may leap at you instead of closing in. */
    leap: { attack: 'miteLeap', range: [2.8, 4.2], cooldown: 200 },
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
    threat: 1,
    ...SENSES,
    /** Sometimes it casts a flare under you instead of a bolt (data/attacks.js HAZARDS)... */
    flare: 'flare',
    flareChance: 0.4,
    /** ...when you're within this range. */
    flareRange: [3, 9],
    /** Chance it sidesteps a swing you start nearby (within `dodgeRange`), and how. */
    dodgeChance: 0.5,
    dodgeRange: 4,
    dodgeFrames: 20,
    dodgeSpeed: 6,
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
    /** Phase two turns faster during its wind-ups. */
    phaseTwoTurn: 1.3,
    commitFrames: 10,
    /** It reads where you are when it picks an attack: */
    choice: {
      /** behind it (more than this many degrees off its front) and this close: a stomp; */
      behindAngle: 110,
      stompRange: 3.6,
      /** this far or further: sometimes (lateSlamChance), the delayed slam; */
      lateSlamFrom: 3.0,
      lateSlamChance: 0.35,
      /** phase two: chance a sweep turns straight into a slam. */
      comboChance: 0.5,
    },
    /** Phase two, from afar: a fissure (HAZARDS.fissure) towards you, half the time instead of the volley. */
    fissure: { hazard: 'fissure', from: 2, step: 1.6, count: 6, stagger: 5 },
    hitstunFrames: 0,
    staggerFrames: 0,
    respawnSeconds: 0,
    // Its reward is in the Hearth Halls' data (the `defeat` effects), not paid per kill.
    shells: 0,
    threat: 1,
    /** Its own budget: its summons don't wait for it, nor it for them. */
    boss: true,
  },
  dummy: {
    name: 'Training dummy',
    maxHp: 9999,
    poise: 9999,
    radius: 0.42,
    height: 1.7,
  },
};
