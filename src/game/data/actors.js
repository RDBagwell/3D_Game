/**
 * The player's and enemies' numbers: speeds, health, timings. Frames are
 * simulation updates (60 a second). Attacks are in attacks.js.
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
  },
  dummy: {
    name: 'Training dummy',
    maxHp: 9999,
    poise: 9999,
    radius: 0.42,
    height: 1.7,
  },
};
